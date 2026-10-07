import supabase from './db-client.js';
import { preflight, getSession, can } from './_auth.js';

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    if (!can(session.profile, 'audit.view')) return res.status(403).json({ error: 'Forbidden' });
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const page = Math.max(Number(req.query.page) || 1, 1);
    const pageSize = Math.min(Number(req.query.page_size) || 50, 200);
    let q = supabase.from('audit_logs').select('*', { count: 'exact' }).order('created_at', { ascending: false }).order('id', { ascending: false });
    if (req.query.action) q = q.ilike('action', `%${req.query.action}%`);
    if (req.query.entity_type) q = q.eq('entity_type', req.query.entity_type);
    if (req.query.user_email) q = q.ilike('user_email', `%${req.query.user_email}%`);
    if (req.query.from) q = q.gte('created_at', req.query.from);
    if (req.query.to) q = q.lte('created_at', `${req.query.to}T23:59:59`);
    q = q.range((page - 1) * pageSize, page * pageSize - 1);
    const { data, error, count } = await q;
    if (error) throw error;
    return res.status(200).json({ rows: data, count: count || 0, page, page_size: pageSize });
  } catch (err) {
    console.error('API audit error:', err);
    res.status(500).json({ error: err.message });
  }
}
