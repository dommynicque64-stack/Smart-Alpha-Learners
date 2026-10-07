import supabase from './db-client.js';
import { preflight, getSession, can, audit, roleName, serverError, notifyUsers } from './_auth.js';

const RESOURCES = ['announcements', 'messages', 'notifications', 'providers', 'events', 'calendar', 'directory'];

function audienceUserIds(audience, senderId) {
  // Resolves an audience label to app_user ids. 'All' = everyone active.
  return supabase.from('app_users').select('id,role_id,roles(name)').eq('status', 'Active').then(({ data }) => {
    const users = data || [];
    if (!audience || audience === 'All') return users.map((u) => u.id).filter((id) => id !== senderId);
    const map = {
      Parents: ['Parent/Guardian'], Teachers: ['Teacher', 'Class Teacher', 'Academic Administrator'],
      Learners: ['Learner'], Staff: ['Teacher', 'Class Teacher', 'Academic Administrator', 'Administrator', 'Finance Officer'],
    };
    const roles = map[audience] || [audience];
    return users.filter((u) => roles.includes(u.roles?.name)).map((u) => u.id).filter((id) => id !== senderId);
  });
}

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    const me = session.profile;
    const resource = req.query.resource;
    if (!RESOURCES.includes(resource)) return res.status(400).json({ error: 'Unknown resource' });

    const canCommManage = can(me, 'comm.manage');
    const canCommView = canCommManage || can(me, 'comm.view') || ['Parent/Guardian', 'Learner', 'Teacher', 'Class Teacher'].includes(roleName(me));
    const canEventManage = can(me, 'events.manage');
    const canEventView = canEventManage || can(me, 'events.view');

    // ---------------- GET ----------------
    if (req.method === 'GET') {
      if (resource === 'announcements') {
        if (!canCommView) return res.status(403).json({ error: 'Forbidden' });
        let q = supabase.from('announcements').select('*').order('publish_date', { ascending: false }).order('id', { ascending: false }).limit(200);
        if (!canCommManage) q = q.eq('status', 'Published');
        if (req.query.audience) q = q.in('audience', [req.query.audience, 'All']);
        const { data, error } = await q;
        if (error) throw error;
        return res.status(200).json(data);
      }
      if (resource === 'messages') {
        if (!canCommView) return res.status(403).json({ error: 'Forbidden' });
        const box = req.query.box || 'inbox';
        let q = supabase.from('messages').select('*').order('id', { ascending: false }).limit(200);
        if (box === 'inbox') q = q.eq('recipient_id', me.id);
        else q = q.eq('sender_id', me.id);
        const { data, error } = await q;
        if (error) throw error;
        if (!data.length) return res.status(200).json([]);
        const uids = [...new Set([...data.map((m) => m.sender_id), ...data.map((m) => m.recipient_id).filter(Boolean)])];
        const { data: users } = await supabase.from('app_users').select('id,full_name,email').in('id', uids);
        const um = Object.fromEntries((users || []).map((u) => [u.id, u]));
        return res.status(200).json(data.map((m) => ({ ...m, sender_name: um[m.sender_id]?.full_name || '', recipient_name: m.recipient_id ? (um[m.recipient_id]?.full_name || '') : (m.audience || 'Group') })));
      }
      if (resource === 'notifications') {
        // Every authenticated user has their own inbox
        let q = supabase.from('notifications').select('*').eq('user_id', me.id).order('id', { ascending: false }).limit(Math.min(Number(req.query.limit) || 50, 200));
        if (req.query.unread === '1') q = q.eq('is_read', false);
        const { data, error } = await q;
        if (error) throw error;
        const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', me.id).eq('is_read', false);
        return res.status(200).json({ rows: data, unread: count || 0 });
      }
      if (resource === 'providers') {
        if (!canCommManage) return res.status(403).json({ error: 'Forbidden' });
        const { data, error } = await supabase.from('communication_providers').select('id,kind,name,is_active,config_public,created_at');
        if (error) throw error;
        return res.status(200).json(data);
      }
      if (resource === 'directory') {
        if (!canCommView) return res.status(403).json({ error: 'Forbidden' });
        const { data, error } = await supabase.from('app_users').select('id,full_name,email,roles(name)').eq('status', 'Active').order('full_name').limit(500);
        if (error) throw error;
        return res.status(200).json((data || []).filter((u) => u.id !== me.id).map((u) => ({ id: u.id, full_name: u.full_name, email: u.email, role_name: u.roles?.name || '' })));
      }
      if (resource === 'events' || resource === 'calendar') {
        if (!canEventView) return res.status(403).json({ error: 'Forbidden' });
        let q = supabase.from('school_events').select('*').order('start_date').order('start_time').limit(500);
        if (req.query.from) q = q.gte('start_date', req.query.from);
        if (req.query.to) q = q.lte('start_date', req.query.to);
        if (req.query.audience) q = q.in('audience', [req.query.audience, 'All']);
        if (req.query.type) q = q.eq('event_type', req.query.type);
        const { data, error } = await q;
        if (error) throw error;
        return res.status(200).json(data);
      }
    }

    // ---------------- POST ----------------
    if (req.method === 'POST') {
      const b = req.body || {};
      if (resource === 'announcements') {
        if (!canCommManage) return res.status(403).json({ error: 'Forbidden' });
        if (!b.title || !b.body) return res.status(400).json({ error: 'Title and body are required' });
        const { data, error } = await supabase.from('announcements').insert({
          school_id: me.school_id, title: b.title, body: b.body, audience: b.audience || 'All',
          publish_date: b.publish_date || new Date().toISOString().slice(0, 10), expiry_date: b.expiry_date || null,
          status: b.status || 'Published', created_by: me.id,
        }).select('*').single();
        if (error) throw error;
        if (data.status === 'Published') {
          const ids = await audienceUserIds(data.audience, me.id);
          await notifyUsers(ids, { type: 'announcement', title: data.title, body: (data.body || '').slice(0, 160), link: '/communication' });
        }
        await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'comm.announcement_create', entityType: 'announcements', recordId: data.id, details: { title: b.title } });
        return res.status(201).json(data);
      }
      if (resource === 'messages') {
        if (!canCommView) return res.status(403).json({ error: 'Forbidden' });
        if (!b.subject || !b.body || (!b.recipient_id && !b.audience)) return res.status(400).json({ error: 'Subject, body and a recipient (user or audience) are required' });
        if (roleName(me) === 'Learner' && b.audience) return res.status(403).json({ error: 'Learners can only message individuals' });
        const { data, error } = await supabase.from('messages').insert({
          school_id: me.school_id, sender_id: me.id, recipient_id: b.recipient_id || null, audience: b.audience || null,
          subject: b.subject, body: b.body, parent_message_id: b.parent_message_id || null, is_read: false,
        }).select('*').single();
        if (error) throw error;
        const targets = b.recipient_id ? [b.recipient_id] : await audienceUserIds(b.audience, me.id);
        await notifyUsers(targets, { type: 'message', title: `New message: ${b.subject}`, body: `From ${me.full_name}`, link: '/communication?tab=messages' });
        await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'comm.message_send', entityType: 'messages', recordId: data.id });
        return res.status(201).json(data);
      }
      if (resource === 'providers') {
        if (!canCommManage) return res.status(403).json({ error: 'Forbidden' });
        if (!b.kind || !b.name) return res.status(400).json({ error: 'Kind (email/sms) and name are required' });
        // NOTE: secret credentials (api keys) are NEVER accepted/stored in plain fields.
        // Store only non-secret public config here; secrets belong in Netlify environment variables.
        if (b.api_key || b.secret || b.password) return res.status(400).json({ error: 'Do not submit API keys/secrets here. Configure provider secrets as server environment variables.' });
        const { data, error } = await supabase.from('communication_providers').insert({
          school_id: me.school_id, kind: b.kind, name: b.name, is_active: b.is_active !== false,
          config_public: b.config_public || null, sender_id: b.sender_id || null,
        }).select('*').single();
        if (error) throw error;
        await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'comm.provider_create', entityType: 'communication_providers', recordId: data.id, details: { kind: b.kind, name: b.name } });
        return res.status(201).json(data);
      }
      if (resource === 'events') {
        if (!canEventManage) return res.status(403).json({ error: 'Forbidden' });
        if (!b.title || !b.start_date) return res.status(400).json({ error: 'Title and start date are required' });
        const { data, error } = await supabase.from('school_events').insert({
          school_id: me.school_id, title: b.title, description: b.description || null, event_type: b.event_type || 'General',
          start_date: b.start_date, end_date: b.end_date || b.start_date, start_time: b.start_time || null, end_time: b.end_time || null,
          location: b.location || null, audience: b.audience || 'All', organizer: b.organizer || me.full_name,
          attachment_url: b.attachment_url || null, academic_year_id: b.academic_year_id || null, term_id: b.term_id || null, created_by: me.id,
        }).select('*').single();
        if (error) throw error;
        if (b.notify_audience) {
          const ids = await audienceUserIds(data.audience, me.id);
          await notifyUsers(ids, { type: 'event', title: `Upcoming: ${data.title}`, body: `${data.start_date}${data.location ? ` · ${data.location}` : ''}`, link: '/calendar' });
        }
        await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'events.create', entityType: 'school_events', recordId: data.id, details: { title: b.title } });
        return res.status(201).json(data);
      }
      if (resource === 'notifications' && b.action === 'broadcast') {
        // Staff broadcast (e.g. fee reminders) — finance/admin only
        if (!can(me, ['comm.manage', 'finance.invoices', 'finance.payments'])) return res.status(403).json({ error: 'Forbidden' });
        if (!b.title) return res.status(400).json({ error: 'Title is required' });
        let ids = [];
        if (b.learner_ids?.length) {
          const { data: links } = await supabase.from('learner_parent_links').select('parent_id').in('learner_id', b.learner_ids);
          const pids = [...new Set((links || []).map((l) => l.parent_id))];
          if (pids.length) {
            const { data: parents } = await supabase.from('parents').select('app_user_id').in('id', pids);
            ids = (parents || []).map((p) => p.app_user_id).filter(Boolean);
          }
        } else if (b.audience) {
          ids = await audienceUserIds(b.audience, me.id);
        } else return res.status(400).json({ error: 'learner_ids or audience is required' });
        await notifyUsers(ids, { type: b.type || 'general', title: b.title, body: b.body || null, link: b.link || null });
        await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'comm.broadcast', entityType: 'notifications', recordId: null, details: { title: b.title, count: ids.length } });
        return res.status(200).json({ ok: true, notified: ids.length });
      }
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // ---------------- PUT ----------------
    if (req.method === 'PUT') {
      const b = req.body || {};
      if (resource === 'notifications') {
        if (b.action === 'read-all') {
          await supabase.from('notifications').update({ is_read: true }).eq('user_id', me.id).eq('is_read', false);
          return res.status(200).json({ ok: true });
        }
        if (!b.id) return res.status(400).json({ error: 'Missing id' });
        const { data, error } = await supabase.from('notifications').update({ is_read: b.is_read !== false }).eq('id', b.id).eq('user_id', me.id).select('*').single();
        if (error) throw error;
        return res.status(200).json(data);
      }
      if (resource === 'messages') {
        if (!b.id) return res.status(400).json({ error: 'Missing id' });
        // Only the recipient can mark read
        const { data: cur } = await supabase.from('messages').select('*').eq('id', b.id).single();
        if (!cur) return res.status(404).json({ error: 'Message not found' });
        if (cur.recipient_id !== me.id) return res.status(403).json({ error: 'Forbidden' });
        const { data, error } = await supabase.from('messages').update({ is_read: true }).eq('id', b.id).select('*').single();
        if (error) throw error;
        return res.status(200).json(data);
      }
      if (!b.id) return res.status(400).json({ error: 'Missing id' });
      if (resource === 'announcements') {
        if (!canCommManage) return res.status(403).json({ error: 'Forbidden' });
        const patch = { ...b };
        delete patch.id;
        const { data, error } = await supabase.from('announcements').update(patch).eq('id', b.id).select('*').single();
        if (error) throw error;
        await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'comm.announcement_update', entityType: 'announcements', recordId: b.id });
        return res.status(200).json(data);
      }
      if (resource === 'providers') {
        if (!canCommManage) return res.status(403).json({ error: 'Forbidden' });
        if (b.api_key || b.secret || b.password) return res.status(400).json({ error: 'Do not submit API keys/secrets here.' });
        const patch = { ...b };
        delete patch.id;
        const { data, error } = await supabase.from('communication_providers').update(patch).eq('id', b.id).select('id,kind,name,is_active,config_public,created_at').single();
        if (error) throw error;
        await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'comm.provider_update', entityType: 'communication_providers', recordId: b.id });
        return res.status(200).json(data);
      }
      if (resource === 'events') {
        if (!canEventManage) return res.status(403).json({ error: 'Forbidden' });
        const patch = { ...b };
        delete patch.id;
        delete patch.notify_audience;
        const { data, error } = await supabase.from('school_events').update(patch).eq('id', b.id).select('*').single();
        if (error) throw error;
        await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'events.update', entityType: 'school_events', recordId: b.id });
        return res.status(200).json(data);
      }
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // ---------------- DELETE ----------------
    if (req.method === 'DELETE') {
      const id = req.query.id || req.body?.id;
      if (!id) return res.status(400).json({ error: 'Missing id' });
      if (resource === 'announcements' && canCommManage) {
        const { error } = await supabase.from('announcements').delete().eq('id', id);
        if (error) throw error;
        await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'comm.announcement_delete', entityType: 'announcements', recordId: id });
        return res.status(200).json({ ok: true });
      }
      if (resource === 'events' && canEventManage) {
        const { error } = await supabase.from('school_events').delete().eq('id', id);
        if (error) throw error;
        await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'events.delete', entityType: 'school_events', recordId: id });
        return res.status(200).json({ ok: true });
      }
      if (resource === 'providers' && canCommManage) {
        const { error } = await supabase.from('communication_providers').delete().eq('id', id);
        if (error) throw error;
        await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'comm.provider_delete', entityType: 'communication_providers', recordId: id });
        return res.status(200).json({ ok: true });
      }
      if (resource === 'notifications') {
        const { error } = await supabase.from('notifications').delete().eq('id', id).eq('user_id', me.id);
        if (error) throw error;
        return res.status(200).json({ ok: true });
      }
      return res.status(403).json({ error: 'Forbidden' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return serverError(res, err);
  }
}
