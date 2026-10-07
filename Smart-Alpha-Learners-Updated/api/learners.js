import supabase from './db-client.js';
import { preflight, getSession, can, audit, roleName } from './_auth.js';

async function ownLearnerIds(me) {
  const role = roleName(me);
  if (role === 'Parent/Guardian') {
    const { data: parent } = await supabase.from('parents').select('id').eq('app_user_id', me.id).maybeSingle();
    if (!parent) return [];
    const { data: links } = await supabase.from('learner_parent_links').select('learner_id').eq('parent_id', parent.id);
    return (links || []).map((l) => l.learner_id);
  }
  if (role === 'Learner') {
    const { data: learner } = await supabase.from('learners').select('id').eq('app_user_id', me.id).maybeSingle();
    return learner ? [learner.id] : [];
  }
  return null;
}

async function teacherStreamIds(me) {
  const { data: teacher } = await supabase.from('teachers').select('id').eq('app_user_id', me.id).maybeSingle();
  if (!teacher) return [];
  const { data: asg } = await supabase.from('teacher_assignments').select('stream_id').eq('teacher_id', teacher.id);
  const { data: homeroom } = await supabase.from('streams').select('id').eq('class_teacher_id', teacher.id);
  return [...new Set([...(asg || []).map((a) => a.stream_id), ...(homeroom || []).map((h) => h.id)])];
}

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    const me = session.profile;
    const canFull = can(me, 'learners.manage');
    const canEdit = canFull || can(me, 'learners.edit');
    const canView = canEdit || can(me, ['learners.view', 'attendance.mark', 'attendance.view', 'observations.manage']);

    if (req.method === 'GET') {
      if (req.query.id) {
        if (!canView && !['Parent/Guardian', 'Learner'].includes(roleName(me))) return res.status(403).json({ error: 'Forbidden' });
        const scoped = await ownLearnerIds(me);
        if (scoped && !scoped.includes(Number(req.query.id))) return res.status(403).json({ error: 'Forbidden' });
        const { data: learner, error } = await supabase.from('learners').select('*').eq('id', req.query.id).single();
        if (error) throw error;
        const [grades, streams, years, links, comp, obs, att] = await Promise.all([
          supabase.from('grades').select('id,name,code,level_id').eq('id', learner.grade_id).maybeSingle(),
          supabase.from('streams').select('id,name').eq('id', learner.stream_id).maybeSingle(),
          supabase.from('academic_years').select('id,name').eq('id', learner.academic_year_id).maybeSingle(),
          supabase.from('learner_parent_links').select('*, parents(*)').eq('learner_id', learner.id),
          supabase.from('learner_competency_records').select('*, competencies(code,name)').eq('learner_id', learner.id).order('id', { ascending: false }).limit(50),
          supabase.from('learner_observations').select('*, core_values(name)').eq('learner_id', learner.id).order('observation_date', { ascending: false }).limit(50),
          supabase.from('attendance_records').select('status').eq('learner_id', learner.id),
        ]);
        const attRows = att.data || [];
        const present = attRows.filter((a) => ['Present', 'Late'].includes(a.status)).length;
        return res.status(200).json({
          ...learner,
          grade_name: grades.data?.name || '', grade_code: grades.data?.code || '', level_id: grades.data?.level_id || null,
          stream_name: streams.data?.name || '', academic_year_name: years.data?.name || '',
          parents: (links.data || []).map((l) => ({ link_id: l.id, relationship: l.relationship, is_primary: l.is_primary, ...(l.parents || {}) })),
          competency_records: comp.data || [], observations: obs.data || [],
          attendance: { total: attRows.length, present, rate: attRows.length ? Math.round((present / attRows.length) * 100) : null },
        });
      }
      if (!canView && !['Parent/Guardian', 'Learner'].includes(roleName(me))) return res.status(403).json({ error: 'Forbidden' });
      const scoped = await ownLearnerIds(me);
      let q = supabase.from('learners').select('*').order('last_name').order('first_name');
      if (scoped) q = q.in('id', scoped.length ? scoped : [-1]);
      if (req.query.grade_id) q = q.eq('grade_id', req.query.grade_id);
      if (req.query.stream_id) q = q.eq('stream_id', req.query.stream_id);
      if (req.query.status) q = q.eq('status', req.query.status);
      if (req.query.academic_year_id) q = q.eq('academic_year_id', req.query.academic_year_id);
      if (req.query.q) {
        const s = `%${req.query.q}%`;
        q = q.or(`first_name.ilike.${s},last_name.ilike.${s},middle_name.ilike.${s},admission_no.ilike.${s}`);
      }
      q = q.limit(Math.min(Number(req.query.limit) || 200, 1000));
      const { data, error } = await q;
      if (error) throw error;
      if (!data.length) return res.status(200).json([]);
      const [grades, streams] = await Promise.all([
        supabase.from('grades').select('id,name,code'),
        supabase.from('streams').select('id,name'),
      ]);
      const gmap = Object.fromEntries((grades.data || []).map((g) => [g.id, g]));
      const smap = Object.fromEntries((streams.data || []).map((s) => [s.id, s.name]));
      return res.status(200).json(data.map((l) => ({ ...l, grade_name: gmap[l.grade_id]?.name || '', grade_code: gmap[l.grade_id]?.code || '', stream_name: smap[l.stream_id] || '' })));
    }

    if (req.method === 'POST') {
      if (!canFull) return res.status(403).json({ error: 'Forbidden' });
      const b = req.body || {};
      if (!b.admission_no || !b.first_name || !b.last_name || !b.grade_id || !b.stream_id || !b.academic_year_id) {
        return res.status(400).json({ error: 'Admission number, first/last name, grade, stream and academic year are required' });
      }
      const { data: dup } = await supabase.from('learners').select('id').eq('admission_no', b.admission_no).maybeSingle();
      if (dup) return res.status(400).json({ error: 'Admission number already exists' });
      const row = {
        school_id: b.school_id || me.school_id, admission_no: b.admission_no, first_name: b.first_name,
        middle_name: b.middle_name || null, last_name: b.last_name, dob: b.dob || null, gender: b.gender || null,
        grade_id: b.grade_id, stream_id: b.stream_id, academic_year_id: b.academic_year_id,
        admission_date: b.admission_date || null, previous_school: b.previous_school || null,
        status: b.status || 'Active', emergency_contact_name: b.emergency_contact_name || null,
        emergency_contact_phone: b.emergency_contact_phone || null, medical_notes: b.medical_notes || null,
        photo_url: b.photo_url || null, app_user_id: b.app_user_id || null,
      };
      const { data, error } = await supabase.from('learners').insert(row).select('*').single();
      if (error) throw error;
      await audit({ userId: me.id, userEmail: me.email, schoolId: data.school_id, action: 'learners.create', entityType: 'learners', recordId: data.id, details: { admission_no: data.admission_no } });
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const b = req.body || {};
      if (!b.id) return res.status(400).json({ error: 'Missing learner id' });
      if (!canEdit) return res.status(403).json({ error: 'Forbidden' });
      if (canEdit && !canFull && roleName(me) === 'Class Teacher') {
        const myStreams = await teacherStreamIds(me);
        const { data: cur } = await supabase.from('learners').select('stream_id').eq('id', b.id).maybeSingle();
        if (!cur || !myStreams.includes(cur.stream_id)) return res.status(403).json({ error: 'You can only edit learners in your streams' });
      }
      if (b.admission_no) {
        const { data: dup } = await supabase.from('learners').select('id').eq('admission_no', b.admission_no).neq('id', b.id).maybeSingle();
        if (dup) return res.status(400).json({ error: 'Admission number already exists' });
      }
      const patch = { ...b };
      delete patch.id;
      patch.updated_at = new Date().toISOString();
      const { data, error } = await supabase.from('learners').update(patch).eq('id', b.id).select('*').single();
      if (error) throw error;
      await audit({ userId: me.id, userEmail: me.email, schoolId: data.school_id, action: 'learners.update', entityType: 'learners', recordId: b.id });
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      if (!canFull) return res.status(403).json({ error: 'Forbidden' });
      const id = req.query.id || req.body?.id;
      if (!id) return res.status(400).json({ error: 'Missing learner id' });
      await supabase.from('learner_parent_links').delete().eq('learner_id', id);
      await supabase.from('learner_competency_records').delete().eq('learner_id', id);
      await supabase.from('learner_observations').delete().eq('learner_id', id);
      await supabase.from('attendance_records').delete().eq('learner_id', id);
      const { error } = await supabase.from('learners').delete().eq('id', id);
      if (error) throw error;
      await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'learners.delete', entityType: 'learners', recordId: id });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API learners error:', err);
    res.status(500).json({ error: err.message });
  }
}
