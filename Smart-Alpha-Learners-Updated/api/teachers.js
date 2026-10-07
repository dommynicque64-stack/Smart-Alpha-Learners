import supabase from './db-client.js';
import { preflight, getSession, can, audit } from './_auth.js';

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    const me = session.profile;
    const canFull = can(me, ['teachers.manage', 'academic.manage']);
    const canView = canFull || can(me, ['teachers.view', 'learners.view', 'timetable.view', 'dashboard.admin']);

    if (req.method === 'GET') {
      if (req.query.assignments === '1') {
        if (!canView) return res.status(403).json({ error: 'Forbidden' });
        let q = supabase.from('teacher_assignments').select('*').order('id');
        if (req.query.teacher_id) q = q.eq('teacher_id', req.query.teacher_id);
        if (req.query.stream_id) q = q.eq('stream_id', req.query.stream_id);
        if (req.query.academic_year_id) q = q.eq('academic_year_id', req.query.academic_year_id);
        const { data, error } = await q;
        if (error) throw error;
        if (!data.length) return res.status(200).json([]);
        const [teachers, streams, areas, grades] = await Promise.all([
          supabase.from('teachers').select('id,first_name,last_name'),
          supabase.from('streams').select('id,name,grade_id'),
          supabase.from('learning_areas').select('id,name,code'),
          supabase.from('grades').select('id,name,code'),
        ]);
        const tmap = Object.fromEntries((teachers.data || []).map((t) => [t.id, `${t.first_name} ${t.last_name}`]));
        const smap = Object.fromEntries((streams.data || []).map((s) => [s.id, s]));
        const amap = Object.fromEntries((areas.data || []).map((a) => [a.id, a]));
        const gmap = Object.fromEntries((grades.data || []).map((g) => [g.id, g]));
        return res.status(200).json(data.map((a) => ({
          ...a, teacher_name: tmap[a.teacher_id] || '', stream_name: smap[a.stream_id]?.name || '',
          grade_name: gmap[smap[a.stream_id]?.grade_id]?.name || '', learning_area_name: a.learning_area_id ? (amap[a.learning_area_id]?.name || '') : 'All',
        })));
      }
      if (req.query.id) {
        if (!canView) return res.status(403).json({ error: 'Forbidden' });
        const { data: teacher, error } = await supabase.from('teachers').select('*').eq('id', req.query.id).single();
        if (error) throw error;
        const { data: asg } = await supabase.from('teacher_assignments').select('*').eq('teacher_id', teacher.id);
        const { data: homeroom } = await supabase.from('streams').select('id,name,grade_id').eq('class_teacher_id', teacher.id);
        let user = null;
        if (teacher.app_user_id) {
          const { data } = await supabase.from('app_users').select('id,email,full_name,status').eq('id', teacher.app_user_id).maybeSingle();
          user = data;
        }
        return res.status(200).json({ ...teacher, assignments: asg || [], homeroom_streams: homeroom || [], login_account: user });
      }
      if (!canView) return res.status(403).json({ error: 'Forbidden' });
      let q = supabase.from('teachers').select('*').order('last_name').order('first_name');
      if (req.query.q) {
        const s = `%${req.query.q}%`;
        q = q.or(`first_name.ilike.${s},last_name.ilike.${s},staff_no.ilike.${s},tsc_no.ilike.${s},email.ilike.${s}`);
      }
      if (req.query.status) q = q.eq('status', req.query.status);
      const { data, error } = await q.limit(Math.min(Number(req.query.limit) || 200, 1000));
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      if (!canFull) return res.status(403).json({ error: 'Forbidden' });
      const b = req.body || {};
      if (b.action === 'assign') {
        if (!b.teacher_id || !b.stream_id || !b.academic_year_id) return res.status(400).json({ error: 'Teacher, stream and academic year are required' });
        const { data, error } = await supabase.from('teacher_assignments').insert({
          teacher_id: b.teacher_id, stream_id: b.stream_id, learning_area_id: b.learning_area_id || null,
          academic_year_id: b.academic_year_id, term_id: b.term_id || null, role: b.role || 'Subject Teacher',
        }).select('*').single();
        if (error) throw error;
        await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'teachers.assign', entityType: 'teacher_assignments', recordId: data.id, details: b });
        return res.status(201).json(data);
      }
      if (b.action === 'unassign') {
        if (!b.assignment_id) return res.status(400).json({ error: 'Missing assignment id' });
        const { error } = await supabase.from('teacher_assignments').delete().eq('id', b.assignment_id);
        if (error) throw error;
        await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'teachers.unassign', entityType: 'teacher_assignments', recordId: b.assignment_id });
        return res.status(200).json({ ok: true });
      }
      if (!b.first_name || !b.last_name || !b.staff_no) return res.status(400).json({ error: 'First name, last name and staff number are required' });
      const { data: dup } = await supabase.from('teachers').select('id').eq('staff_no', b.staff_no).maybeSingle();
      if (dup) return res.status(400).json({ error: 'Staff number already exists' });
      const row = {
        school_id: b.school_id || me.school_id, app_user_id: b.app_user_id || null, staff_no: b.staff_no,
        tsc_no: b.tsc_no || null, first_name: b.first_name, last_name: b.last_name, phone: b.phone || null,
        email: b.email || null, qualification: b.qualification || null, specialization: b.specialization || null,
        employment_type: b.employment_type || 'Full-time', status: b.status || 'Active', date_joined: b.date_joined || null,
      };
      const { data, error } = await supabase.from('teachers').insert(row).select('*').single();
      if (error) throw error;
      await audit({ userId: me.id, userEmail: me.email, schoolId: data.school_id, action: 'teachers.create', entityType: 'teachers', recordId: data.id });
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      if (!canFull) return res.status(403).json({ error: 'Forbidden' });
      const b = req.body || {};
      if (!b.id) return res.status(400).json({ error: 'Missing teacher id' });
      if (b.staff_no) {
        const { data: dup } = await supabase.from('teachers').select('id').eq('staff_no', b.staff_no).neq('id', b.id).maybeSingle();
        if (dup) return res.status(400).json({ error: 'Staff number already exists' });
      }
      const patch = { ...b };
      delete patch.id;
      patch.updated_at = new Date().toISOString();
      const { data, error } = await supabase.from('teachers').update(patch).eq('id', b.id).select('*').single();
      if (error) throw error;
      await audit({ userId: me.id, userEmail: me.email, schoolId: data.school_id, action: 'teachers.update', entityType: 'teachers', recordId: b.id });
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      if (!canFull) return res.status(403).json({ error: 'Forbidden' });
      const id = req.query.id || req.body?.id;
      if (!id) return res.status(400).json({ error: 'Missing teacher id' });
      await supabase.from('teacher_assignments').delete().eq('teacher_id', id);
      await supabase.from('streams').update({ class_teacher_id: null }).eq('class_teacher_id', id);
      const { error } = await supabase.from('teachers').delete().eq('id', id);
      if (error) throw error;
      await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'teachers.delete', entityType: 'teachers', recordId: id });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API teachers error:', err);
    res.status(500).json({ error: err.message });
  }
}
