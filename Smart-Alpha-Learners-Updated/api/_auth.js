import supabase, { serviceSupabase, createRequestSupabase, requestDbContext } from './db-client.js';

export function cors(res, req) {
  const configured = String(process.env.APP_ORIGIN || '').replace(/\/$/, '');
  const requestOrigin = req?.headers?.origin || '';
  // Never reflect an arbitrary Origin. The application is same-origin by
  // default; cross-origin access is allowed only for the explicitly configured
  // production origin.
  if (configured && requestOrigin === configured) {
    res.setHeader('Access-Control-Allow-Origin', configured);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export function preflight(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

export async function getSession(req) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return null;
    const { data, error } = await serviceSupabase.auth.getUser(token);
    if (error || !data?.user) return null;
    let { data: profile } = await serviceSupabase
      .from('app_users')
      .select('*, roles(*)')
      .eq('auth_user_id', data.user.id)
      .maybeSingle();
    if (!profile && data.user.email) {
      const { data: byEmail } = await serviceSupabase
        .from('app_users')
        .select('*, roles(*)')
        .ilike('email', data.user.email)
        .maybeSingle();
      if (byEmail) {
        await serviceSupabase.from('app_users').update({ auth_user_id: data.user.id }).eq('id', byEmail.id);
        profile = { ...byEmail, auth_user_id: data.user.id };
      }
    }
    if (!profile || profile.status !== 'Active') return null;
    // From this point onward, all normal `supabase.from(...)` calls in the
    // request are executed as the authenticated caller. RLS, including the
    // restrictive tenant boundary migration, therefore applies even though
    // the service-role client remains available for Auth admin operations.
    requestDbContext.enterWith({ client: createRequestSupabase(token), profile });
    return { authUser: data.user, profile, token };
  } catch {
    return null;
  }
}

export function can(profile, perms) {
  const granted = profile?.roles?.permissions || [];
  if (granted.includes('*')) return true;
  const need = Array.isArray(perms) ? perms : [perms];
  return need.some((p) => granted.includes(p));
}

export function roleName(profile) {
  return profile?.roles?.name || '';
}

export async function audit({ userId, userEmail, schoolId, action, entityType, recordId, details }) {
  try {
    await supabase.from('audit_logs').insert({
      user_id: userId || null,
      user_email: userEmail || null,
      school_id: schoolId || null,
      action,
      entity_type: entityType || null,
      record_id: recordId != null ? String(recordId) : null,
      details: details || null,
    });
  } catch (e) {
    console.error('audit failed:', e.message);
  }
}

export function envMissing() {
  return !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

export function isMissingTable(err) {
  const msg = String(err?.message || '');
  return err?.code === '42P01' || /relation .* does not exist/i.test(msg) || /schema cache/i.test(msg) || /Could not find the table/i.test(msg);
}

export const ENV_ERROR_MESSAGE = 'Server is missing Supabase configuration (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY). Configure them in Netlify environment variables and redeploy.';

export function serverError(res, err, fallback = 'Request failed') {
  console.error('API error:', err);
  if (envMissing()) return res.status(500).json({ error: ENV_ERROR_MESSAGE, code: 'ENV_MISSING' });
  if (isMissingTable(err)) return res.status(503).json({ error: `Database table missing: ${err.message}`, code: 'DB_TABLE_MISSING', hint: 'Run the Phase-1 schema migration (create all tables + seed roles), then retry. Status: GET /api/health.' });
  return res.status(500).json({ error: err?.message || fallback, code: 'SERVER_ERROR' });
}

// Phase 3 shared helpers (additive — existing modules untouched)

// Learner scoping: parents -> linked children, learners -> self, staff -> null (all)
export async function scopedLearnerIds(me) {
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

// Configurable document numbering (invoice/payment/receipt). Falls back to a
// timestamp-based number if the sequences table is not configured yet.
export async function nextDocNumber(kind, fallbackPrefix) {
  try {
    const { data: seq, error } = await supabase.from('invoice_sequences').select('*').eq('kind', kind).eq('is_default', true).maybeSingle();
    if (error || !seq) throw new Error('no sequence');
    const year = new Date().getFullYear();
    const num = `${seq.prefix || fallbackPrefix}/${year}/${String(seq.next_number || 1).padStart(seq.padding ?? 4, '0')}${seq.suffix || ''}`;
    await supabase.from('invoice_sequences').update({ next_number: (seq.next_number || 1) + 1 }).eq('id', seq.id);
    return num;
  } catch {
    const year = new Date().getFullYear();
    return `${fallbackPrefix}/${year}/${Date.now().toString(36).toUpperCase()}`;
  }
}

// In-app notification fan-out (best-effort; never breaks the caller)
export async function notifyUsers(userIds, { type, title, body, link }) {
  try {
    const ids = [...new Set((userIds || []).filter(Boolean))];
    if (!ids.length) return;
    await supabase.from('notifications').insert(ids.map((uid) => ({
      user_id: uid, type: type || 'general', title, body: body || null, link: link || null, is_read: false,
    })));
  } catch (e) { console.error('notify failed:', e.message); }
}

export async function learnerPortalUserIds(learnerId) {
  try {
    const { data: learner } = await supabase.from('learners').select('id,app_user_id').eq('id', learnerId).maybeSingle();
    const { data: links } = await supabase.from('learner_parent_links').select('parent_id').eq('learner_id', learnerId);
    const parentIds = (links || []).map((l) => l.parent_id);
    let parentUsers = [];
    if (parentIds.length) {
      const { data: parents } = await supabase.from('parents').select('app_user_id').in('id', parentIds);
      parentUsers = (parents || []).map((p) => p.app_user_id).filter(Boolean);
    }
    return [...(learner?.app_user_id ? [learner.app_user_id] : []), ...parentUsers];
  } catch { return []; }
}
