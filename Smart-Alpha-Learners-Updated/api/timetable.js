import supabase from './db-client.js';
import { preflight, getSession, can, audit, roleName } from './_auth.js';

function overlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    const me = session.profile;
    const canManage = can(me, 'timetable.manage');
    const canView = canManage || can(me, 'timetable.view');
    if (!canView) return res.status(403).json({ error: 'Forbidden' });

    if (req.method === 'GET') {
      let q = supabase.from('timetable_slots').select('*').order('day_of_week').order('start_time');
      const role = roleName(me);
      if ((role === 'Teacher' || role === 'Class Teacher') && req.query.mine === '1') {
        const { data: t } = await supabase.from('teachers').select('id').eq('app_user_id', me.id).maybeSingle();
        q = q.eq('teacher_id', t?.id || -1);
      }
      if (role === 'Learner') {
        const { data: l } = await supabase.from('learners').select('stream_id').eq('app_user_id', me.id).maybeSingle();
        q = q.eq('stream_id', l?.stream_id || -1);
      }
      if (req.query.stream_id) q = q.eq('stream_id', req.query.stream_id);
      if (req.query.teacher_id) q = q.eq('teacher_id', req.query.teacher_id);
      if (req.query.term_id) q = q.eq('term_id', req.query.term_id);
      const { data, error } = await q.limit(1000);
      if (error) throw error;
      if (!data.length) return res.status(200).json([]);
      const [areas, teachers, streams] = await Promise.all([
        supabase.from('learning_areas').select('id,name,code'),
        supabase.from('teachers').select('id,first_name,last_name'),
        supabase.from('streams').select('id,name,grade_id'),
      ]);
      const amap = Object.fromEntries((areas.data || []).map((a) => [a.id, a]));
      const tmap = Object.fromEntries((teachers.data || []).map((t) => [t.id, `${t.first_name} ${t.last_name}`]));
      const smap = Object.fromEntries((streams.data || []).map((s) => [s.id, s.name]));
      return res.status(200).json(data.map((s) => ({
        ...s, learning_area_name: amap[s.learning_area_id]?.name || '', learning_area_code: amap[s.learning_area_id]?.code || '',
        teacher_name: tmap[s.teacher_id] || '', stream_name: smap[s.stream_id] || '',
      })));
    }

    if (!canManage) return res.status(403).json({ error: 'Forbidden' });

    if (req.method === 'POST') {
      const b = req.body || {};
      if (!b.stream_id || b.day_of_week === undefined || !b.start_time || !b.end_time || !b.learning_area_id || !b.teacher_id || !b.term_id) {
        return res.status(400).json({ error: 'Stream, day, start/end time, learning area, teacher and term are required' });
      }
      if (b.start_time >= b.end_time) return res.status(400).json({ error: 'End time must be after start time' });
      const { data: daySlots } = await supabase.from('timetable_slots').select('*').eq('term_id', b.term_id).eq('day_of_week', b.day_of_week);
      for (const s of daySlots || []) {
        if (s.stream_id === Number(b.stream_id) && overlap(b.start_time, b.end_time, s.start_time, s.end_time)) {
          return res.status(400).json({ error: `Conflict: this stream already has a lesson ${s.start_time}\u2013${s.end_time} on this day` });
        }
        if (s.teacher_id === Number(b.teacher_id) && overlap(b.start_time, b.end_time, s.start_time, s.end_time)) {
          return res.status(400).json({ error: `Conflict: this teacher already has a lesson ${s.start_time}\u2013${s.end_time} on this day` });
        }
      }
      const { data, error } = await supabase.from('timetable_slots').insert({
        stream_id: b.stream_id, term_id: b.term_id, day_of_week: b.day_of_week, start_time: b.start_time,
        end_time: b.end_time, learning_area_id: b.learning_area_id, teacher_id: b.teacher_id, room: b.room || null,
      }).select('*').single();
      if (error) throw error;
      await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'timetable.create', entityType: 'timetable_slots', recordId: data.id });
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const b = req.body || {};
      if (!b.id) return res.status(400).json({ error: 'Missing slot id' });
      if (b.start_time && b.end_time && b.start_time >= b.end_time) return res.status(400).json({ error: 'End time must be after start time' });
      const { data: cur } = await supabase.from('timetable_slots').select('*').eq('id', b.id).single();
      const next = { ...cur, ...b };
      const { data: daySlots } = await supabase.from('timetable_slots').select('*').eq('term_id', next.term_id).eq('day_of_week', next.day_of_week).neq('id', b.id);
      for (const s of daySlots || []) {
        if (s.stream_id === Number(next.stream_id) && overlap(next.start_time, next.end_time, s.start_time, s.end_time)) {
          return res.status(400).json({ error: `Conflict: this stream already has a lesson ${s.start_time}\u2013${s.end_time} on this day` });
        }
        if (s.teacher_id === Number(next.teacher_id) && overlap(next.start_time, next.end_time, s.start_time, s.end_time)) {
          return res.status(400).json({ error: `Conflict: this teacher already has a lesson ${s.start_time}\u2013${s.end_time} on this day` });
        }
      }
      const patch = { ...b };
      delete patch.id;
      const { data, error } = await supabase.from('timetable_slots').update(patch).eq('id', b.id).select('*').single();
      if (error) throw error;
      await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'timetable.update', entityType: 'timetable_slots', recordId: b.id });
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const id = req.query.id || req.body?.id;
      if (!id) return res.status(400).json({ error: 'Missing slot id' });
      const { error } = await supabase.from('timetable_slots').delete().eq('id', id);
      if (error) throw error;
      await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'timetable.delete', entityType: 'timetable_slots', recordId: id });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API timetable error:', err);
    res.status(500).json({ error: err.message });
  }
}
