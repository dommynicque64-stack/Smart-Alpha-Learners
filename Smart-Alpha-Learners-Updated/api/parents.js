import supabase from './db-client.js';
import { preflight, getSession, can, audit } from './_auth.js';

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    const me = session.profile;
    const canFull = can(me, ['parents.manage', 'learners.manage']);
    const canView = canFull || can(me, ['parents.view', 'learners.view', 'attendance.view']);

    if (req.method === 'GET') {
      if (req.query.id) {
        if (!canView) return res.status(403).json({ error: 'Forbidden' });
        const { data: parent, error } = await supabase.from('parents').select('*').eq('id', req.query.id).single();
        if (error) throw error;
        const { data: links } = await supabase.from('learner_parent_links').select('*, learners(*)').eq('parent_id', parent.id);
        return res.status(200).json({ ...parent, learners: (links || []).map((l) => ({ link_id: l.id, relationship: l.relationship, is_primary: l.is_primary, ...(l.learners || {}) })) });
      }
      if (!canView) return res.status(403).json({ error: 'Forbidden' });
      let q = supabase.from('parents').select('*').order('last_name').order('first_name');
      if (req.query.q) {
        const s = `%${req.query.q}%`;
        q = q.or(`first_name.ilike.${s},last_name.ilike.${s},phone.ilike.${s},email.ilike.${s},national_id.ilike.${s}`);
      }
      q = q.limit(Math.min(Number(req.query.limit) || 200, 1000));
      const { data, error } = await q;
      if (error) throw error;
      if (!data.length) return res.status(200).json([]);
      const { data: links } = await supabase.from('learner_parent_links').select('parent_id,learner_id').in('parent_id', data.map((p) => p.id));
      const counts = {};
      (links || []).forEach((l) => { counts[l.parent_id] = (counts[l.parent_id] || 0) + 1; });
      return res.status(200).json(data.map((p) => ({ ...p, learner_count: counts[p.id] || 0 })));
    }

    if (req.method === 'POST') {
      if (!canFull) return res.status(403).json({ error: 'Forbidden' });
      const b = req.body || {};
      if (b.action === 'link') {
        if (!b.learner_id || !b.parent_id) return res.status(400).json({ error: 'Learner and parent are required' });
        const { data: exists } = await supabase.from('learner_parent_links').select('id').eq('learner_id', b.learner_id).eq('parent_id', b.parent_id).maybeSingle();
        if (exists) return res.status(400).json({ error: 'This learner is already linked to this parent' });
        const { data, error } = await supabase.from('learner_parent_links').insert({
          learner_id: b.learner_id, parent_id: b.parent_id, relationship: b.relationship || 'Guardian', is_primary: !!b.is_primary,
        }).select('*').single();
        if (error) throw error;
        await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'parents.link', entityType: 'learner_parent_links', recordId: data.id, details: { learner_id: b.learner_id, parent_id: b.parent_id } });
        return res.status(201).json(data);
      }
      if (b.action === 'unlink') {
        if (!b.link_id) return res.status(400).json({ error: 'Missing link id' });
        const { error } = await supabase.from('learner_parent_links').delete().eq('id', b.link_id);
        if (error) throw error;
        await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'parents.unlink', entityType: 'learner_parent_links', recordId: b.link_id });
        return res.status(200).json({ ok: true });
      }
      if (!b.first_name || !b.last_name || !b.phone) return res.status(400).json({ error: 'First name, last name and phone are required' });
      const row = {
        school_id: b.school_id || me.school_id, first_name: b.first_name, last_name: b.last_name,
        national_id: b.national_id || null, phone: b.phone, alt_phone: b.alt_phone || null, email: b.email || null,
        address: b.address || null, county: b.county || null, occupation: b.occupation || null,
        guardian_type: b.guardian_type || 'Parent', app_user_id: b.app_user_id || null,
      };
      const { data, error } = await supabase.from('parents').insert(row).select('*').single();
      if (error) throw error;
      await audit({ userId: me.id, userEmail: me.email, schoolId: data.school_id, action: 'parents.create', entityType: 'parents', recordId: data.id });
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      if (!canFull) return res.status(403).json({ error: 'Forbidden' });
      const b = req.body || {};
      if (!b.id) return res.status(400).json({ error: 'Missing parent id' });
      const patch = { ...b };
      delete patch.id;
      patch.updated_at = new Date().toISOString();
      const { data, error } = await supabase.from('parents').update(patch).eq('id', b.id).select('*').single();
      if (error) throw error;
      await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'parents.update', entityType: 'parents', recordId: b.id });
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      if (!canFull) return res.status(403).json({ error: 'Forbidden' });
      const id = req.query.id || req.body?.id;
      if (!id) return res.status(400).json({ error: 'Missing parent id' });
      await supabase.from('learner_parent_links').delete().eq('parent_id', id);
      const { error } = await supabase.from('parents').delete().eq('id', id);
      if (error) throw error;
      await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'parents.delete', entityType: 'parents', recordId: id });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API parents error:', err);
    res.status(500).json({ error: err.message });
  }
}
