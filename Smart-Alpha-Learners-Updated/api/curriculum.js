import supabase from './db-client.js';
import { preflight, getSession, can, audit, roleName } from './_auth.js';

const TABLES = {
  versions: 'curriculum_versions', 'learning-areas': 'learning_areas', strands: 'strands',
  outcomes: 'learning_outcomes', competencies: 'competencies', values: 'core_values',
  pcis: 'pertinent_contemporary_issues', 'competency-records': 'learner_competency_records', observations: 'learner_observations',
};

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    const me = session.profile;
    const resource = req.query.resource;
    if (!TABLES[resource]) return res.status(400).json({ error: 'Unknown resource' });
    const table = TABLES[resource];
    const isRecord = resource === 'competency-records' || resource === 'observations';
    const canManageCurr = can(me, 'curriculum.manage');
    const canViewCurr = canManageCurr || can(me, 'curriculum.view');
    const canRecord = canManageCurr || can(me, 'observations.manage');

    if (req.method === 'GET') {
      if (req.query.tree === '1' && resource === 'learning-areas') {
        if (!canViewCurr) return res.status(403).json({ error: 'Forbidden' });
        const versionId = req.query.curriculum_version_id;
        let laq = supabase.from('learning_areas').select('*').order('name');
        if (versionId) laq = laq.eq('curriculum_version_id', versionId);
        if (req.query.level_id) laq = laq.eq('level_id', req.query.level_id);
        if (req.query.grade_id) laq = laq.eq('grade_id', req.query.grade_id);
        const { data: areas, error } = await laq;
        if (error) throw error;
        if (!areas.length) return res.status(200).json([]);
        const areaIds = areas.map((a) => a.id);
        const { data: strands } = await supabase.from('strands').select('*').in('learning_area_id', areaIds).order('order_index');
        const strandIds = (strands || []).map((s) => s.id);
        const { data: outcomes } = strandIds.length ? await supabase.from('learning_outcomes').select('*').in('strand_id', strandIds).order('order_index') : { data: [] };
        const outByStrand = {};
        (outcomes || []).forEach((o) => { (outByStrand[o.strand_id] = outByStrand[o.strand_id] || []).push(o); });
        const strandsByArea = {};
        (strands || []).forEach((s) => { (strandsByArea[s.learning_area_id] = strandsByArea[s.learning_area_id] || []).push({ ...s, outcomes: outByStrand[s.id] || [] }); });
        return res.status(200).json(areas.map((a) => ({ ...a, strands: strandsByArea[a.id] || [] })));
      }
      if (isRecord) {
        const role = roleName(me);
        if (!canRecord && !['Parent/Guardian', 'Learner'].includes(role)) return res.status(403).json({ error: 'Forbidden' });
        let q = supabase.from(table).select('*').order('id', { ascending: false }).limit(500);
        if (req.query.learner_id) q = q.eq('learner_id', req.query.learner_id);
        if (req.query.term_id) q = q.eq('term_id', req.query.term_id);
        if (role === 'Learner') {
          const { data: l } = await supabase.from('learners').select('id').eq('app_user_id', me.id).maybeSingle();
          q = q.eq('learner_id', l?.id || -1);
        }
        if (role === 'Parent/Guardian') {
          const { data: p } = await supabase.from('parents').select('id').eq('app_user_id', me.id).maybeSingle();
          const { data: links } = p ? await supabase.from('learner_parent_links').select('learner_id').eq('parent_id', p.id) : { data: [] };
          q = q.in('learner_id', (links || []).map((x) => x.learner_id).concat([-1]));
        }
        const { data, error } = await q;
        if (error) throw error;
        return res.status(200).json(data);
      }
      if (!canViewCurr) return res.status(403).json({ error: 'Forbidden' });
      let q = supabase.from(table).select('*');
      if (req.query.curriculum_version_id) q = q.eq('curriculum_version_id', req.query.curriculum_version_id);
      if (req.query.level_id && resource === 'learning-areas') q = q.eq('level_id', req.query.level_id);
      if (req.query.grade_id && (resource === 'learning-areas' || resource === 'strands')) q = q.eq('grade_id', req.query.grade_id);
      if (req.query.learning_area_id && resource === 'strands') q = q.eq('learning_area_id', req.query.learning_area_id);
      if (req.query.strand_id && resource === 'outcomes') q = q.eq('strand_id', req.query.strand_id);
      if (resource === 'strands' || resource === 'outcomes') q = q.order('order_index');
      else if (resource === 'versions') q = q.order('id', { ascending: false });
      else q = q.order('name');
      const { data, error } = await q;
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (isRecord && !canRecord) return res.status(403).json({ error: 'Forbidden' });
    if (!isRecord && !canManageCurr) return res.status(403).json({ error: 'Forbidden' });

    if (req.method === 'POST') {
      const b = req.body || {};
      if (resource === 'versions' && b.action === 'activate') {
        if (!b.id) return res.status(400).json({ error: 'Missing version id' });
        await supabase.from(table).update({ is_active: false, status: 'Archived' }).eq('is_active', true);
        const { data, error } = await supabase.from(table).update({ is_active: true, status: 'Active' }).eq('id', b.id).select('*').single();
        if (error) throw error;
        await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'curriculum.activate_version', entityType: table, recordId: b.id });
        return res.status(200).json(data);
      }
      const required = {
        versions: ['name', 'code'], 'learning-areas': ['curriculum_version_id', 'name'], strands: ['learning_area_id', 'name'],
        outcomes: ['strand_id', 'title'], competencies: ['name'], values: ['name'], pcis: ['name'],
        'competency-records': ['learner_id', 'competency_id', 'term_id', 'rating'], observations: ['learner_id', 'observation'],
      }[resource] || [];
      for (const f of required) if (b[f] === undefined || b[f] === '' || b[f] === null) return res.status(400).json({ error: `Field '${f}' is required` });
      if (resource === 'competency-records' && !['EE1', 'EE2', 'ME1', 'ME2', 'AE1', 'AE2', 'BE1', 'BE2'].includes(b.rating)) {
        return res.status(400).json({ error: 'Invalid rating. Use EE1/EE2, ME1/ME2, AE1/AE2 or BE1/BE2' });
      }
      const row = { ...b };
      delete row.id; delete row.action;
      if (isRecord) { row.assessed_by = row.assessed_by || me.id; if (resource === 'observations' && !row.observation_date) row.observation_date = new Date().toISOString().slice(0, 10); }
      const { data, error } = await supabase.from(table).insert(row).select('*').single();
      if (error) throw error;
      await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: `${table}.create`, entityType: table, recordId: data.id });
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const b = req.body || {};
      if (!b.id) return res.status(400).json({ error: 'Missing id' });
      const patch = { ...b };
      delete patch.id;
      const { data, error } = await supabase.from(table).update(patch).eq('id', b.id).select('*').single();
      if (error) throw error;
      await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: `${table}.update`, entityType: table, recordId: b.id });
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const id = req.query.id || req.body?.id;
      if (!id) return res.status(400).json({ error: 'Missing id' });
      if (resource === 'versions') {
        const { data: v } = await supabase.from(table).select('is_active').eq('id', id).maybeSingle();
        if (v?.is_active) return res.status(400).json({ error: 'Cannot delete the active curriculum version' });
        const { count } = await supabase.from('learning_areas').select('id', { count: 'exact', head: true }).eq('curriculum_version_id', id);
        if (count > 0) return res.status(400).json({ error: `Cannot delete: ${count} learning area(s) use this version` });
      }
      if (resource === 'learning-areas') {
        const { count } = await supabase.from('strands').select('id', { count: 'exact', head: true }).eq('learning_area_id', id);
        if (count > 0) return res.status(400).json({ error: `Cannot delete: ${count} strand(s) exist under this learning area` });
      }
      if (resource === 'strands') {
        const { count } = await supabase.from('learning_outcomes').select('id', { count: 'exact', head: true }).eq('strand_id', id);
        if (count > 0) return res.status(400).json({ error: `Cannot delete: ${count} outcome(s) exist under this strand` });
      }
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: `${table}.delete`, entityType: table, recordId: id });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API curriculum error:', err);
    res.status(500).json({ error: err.message });
  }
}
