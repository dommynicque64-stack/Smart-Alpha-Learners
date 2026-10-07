import supabase from './db-client.js';
import { preflight, getSession, can, audit, roleName } from './_auth.js';

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    const me = session.profile;

    if (req.method === 'GET') {
      let query = supabase.from('schools').select('*');
      // A school-scoped account must only read its own school. The first-school
      // fallback is retained only for a Super Admin or an initial bootstrap
      // account that has not yet been assigned a school.
      if (me.school_id) {
        query = query.eq('id', me.school_id);
      } else if (roleName(me) !== 'Super Admin') {
        return res.status(200).json(null);
      } else {
        query = query.order('id').limit(1);
      }
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return res.status(200).json(data || null);
    }
    if (req.method === 'POST') {
      if (!can(me, 'school.manage')) return res.status(403).json({ error: 'Forbidden' });
      const b = req.body || {};
      if (!b.name) return res.status(400).json({ error: 'School name is required' });
      const { data, error } = await supabase.from('schools').insert({
        name: b.name, logo_url: b.logo_url || null, school_type: b.school_type || null,
        address: b.address || null, county: b.county || null, sub_county: b.sub_county || null,
        phone: b.phone || null, email: b.email || null, website: b.website || null,
        motto: b.motto || null, registration_no: b.registration_no || null,
      }).select('*').single();
      if (error) throw error;
      // During first-time setup, attach the newly created school to the
      // bootstrap administrator so subsequent requests become school-scoped.
      if (!me.school_id) {
        await supabase.from('app_users').update({ school_id: data.id }).eq('id', me.id);
        me.school_id = data.id;
      }
      await audit({ userId: me.id, userEmail: me.email, schoolId: data.id, action: 'school.create', entityType: 'schools', recordId: data.id, details: { name: data.name } });
      return res.status(201).json(data);
    }
    if (req.method === 'PUT') {
      if (!can(me, 'school.manage')) return res.status(403).json({ error: 'Forbidden' });
      const b = req.body || {};
      if (!b.id) return res.status(400).json({ error: 'Missing school id' });
      const patch = { updated_at: new Date().toISOString() };
      for (const k of ['name', 'logo_url', 'school_type', 'address', 'county', 'sub_county', 'phone', 'email', 'website', 'motto', 'registration_no']) {
        if (b[k] !== undefined) patch[k] = b[k] || null;
      }
      if (me.school_id && Number(b.id) !== Number(me.school_id) && roleName(me) !== 'Super Admin') {
        return res.status(403).json({ error: 'You can only update your own school' });
      }
      const { data, error } = await supabase.from('schools').update(patch).eq('id', b.id).select('*').single();
      if (error) throw error;
      await audit({ userId: me.id, userEmail: me.email, schoolId: data.id, action: 'school.update', entityType: 'schools', recordId: data.id });
      return res.status(200).json(data);
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API schools error:', err);
    res.status(500).json({ error: err.message });
  }
}
