import supabase from './db-client.js';
import { preflight, getSession, can, audit, roleName } from './_auth.js';

const STATUSES = ['Present', 'Absent', 'Late', 'Excused', 'Half-day'];

async function myTeacherId(me) {
  const { data } = await supabase.from('teachers').select('id').eq('app_user_id', me.id).maybeSingle();
  return data?.id || null;
}
async function myStreamIds(me) {
  const tid = await myTeacherId(me);
  if (!tid) return [];
  const { data: asg } = await supabase.from('teacher_assignments').select('stream_id').eq('teacher_id', tid);
  const { data: home } = await supabase.from('streams').select('id').eq('class_teacher_id', tid);
  return [...new Set([...(asg || []).map((a) => a.stream_id), ...(home || []).map((h) => h.id)])];
}
async function myLearnerIds(me) {
  const role = roleName(me);
  if (role === 'Learner') {
    const { data } = await supabase.from('learners').select('id').eq('app_user_id', me.id).maybeSingle();
    return data ? [data.id] : [];
  }
  if (role === 'Parent/Guardian') {
    const { data: parent } = await supabase.from('parents').select('id').eq('app_user_id', me.id).maybeSingle();
    if (!parent) return [];
    const { data: links } = await supabase.from('learner_parent_links').select('learner_id').eq('parent_id', parent.id);
    return (links || []).map((l) => l.learner_id);
  }
  return null;
}

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    const me = session.profile;
    const canManage = can(me, 'attendance.manage');
    const canMark = canManage || can(me, 'attendance.mark');
    const canView = canMark || can(me, 'attendance.view');
    const scopedLearners = await myLearnerIds(me);

    if (req.method === 'GET') {
      if (!canView && scopedLearners === null) return res.status(403).json({ error: 'Forbidden' });
      if (req.query.summary === '1') {
        if (!canView) return res.status(403).json({ error: 'Forbidden' });
        const { stream_id, month } = req.query;
        if (!stream_id || !month) return res.status(400).json({ error: 'stream_id and month are required' });
        const from = `${month}-01`;
        const to = `${month}-31`;
        const { data, error } = await supabase.from('attendance_records').select('learner_id,date,status,learners(first_name,last_name,admission_no)').eq('stream_id', stream_id).gte('date', from).lte('date', to).order('date');
        if (error) throw error;
        const byLearner = {};
        (data || []).forEach((r) => {
          byLearner[r.learner_id] = byLearner[r.learner_id] || { learner_id: r.learner_id, name: `${r.learners?.first_name || ''} ${r.learners?.last_name || ''}`.trim(), admission_no: r.learners?.admission_no || '', present: 0, absent: 0, late: 0, excused: 0, half: 0, total: 0 };
          const b = byLearner[r.learner_id];
          b.total++;
          if (r.status === 'Present') b.present++;
          else if (r.status === 'Absent') b.absent++;
          else if (r.status === 'Late') b.late++;
          else if (r.status === 'Excused') b.excused++;
          else if (r.status === 'Half-day') b.half++;
        });
        return res.status(200).json(Object.values(byLearner));
      }
      let q = supabase.from('attendance_records').select('*, learners(first_name,last_name,admission_no)').order('date', { ascending: false }).order('id', { ascending: false });
      if (scopedLearners !== null) q = q.in('learner_id', scopedLearners.length ? scopedLearners : [-1]);
      if (req.query.stream_id) q = q.eq('stream_id', req.query.stream_id);
      if (req.query.learner_id) {
        if (scopedLearners !== null && !scopedLearners.includes(Number(req.query.learner_id))) return res.status(403).json({ error: 'Forbidden' });
        q = q.eq('learner_id', req.query.learner_id);
      }
      if (req.query.date) q = q.eq('date', req.query.date);
      if (req.query.from) q = q.gte('date', req.query.from);
      if (req.query.to) q = q.lte('date', req.query.to);
      if (req.query.term_id) q = q.eq('term_id', req.query.term_id);
      q = q.limit(Math.min(Number(req.query.limit) || 500, 2000));
      const { data, error } = await q;
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      if (!canMark) return res.status(403).json({ error: 'Forbidden' });
      const { stream_id, date, records, term_id } = req.body || {};
      if (!stream_id || !date || !Array.isArray(records) || !records.length) return res.status(400).json({ error: 'Stream, date and attendance records are required' });
      if (!canManage) {
        const mine = await myStreamIds(me);
        if (!mine.includes(Number(stream_id))) return res.status(403).json({ error: 'You can only mark attendance for your assigned streams' });
      }
      for (const r of records) {
        if (!STATUSES.includes(r.status)) return res.status(400).json({ error: `Invalid status: ${r.status}` });
      }
      const learnerIds = records.map((r) => r.learner_id);
      const { data: existing } = await supabase.from('attendance_records').select('id,learner_id').eq('stream_id', stream_id).eq('date', date).in('learner_id', learnerIds);
      const existMap = Object.fromEntries((existing || []).map((e) => [e.learner_id, e.id]));
      let saved = 0;
      for (const r of records) {
        const row = { learner_id: r.learner_id, stream_id: Number(stream_id), date, status: r.status, remarks: r.remarks || null, marked_by: me.id, term_id: term_id || null };
        if (existMap[r.learner_id]) {
          const { error } = await supabase.from('attendance_records').update(row).eq('id', existMap[r.learner_id]);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('attendance_records').insert(row);
          if (error) throw error;
        }
        saved++;
      }
      await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'attendance.mark', entityType: 'attendance_records', recordId: stream_id, details: { stream_id, date, count: saved } });
      return res.status(200).json({ ok: true, saved });
    }

    if (req.method === 'DELETE') {
      if (!canManage) return res.status(403).json({ error: 'Forbidden' });
      const id = req.query.id || req.body?.id;
      if (!id) return res.status(400).json({ error: 'Missing record id' });
      const { error } = await supabase.from('attendance_records').delete().eq('id', id);
      if (error) throw error;
      await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'attendance.delete', entityType: 'attendance_records', recordId: id });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API attendance error:', err);
    res.status(500).json({ error: err.message });
  }
}
