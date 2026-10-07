import supabase from './db-client.js';
import { preflight, getSession, audit, envMissing, ENV_ERROR_MESSAGE, serverError, isMissingTable } from './_auth.js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function passwordGrant(email, password) {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    return { ok: res.ok, data: data || {}, status: res.status };
  } catch (err) {
    return { ok: false, networkError: true, data: {}, message: err.message };
  }
}

async function refreshGrant(refresh_token) {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token }),
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    return { ok: res.ok, data: data || {}, status: res.status };
  } catch (err) {
    return { ok: false, networkError: true, data: {}, message: err.message };
  }
}

function throwIfTableMissing(err) {
  if (err && isMissingTable(err)) {
    const e = new Error(`Database table missing: ${err.message}`);
    e.code = 'DB_TABLE_MISSING';
    throw e;
  }
  if (err) throw err;
}

async function loadProfile(authUser) {
  const byId = await supabase
    .from('app_users')
    .select('*, roles(*)')
    .eq('auth_user_id', authUser.id)
    .maybeSingle();
  throwIfTableMissing(byId.error);
  let profile = byId.data;
  if (!profile && authUser.email) {
    const byEmail = await supabase
      .from('app_users')
      .select('*, roles(*)')
      .ilike('email', authUser.email)
      .maybeSingle();
    throwIfTableMissing(byEmail.error);
    if (byEmail.data) {
      await supabase.from('app_users').update({ auth_user_id: authUser.id }).eq('id', byEmail.data.id);
      profile = { ...byEmail.data, auth_user_id: authUser.id };
    }
  }
  return profile || null;
}

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  if (envMissing()) {
    console.error('API auth error: missing Supabase env vars');
    return res.status(500).json({ error: ENV_ERROR_MESSAGE, code: 'ENV_MISSING' });
  }
  try {
    if (req.method === 'GET') {
      const session = await getSession(req);
      if (!session) return res.status(401).json({ error: 'Unauthorized' });
      return res.status(200).json({ user: session.profile });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { action } = req.body || {};

    if (action === 'login') {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
      const grant = await passwordGrant(email, password);
      if (grant.networkError) {
        return res.status(503).json({ error: `Cannot reach Supabase Auth (${grant.message || 'network error'}). Check NEXT_PUBLIC_SUPABASE_URL and project status. Status: GET /api/health.`, code: 'AUTH_UNREACHABLE' });
      }
      if (!grant.ok) return res.status(401).json({ error: 'Invalid email or password' });
      let profile;
      try {
        profile = await loadProfile(grant.data.user);
      } catch (err) {
        return serverError(res, err);
      }
      if (!profile) return res.status(403).json({ error: 'No school account found for this login. Ask an administrator to create your Elimu account (Users page) or run /setup for first-time setup.' });
      if (profile.status !== 'Active') return res.status(403).json({ error: 'This account has been deactivated' });
      await supabase.from('app_users').update({ last_login: new Date().toISOString() }).eq('id', profile.id);
      await audit({ userId: profile.id, userEmail: profile.email, schoolId: profile.school_id, action: 'auth.login', entityType: 'app_users', recordId: profile.id });
      return res.status(200).json({
        access_token: grant.data.access_token,
        refresh_token: grant.data.refresh_token,
        user: { ...profile, last_login: new Date().toISOString() },
      });
    }

    if (action === 'refresh') {
      const { refresh_token } = req.body;
      if (!refresh_token) return res.status(400).json({ error: 'Missing refresh token' });
      const grant = await refreshGrant(refresh_token);
      if (grant.networkError) {
        return res.status(503).json({ error: 'Cannot reach Supabase Auth. Check project status, then sign in again.', code: 'AUTH_UNREACHABLE' });
      }
      if (!grant.ok) return res.status(401).json({ error: 'Session expired' });
      let profile;
      try {
        profile = await loadProfile(grant.data.user);
      } catch (err) {
        return serverError(res, err);
      }
      if (!profile || profile.status !== 'Active') return res.status(401).json({ error: 'Unauthorized' });
      return res.status(200).json({ access_token: grant.data.access_token, refresh_token: grant.data.refresh_token, user: profile });
    }

    if (action === 'logout') {
      const session = await getSession(req);
      if (session) await audit({ userId: session.profile.id, userEmail: session.profile.email, schoolId: session.profile.school_id, action: 'auth.logout', entityType: 'app_users', recordId: session.profile.id });
      return res.status(200).json({ ok: true });
    }

    if (action === 'change-password') {
      const session = await getSession(req);
      if (!session) return res.status(401).json({ error: 'Unauthorized' });
      const { current_password, new_password } = req.body;
      if (!new_password || new_password.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
      if (current_password) {
        const check = await passwordGrant(session.authUser.email, current_password);
        if (check.networkError || !check.ok) return res.status(400).json({ error: 'Current password is incorrect' });
      }
      const { error } = await supabase.auth.admin.updateUserById(session.authUser.id, { password: new_password });
      if (error) throw error;
      await audit({ userId: session.profile.id, userEmail: session.profile.email, schoolId: session.profile.school_id, action: 'auth.password_change', entityType: 'app_users', recordId: session.profile.id });
      return res.status(200).json({ ok: true });
    }

    if (action === 'bootstrap') {
      const counted = await supabase.from('app_users').select('id', { count: 'exact', head: true });
      if (counted.error) return serverError(res, counted.error);
      if (counted.count && counted.count > 0) return res.status(403).json({ error: 'Setup already completed' });
      const { email, password, full_name } = req.body;
      if (!email || !password || password.length < 8) return res.status(400).json({ error: 'Email and a password of 8+ characters are required' });
      const roleRes = await supabase.from('roles').select('id').eq('name', 'Administrator').maybeSingle();
      if (roleRes.error) return serverError(res, roleRes.error);
      if (!roleRes.data) return res.status(503).json({ error: 'Roles table is empty — seed the 7 Phase-1 roles before setup.', code: 'DB_SEED_MISSING' });
      const created = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: full_name || 'Administrator' } });
      if (created.error) throw created.error;
      const authUser = created.data.user;
      const { data: school } = await supabase.from('schools').select('id').order('id').limit(1).maybeSingle();
      const { data: appUser, error: insErr } = await supabase.from('app_users').insert({
        auth_user_id: authUser.id, email, full_name: full_name || 'Administrator', role_id: roleRes.data.id,
        status: 'Active', school_id: school?.id || null,
      }).select('*, roles(*)').single();
      if (insErr) throw insErr;
      const grant = await passwordGrant(email, password);
      await audit({ userId: appUser.id, userEmail: email, schoolId: appUser.school_id, action: 'auth.bootstrap', entityType: 'app_users', recordId: appUser.id });
      return res.status(201).json({ access_token: grant.ok ? grant.data.access_token : null, refresh_token: grant.ok ? grant.data.refresh_token : null, user: appUser });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    return serverError(res, err);
  }
}
