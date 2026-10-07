import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, KeyRound, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { get, post, put, del } from '../lib/api';
import { Card, Button, Input, Select, Field, Badge, Spinner, ErrorState, EmptyState, PageHeader, Modal, ConfirmDialog, Tabs, useToast, Toast } from '../components/ui';
import { formatDateTime } from '../lib/constants';

export default function Users() {
  const { can, user: me } = useAuth();
  const canManageUsers = can('users.manage');
  const canManageRoles = can('roles.manage');
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [deletingUser, setDeletingUser] = useState<any>(null);
  const [delLoading, setDelLoading] = useState(false);
  const [resetUser, setResetUser] = useState<any>(null);
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [editingRole, setEditingRole] = useState<any>(null);
  const [deletingRole, setDeletingRole] = useState<any>(null);
  const [tempPw, setTempPw] = useState<string | null>(null);
  const { showSuccess, showError, toast } = useToast();

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [u, r, c] = await Promise.all([get('/api/users'), get('/api/roles'), get('/api/roles?catalog=1')]);
      setUsers(u); setRoles(r); setCatalog(c);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); // eslint-disable-next-line
  }, []);

  const doDeleteUser = async () => {
    setDelLoading(true);
    try { await del(`/api/users?id=${deletingUser.id}`); showSuccess('User deleted'); setDeletingUser(null); load(); }
    catch (e: any) { showError(e.message); } finally { setDelLoading(false); }
  };
  const doDeleteRole = async () => {
    setDelLoading(true);
    try { await del(`/api/roles?id=${deletingRole.id}`); showSuccess('Role deleted'); setDeletingRole(null); load(); }
    catch (e: any) { showError(e.message); } finally { setDelLoading(false); }
  };

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <Toast toast={toast} />
      <PageHeader title="Users & Roles" subtitle="Accounts, role-based permissions and access control" />
      <Tabs tabs={[{ key: 'users', label: 'Users', count: users.length }, { key: 'roles', label: 'Roles', count: roles.length }]} active={tab} onChange={setTab} />
      {tab === 'users' ? (
        <div className="mt-4">
          {canManageUsers && <div className="mb-4"><Button onClick={() => { setEditingUser(null); setShowUserForm(true); }}><Plus className="h-4 w-4" /> Create user</Button></div>}
          {users.length === 0 ? <EmptyState title="No users" /> : (
            <Card><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm">
              <thead><tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Name</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Last login</th><th className="px-4 py-3 text-right">Actions</th>
              </tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3"><p className="font-medium text-slate-800">{u.full_name}{u.id === me?.id && <span className="ml-2 text-xs text-slate-400">(you)</span>}</p><p className="text-xs text-slate-500">{u.email}</p></td>
                    <td className="px-4 py-3"><Badge tone="blue">{u.roles?.name}</Badge></td>
                    <td className="px-4 py-3"><Badge tone={u.status === 'Active' ? 'green' : 'slate'}>{u.status}</Badge></td>
                    <td className="px-4 py-3 text-xs text-slate-500">{u.last_login ? formatDateTime(u.last_login) : 'Never'}</td>
                    <td className="px-4 py-3"><div className="flex justify-end gap-1">
                      {canManageUsers && <>
                        <button onClick={() => { setEditingUser(u); setShowUserForm(true); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="Edit"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => setResetUser(u)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="Reset password"><KeyRound className="h-4 w-4" /></button>
                        {u.id !== me?.id && <button onClick={() => setDeletingUser(u)} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700" title="Delete"><Trash2 className="h-4 w-4" /></button>}
                      </>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table></div></Card>
          )}
        </div>
      ) : (
        <div className="mt-4">
          {canManageRoles && <div className="mb-4"><Button onClick={() => { setEditingRole(null); setShowRoleForm(true); }}><Plus className="h-4 w-4" /> Create role</Button></div>}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {roles.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100"><ShieldCheck className="h-4 w-4 text-emerald-700" /></div>
                    <div><p className="text-sm font-bold text-slate-900">{r.name}</p><p className="text-xs text-slate-500">{users.filter((u) => u.role_id === r.id).length} user(s)</p></div>
                  </div>
                  {canManageRoles && (
                    <div className="flex gap-0.5">
                      <button onClick={() => { setEditingRole(r); setShowRoleForm(true); }} className="rounded p-1.5 text-slate-500 hover:bg-slate-100"><Pencil className="h-4 w-4" /></button>
                      {r.name !== 'Administrator' && <button onClick={() => setDeletingRole(r)} className="rounded p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>}
                    </div>
                  )}
                </div>
                {r.description && <p className="mt-2 text-xs text-slate-500">{r.description}</p>}
                <div className="mt-2.5 flex flex-wrap gap-1">
                  {(r.permissions || []).includes('*') ? <Badge tone="emerald">Full access (*)</Badge> : (r.permissions || []).slice(0, 6).map((p: string) => <span key={p} className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">{p}</span>)}
                  {(r.permissions || []).length > 6 && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">+{(r.permissions || []).length - 6} more</span>}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
      {showUserForm && <UserForm roles={roles} initial={editingUser} onSaved={(tmp?: string) => { setShowUserForm(false); if (tmp) setTempPw(tmp); load(); }} onClose={() => setShowUserForm(false)} />}
      {showRoleForm && <RoleForm catalog={catalog} initial={editingRole} onSaved={() => { setShowRoleForm(false); load(); }} onClose={() => setShowRoleForm(false)} />}
      {resetUser && <ResetPwModal user={resetUser} onDone={() => { setResetUser(null); load(); }} onClose={() => setResetUser(null)} />}
      {tempPw && <Modal title="Temporary password" subtitle="Share this securely — it will not be shown again" onClose={() => setTempPw(null)}><p className="rounded-xl bg-slate-100 p-4 text-center font-mono text-lg font-bold">{tempPw}</p><div className="mt-4 flex justify-end"><Button onClick={() => setTempPw(null)}>Done</Button></div></Modal>}
      {deletingUser && <ConfirmDialog title="Delete user" message={`Delete ${deletingUser.full_name} (${deletingUser.email})? Their profile links will be unlinked.`} onConfirm={doDeleteUser} onCancel={() => setDeletingUser(null)} loading={delLoading} />}
      {deletingRole && <ConfirmDialog title="Delete role" message={`Delete the "${deletingRole.name}" role?`} onConfirm={doDeleteRole} onCancel={() => setDeletingRole(null)} loading={delLoading} />}
    </div>
  );
}

function UserForm({ roles, initial, onSaved, onClose }: any) {
  const [form, setForm] = useState({ full_name: initial?.full_name || '', email: initial?.email || '', phone: initial?.phone || '', role_id: initial?.role_id || '', status: initial?.status || 'Active', password: '' });
  const [saving, setSaving] = useState(false);
  const { showError, showSuccess, toast } = useToast();
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.email.trim() || !form.role_id) { showError('Name, email and role are required'); return; }
    if (form.password && form.password.length < 8) { showError('Password must be at least 8 characters'); return; }
    setSaving(true);
    try {
      if (initial?.id) { await put('/api/users', { id: initial.id, full_name: form.full_name.trim(), role_id: Number(form.role_id), phone: form.phone || null, status: form.status }); showSuccess('User updated'); onSaved(); }
      else {
        const res = await post('/api/users', { full_name: form.full_name.trim(), email: form.email.trim(), role_id: Number(form.role_id), phone: form.phone || null, status: form.status, password: form.password || undefined });
        showSuccess('User created'); onSaved(res._temp_password);
      }
    } catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };
  return (
    <Modal title={initial ? 'Edit user' : 'Create user'} subtitle={initial ? initial.email : 'A login account with role-based access'} onClose={onClose}>
      <Toast toast={toast} />
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Full name" required><Input value={form.full_name} onChange={(e) => set('full_name', e.target.value)} /></Field>
          <Field label="Email" required><Input type="email" value={form.email} disabled={!!initial} onChange={(e) => set('email', e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Role" required><Select value={form.role_id} onChange={(e) => set('role_id', e.target.value)}><option value="">— Select —</option>{roles.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
          <Field label="Status"><Select value={form.status} onChange={(e) => set('status', e.target.value)}><option>Active</option><option>Inactive</option></Select></Field>
        </div>
        <Field label="Phone"><Input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        {!initial && <Field label="Password (optional — auto-generated if blank)"><Input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="Min. 8 characters" /></Field>}
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>{initial ? 'Save' : 'Create user'}</Button></div>
      </form>
    </Modal>
  );
}

function RoleForm({ catalog, initial, onSaved, onClose }: any) {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [perms, setPerms] = useState<string[]>(initial?.permissions || []);
  const [saving, setSaving] = useState(false);
  const { showError, showSuccess, toast } = useToast();
  const toggle = (p: string) => setPerms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { showError('Role name is required'); return; }
    setSaving(true);
    try {
      if (initial?.id) await put('/api/roles', { id: initial.id, name: name.trim(), description: description || null, permissions: perms });
      else await post('/api/roles', { name: name.trim(), description: description || null, permissions: perms });
      showSuccess('Role saved'); setTimeout(onSaved, 400);
    } catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };
  const isAdmin = initial?.name === 'Administrator';
  return (
    <Modal title={initial ? 'Edit role' : 'Create role'} subtitle="Toggle granular permissions" onClose={onClose} wide>
      <Toast toast={toast} />
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Role name" required><Input value={name} disabled={isAdmin} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Description"><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        </div>
        {isAdmin ? <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">The Administrator role always has full access and cannot be restricted.</p> : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {catalog.map((p: any) => (
              <label key={p.key} className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm transition ${perms.includes(p.key) ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'}`}>
                <input type="checkbox" checked={perms.includes(p.key)} onChange={() => toggle(p.key)} className="mt-0.5 h-4 w-4 accent-emerald-700" />
                <span><span className="font-medium text-slate-800">{p.label}</span><span className="block font-mono text-[11px] text-slate-400">{p.key}</span></span>
              </label>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Save role</Button></div>
      </form>
    </Modal>
  );
}

function ResetPwModal({ user, onDone, onClose }: any) {
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const { showError, showSuccess, toast } = useToast();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { showError('Password must be at least 8 characters'); return; }
    setSaving(true);
    try { await put('/api/users', { id: user.id, password }); showSuccess('Password reset'); setTimeout(onDone, 400); }
    catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };
  return (
    <Modal title="Reset password" subtitle={user.email} onClose={onClose}>
      <Toast toast={toast} />
      <form onSubmit={submit} className="space-y-4">
        <Field label="New password" required><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters" /></Field>
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Reset password</Button></div>
      </form>
    </Modal>
  );
}
