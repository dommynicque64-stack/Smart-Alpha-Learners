import supabase from './db-client.js';
import { preflight, getSession, can } from './_auth.js';

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const me = session.profile;
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.status(200).json({ learners: [], parents: [], teachers: [], areas: [], streams: [] });
    const s = `%${q}%`;
    const out = { learners: [], parents: [], teachers: [], areas: [], streams: [] };
    const jobs = [];
    if (can(me, ['learners.view', 'learners.edit', 'learners.manage', 'attendance.mark', 'observations.manage'])) {
      jobs.push(supabase.from('learners').select('id,admission_no,first_name,last_name,grade_id,stream_id').or(`first_name.ilike.${s},last_name.ilike.${s},admission_no.ilike.${s}`).limit(6).then((r) => { out.learners = r.data || []; }));
    }
    if (can(me, ['parents.view', 'parents.manage', 'learners.manage'])) {
      jobs.push(supabase.from('parents').select('id,first_name,last_name,phone').or(`first_name.ilike.${s},last_name.ilike.${s},phone.ilike.${s}`).limit(6).then((r) => { out.parents = r.data || []; }));
    }
    if (can(me, ['teachers.view', 'teachers.manage', 'academic.manage'])) {
      jobs.push(supabase.from('teachers').select('id,first_name,last_name,staff_no').or(`first_name.ilike.${s},last_name.ilike.${s},staff_no.ilike.${s}`).limit(6).then((r) => { out.teachers = r.data || []; }));
    }
    if (can(me, ['curriculum.view', 'curriculum.manage'])) {
      jobs.push(supabase.from('learning_areas').select('id,name,code').or(`name.ilike.${s},code.ilike.${s}`).limit(6).then((r) => { out.areas = r.data || []; }));
    }
    if (can(me, ['academic.manage', 'attendance.mark', 'attendance.view'])) {
      jobs.push(supabase.from('streams').select('id,name,grade_id').ilike('name', s).limit(6).then((r) => { out.streams = r.data || []; }));
    }
    await Promise.all(jobs);
    return res.status(200).json(out);
  } catch (err) {
    console.error('API search error:', err);
    res.status(500).json({ error: err.message });
  }
}
