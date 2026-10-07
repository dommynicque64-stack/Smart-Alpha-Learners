import supabase from './db-client.js';
import { preflight, getSession, can, audit } from './_auth.js';

const RESOURCES = ['years', 'terms', 'levels', 'grades', 'streams'];
const TABLES = { years: 'academic_years', terms: 'terms', levels: 'levels', grades: 'grades', streams: 'streams' };

async function enrichStreams(rows) {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id);
  const { data: learners } = await supabase.from('learners').select('id,stream_id,gender').in('stream_id', ids);
  const counts = {};
  (learners || []).forEach((l) => {
    counts[l.stream_id] = counts[l.stream_id] || { total: 0, boys: 0, girls: 0 };
    counts[l.stream_id].total++;
    if (l.gender === 'Male') counts[l.stream_id].boys++;
    if (l.gender === 'Female') counts[l.stream_id].girls++;
  });
  return rows.map((r) => ({ ...r, learner_count: counts[r.id]?.total || 0, boys: counts[r.id]?.boys || 0, girls: counts[r.id]?.girls || 0 }));
}

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    const me = session.profile;
    const resource = req.query.resource;
    if (!RESOURCES.includes(resource)) return res.status(400).json({ error: 'Unknown resource' });
    const table = TABLES[resource];
    const canManage = can(me, 'academic.manage');
    const canView = canManage || can(me, ['learners.view', 'teachers.view', 'curriculum.view', 'timetable.view', 'attendance.view', 'dashboard.teacher', 'dashboard.learner', 'dashboard.parent', 'dashboard.finance']);

    if (req.method === 'GET') {
      if (!canView) return res.status(403).json({ error: 'Forbidden' });
      let q = supabase.from(table).select('*');
      if (resource === 'terms' && req.query.academic_year_id) q = q.eq('academic_year_id', req.query.academic_year_id);
      if (resource === 'grades' && req.query.level_id) q = q.eq('level_id', req.query.level_id);
      if (resource === 'streams') {
        if (req.query.grade_id) q = q.eq('grade_id', req.query.grade_id);
        if (req.query.academic_year_id) q = q.eq('academic_year_id', req.query.academic_year_id);
      }
      const orderCol = resource === 'levels' || resource === 'grades' ? 'order_index' : 'id';
      q = q.order(orderCol, { ascending: true });
      const { data, error } = await q;
      if (error) throw error;
      let rows = data;
      if (resource === 'grades' && rows.length) {
        const { data: levels } = await supabase.from('levels').select('id,name,code');
        const map = Object.fromEntries((levels || []).map((l) => [l.id, l]));
        rows = rows.map((g) => ({ ...g, level_name: map[g.level_id]?.name || '', level_code: map[g.level_id]?.code || '' }));
      }
      if (resource === 'streams' && rows.length) {
        const { data: grades } = await supabase.from('grades').select('id,name,code,level_id');
        const gmap = Object.fromEntries((grades || []).map((g) => [g.id, g]));
        const { data: teachers } = await supabase.from('teachers').select('id,first_name,last_name');
        const tmap = Object.fromEntries((teachers || []).map((t) => [t.id, `${t.first_name} ${t.last_name}`]));
        rows = rows.map((s) => ({ ...s, grade_name: gmap[s.grade_id]?.name || '', grade_code: gmap[s.grade_id]?.code || '', class_teacher_name: s.class_teacher_id ? (tmap[s.class_teacher_id] || '') : '' }));
        if (req.query.include === 'counts') rows = await enrichStreams(rows);
      }
      if (resource === 'terms' && rows.length) {
        const { data: years } = await supabase.from('academic_years').select('id,name');
        const ymap = Object.fromEntries((years || []).map((y) => [y.id, y.name]));
        rows = rows.map((t) => ({ ...t, academic_year_name: ymap[t.academic_year_id] || '' }));
      }
      return res.status(200).json(rows);
    }

    if (!canManage) return res.status(403).json({ error: 'Forbidden' });

    if (req.method === 'POST') {
      const b = req.body || {};
      let row = null;
      if (resource === 'years') {
        if (!b.name) return res.status(400).json({ error: 'Year name is required' });
        row = { school_id: b.school_id || me.school_id, name: b.name, start_date: b.start_date || null, end_date: b.end_date || null, is_current: !!b.is_current, status: b.status || 'Active' };
        if (row.is_current) await supabase.from(table).update({ is_current: false }).neq('id', 0);
      } else if (resource === 'terms') {
        if (!b.academic_year_id || !b.name) return res.status(400).json({ error: 'Academic year and term name are required' });
        row = { academic_year_id: b.academic_year_id, name: b.name, term_number: b.term_number || null, start_date: b.start_date || null, end_date: b.end_date || null, is_current: !!b.is_current };
        if (row.is_current) await supabase.from(table).update({ is_current: false }).neq('id', 0);
      } else if (resource === 'levels') {
        if (!b.name) return res.status(400).json({ error: 'Level name is required' });
        row = { school_id: b.school_id || me.school_id, name: b.name, code: b.code || null, order_index: b.order_index ?? 0, is_enabled: b.is_enabled !== false };
      } else if (resource === 'grades') {
        if (!b.level_id || !b.name) return res.status(400).json({ error: 'Level and grade name are required' });
        row = { level_id: b.level_id, name: b.name, code: b.code || null, order_index: b.order_index ?? 0 };
      } else if (resource === 'streams') {
        if (!b.grade_id || !b.name || !b.academic_year_id) return res.status(400).json({ error: 'Grade, stream name and academic year are required' });
        row = { grade_id: b.grade_id, academic_year_id: b.academic_year_id, name: b.name, capacity: b.capacity || null, class_teacher_id: b.class_teacher_id || null };
      }
      const { data, error } = await supabase.from(table).insert(row).select('*').single();
      if (error) throw error;
      await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: `${table}.create`, entityType: table, recordId: data.id, details: row });
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const b = req.body || {};
      if (!b.id) return res.status(400).json({ error: 'Missing id' });
      const patch = { ...b };
      delete patch.id;
      if ((resource === 'years' || resource === 'terms') && patch.is_current) {
        await supabase.from(table).update({ is_current: false }).neq('id', b.id);
      }
      const { data, error } = await supabase.from(table).update(patch).eq('id', b.id).select('*').single();
      if (error) throw error;
      await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: `${table}.update`, entityType: table, recordId: b.id, details: patch });
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const id = req.query.id || req.body?.id;
      if (!id) return res.status(400).json({ error: 'Missing id' });
      if (resource === 'streams') {
        const { count } = await supabase.from('learners').select('id', { count: 'exact', head: true }).eq('stream_id', id);
        if (count > 0) return res.status(400).json({ error: `Cannot delete: ${count} learner(s) are enrolled in this stream` });
        await supabase.from('teacher_assignments').delete().eq('stream_id', id);
        await supabase.from('timetable_slots').delete().eq('stream_id', id);
      }
      if (resource === 'grades') {
        const { count } = await supabase.from('streams').select('id', { count: 'exact', head: true }).eq('grade_id', id);
        if (count > 0) return res.status(400).json({ error: `Cannot delete: ${count} stream(s) exist under this grade` });
      }
      if (resource === 'levels') {
        const { count } = await supabase.from('grades').select('id', { count: 'exact', head: true }).eq('level_id', id);
        if (count > 0) return res.status(400).json({ error: `Cannot delete: ${count} grade(s) exist under this level` });
      }
      if (resource === 'years') {
        const { count } = await supabase.from('terms').select('id', { count: 'exact', head: true }).eq('academic_year_id', id);
        if (count > 0) return res.status(400).json({ error: `Cannot delete: ${count} term(s) exist under this year` });
      }
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: `${table}.delete`, entityType: table, recordId: id });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API academic error:', err);
    res.status(500).json({ error: err.message });
  }
}
