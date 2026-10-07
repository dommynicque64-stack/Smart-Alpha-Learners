import supabase from './db-client.js';
import { preflight, getSession, can, audit } from './_auth.js';

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    const me = session.profile;

    if (req.method === 'GET') {
      if (!can(me, ['users.manage', 'users.view', 'dashboard.admin'])) return res.status(403).json({ error: 'Forbidden' });
      const { data, error } = await supabase.from('app_users').select('*, roles(id,name)').order('id');
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      if (!can(me, 'users.manage')) return res.status(403).json({ error: 'Forbidden' });
      const { email, password, full_name, role_id, phone, status, school_id } = req.body || {};
      if (!email || !full_name || !role_id) return res.status(400).json({ error: 'Email, full name and role are required' });
      const { data: existing } = await supabase.from('app_users').select('id').ilike('email', email).maybeSingle();
      if (existing) return res.status(400).json({ error: 'A user with this email already exists' });
      const pwd = password && password.length >= 8 ? password : `Elimu${Math.floor(1000 + Math.random() * 9000)}!`;
      const created = await supabase.auth.admin.createUser({ email, password: pwd, email_confirm: true, user_metadata: { full_name } });
      if (created.error) throw created.error;
      const authUser = created.data.user;
      const { data, error } = await supabase.from('app_users').insert({
        auth_user_id: authUser.id, email, full_name, role_id, phone: phone || null,
        status: status || 'Active', school_id: school_id || me.school_id || null,
      }).select('*, roles(id,name)').single();
      if (error) { await supabase.auth.admin.deleteUser(authUser.id).catch(() => {}); throw error; }
      await audit({ userId: me.id, userEmail: me.email, schoolId: data.school_id, action: 'users.create', entityType: 'app_users', recordId: data.id, details: { email, role_id } });
      return res.status(201).json({ ...data, _temp_password: password ? undefined : pwd });
    }

    if (req.method === 'PUT') {
      if (!can(me, 'users.manage')) return res.status(403).json({ error: 'Forbidden' });
      const { id, full_name, role_id, phone, status, password } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Missing user id' });
      if (Number(id) === Number(me.id) && status && status !== 'Active') return res.status(400).json({ error: 'You cannot deactivate your own account' });
      const patch = {};
      if (full_name !== undefined) patch.full_name = full_name;
      if (role_id !== undefined) patch.role_id = role_id;
      if (phone !== undefined) patch.phone = phone;
      if (status !== undefined) patch.status = status;
      patch.updated_at = new Date().toISOString();
      const { data: target } = await supabase.from('app_users').select('auth_user_id').eq('id', id).maybeSingle();
      if (password) {
        if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
        if (!target?.auth_user_id) return res.status(400).json({ error: 'Auth account not linked yet' });
        const { error: pwErr } = await supabase.auth.admin.updateUserById(target.auth_user_id, { password });
        if (pwErr) throw pwErr;
      }
      const { data, error } = await supabase.from('app_users').update(patch).eq('id', id).select('*, roles(id,name)').single();
      if (error) throw error;
      await audit({ userId: me.id, userEmail: me.email, schoolId: data.school_id, action: password ? 'users.reset_password' : 'users.update', entityType: 'app_users', recordId: id, details: patch });
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      if (!can(me, 'users.manage')) return res.status(403).json({ error: 'Forbidden' });
      const id = req.query.id || req.body?.id;
      if (!id) return res.status(400).json({ error: 'Missing user id' });
      if (Number(id) === Number(me.id)) return res.status(400).json({ error: 'You cannot delete your own account' });
      const { data: target } = await supabase.from('app_users').select('auth_user_id,email').eq('id', id).maybeSingle();
      await supabase.from('teachers').update({ app_user_id: null }).eq('app_user_id', id);
      await supabase.from('parents').update({ app_user_id: null }).eq('app_user_id', id);
      await supabase.from('learners').update({ app_user_id: null }).eq('app_user_id', id);
      const { error } = await supabase.from('app_users').delete().eq('id', id);
      if (error) throw error;
      if (target?.auth_user_id) await supabase.auth.admin.deleteUser(target.auth_user_id).catch(() => {});
      await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'users.delete', entityType: 'app_users', recordId: id, details: { email: target?.email } });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API users error:', err);
    res.status(500).json({ error: err.message });
  }
}
