import supabase from './db-client.js';
import { preflight, getSession, can, audit } from './_auth.js';

const BUCKET = 'school-assets';

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    const me = session.profile;
    if (!can(me, ['school.manage', 'learners.manage', 'teachers.manage'])) return res.status(403).json({ error: 'Forbidden' });
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { fileName, fileBase64, contentType, folder } = req.body || {};
    if (!fileName || !fileBase64) return res.status(400).json({ error: 'File name and content are required' });
    const safe = String(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${folder || 'misc'}/${Date.now()}-${safe}`;
    const buffer = Buffer.from(fileBase64, 'base64');
    if (buffer.length > 5 * 1024 * 1024) return res.status(400).json({ error: 'File too large (max 5MB)' });
    const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, { contentType: contentType || 'application/octet-stream', upsert: true });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'storage.upload', entityType: 'storage', recordId: path });
    return res.status(200).json({ url: urlData.publicUrl, path });
  } catch (err) {
    console.error('API upload error:', err);
    res.status(500).json({ error: err.message });
  }
}
