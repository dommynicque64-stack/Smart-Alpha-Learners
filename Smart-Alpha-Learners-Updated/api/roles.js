import supabase from './db-client.js';
import { preflight, getSession, can, audit } from './_auth.js';

export const PERMISSION_CATALOG = [
  { key: 'dashboard.admin', label: 'Admin dashboard & metrics' },
  { key: 'dashboard.teacher', label: 'Teacher dashboard' },
  { key: 'dashboard.learner', label: 'Learner dashboard' },
  { key: 'dashboard.parent', label: 'Parent dashboard' },
  { key: 'dashboard.finance', label: 'Finance dashboard' },
  { key: 'school.manage', label: 'Manage school setup' },
  { key: 'users.manage', label: 'Manage users' },
  { key: 'users.view', label: 'View users' },
  { key: 'roles.manage', label: 'Manage roles & permissions' },
  { key: 'academic.manage', label: 'Manage academic structure' },
  { key: 'learners.manage', label: 'Manage learners (full)' },
  { key: 'learners.edit', label: 'Edit learners' },
  { key: 'learners.view', label: 'View learners' },
  { key: 'parents.manage', label: 'Manage parents/guardians' },
  { key: 'parents.view', label: 'View parents/guardians' },
  { key: 'teachers.manage', label: 'Manage teachers & staff' },
  { key: 'teachers.view', label: 'View teachers & staff' },
  { key: 'attendance.manage', label: 'Manage all attendance' },
  { key: 'attendance.mark', label: 'Mark attendance (assigned)' },
  { key: 'attendance.view', label: 'View attendance' },
  { key: 'curriculum.manage', label: 'Manage curriculum engine' },
  { key: 'curriculum.view', label: 'View curriculum' },
  { key: 'observations.manage', label: 'Record competencies & observations' },
  { key: 'timetable.manage', label: 'Manage timetables' },
  { key: 'timetable.view', label: 'View timetables' },
  { key: 'import.run', label: 'Run data imports' },
  { key: 'audit.view', label: 'View audit log' },
  { key: 'finance.structures', label: 'Manage fee structures & categories' },
  { key: 'finance.invoices', label: 'Manage invoices' },
  { key: 'finance.payments', label: 'Record payments & receipts' },
  { key: 'finance.reports', label: 'View financial reports' },
  { key: 'finance.view', label: 'View own/children finance (parent/learner)' },
  { key: 'comm.manage', label: 'Manage announcements & providers' },
  { key: 'comm.view', label: 'View communication centre' },
  { key: 'events.manage', label: 'Manage calendar & events' },
  { key: 'events.view', label: 'View calendar & events' },
  { key: 'discipline.manage', label: 'Manage discipline records' },
  { key: 'discipline.view', label: 'View discipline records' },
  { key: 'staff.manage', label: 'Manage staff records & leave' },
  { key: 'staff.view', label: 'View staff directory' },
  { key: 'library.manage', label: 'Manage library catalogue' },
  { key: 'library.borrow', label: 'Issue & receive books' },
  { key: 'library.view', label: 'View library' },
  { key: 'inventory.manage', label: 'Manage inventory & assets' },
  { key: 'inventory.view', label: 'View inventory' },
  { key: 'transport.manage', label: 'Manage transport' },
  { key: 'transport.view', label: 'View transport' },
  { key: 'reports.view', label: 'View role reports hub' },
];

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    const me = session.profile;
    if (req.method === 'GET') {
      if (req.query.catalog === '1') return res.status(200).json(PERMISSION_CATALOG);
      if (!can(me, ['roles.manage', 'users.manage', 'users.view'])) return res.status(403).json({ error: 'Forbidden' });
      const { data, error } = await supabase.from('roles').select('*').order('id');
      if (error) throw error;
      return res.status(200).json(data);
    }
    if (req.method === 'POST') {
      if (!can(me, 'roles.manage')) return res.status(403).json({ error: 'Forbidden' });
      const { name, description, permissions } = req.body || {};
      if (!name) return res.status(400).json({ error: 'Role name is required' });
      const { data, error } = await supabase.from('roles').insert({ name, description: description || null, permissions: permissions || [] }).select('*').single();
      if (error) throw error;
      await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'roles.create', entityType: 'roles', recordId: data.id, details: { name } });
      return res.status(201).json(data);
    }
    if (req.method === 'PUT') {
      if (!can(me, 'roles.manage')) return res.status(403).json({ error: 'Forbidden' });
      const { id, name, description, permissions } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Missing role id' });
      const patch = { updated_at: new Date().toISOString() };
      if (name !== undefined) patch.name = name;
      if (description !== undefined) patch.description = description;
      if (permissions !== undefined) patch.permissions = permissions;
      const { data, error } = await supabase.from('roles').update(patch).eq('id', id).select('*').single();
      if (error) throw error;
      await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'roles.update', entityType: 'roles', recordId: id, details: { name: data.name } });
      return res.status(200).json(data);
    }
    if (req.method === 'DELETE') {
      if (!can(me, 'roles.manage')) return res.status(403).json({ error: 'Forbidden' });
      const id = req.query.id || req.body?.id;
      if (!id) return res.status(400).json({ error: 'Missing role id' });
      const { data: role } = await supabase.from('roles').select('name').eq('id', id).maybeSingle();
      if (role?.name === 'Administrator') return res.status(400).json({ error: 'The Administrator role cannot be deleted' });
      const { count } = await supabase.from('app_users').select('id', { count: 'exact', head: true }).eq('role_id', id);
      if (count > 0) return res.status(400).json({ error: `This role is assigned to ${count} user(s)` });
      const { error } = await supabase.from('roles').delete().eq('id', id);
      if (error) throw error;
      await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'roles.delete', entityType: 'roles', recordId: id });
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API roles error:', err);
    res.status(500).json({ error: err.message });
  }
}
