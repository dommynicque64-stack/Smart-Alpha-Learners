import { useState } from 'react';
import { KeyRound, User, Palette, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { post } from '../lib/api';
import { Card, Button, Input, Field, PageHeader, Badge, useToast, Toast } from '../components/ui';
import { formatDateTime } from '../lib/constants';
import { useTheme, THEME_OPTIONS } from '../contexts/ThemeContext';

export default function Profile() {
  const { user, logout, refreshUser } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const { showSuccess, showError, toast } = useToast();
  const { theme, setTheme } = useTheme();
  const role = (user?.roles?.name || '').trim().toLowerCase();
  const isSuperAdmin = role === 'super admin' || role === 'administrator';

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 8) { showError('New password must be at least 8 characters'); return; }
    if (next !== confirm) { showError('New passwords do not match'); return; }
    setSaving(true);
    try {
      await post('/api/auth', { action: 'change-password', current_password: current || undefined, new_password: next });
      showSuccess('Password changed — please sign in again');
      setTimeout(async () => { await logout(); window.location.href = '/login'; }, 1200);
    } catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };

  return (
    <div>
      <Toast toast={toast} />
      <PageHeader title="My Profile & Security" subtitle="Your account details and password" />
      {isSuperAdmin && (
        <Card className="mb-4 p-5">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500"><Palette className="h-4 w-4" /> Theme Selection</h3>
          <p className="mb-4 text-sm text-slate-500">Choose the visual theme used throughout Smart Alpha Learners on this browser.</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {THEME_OPTIONS.map((option) => {
              const selected = theme === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setTheme(option.id)}
                  className={`theme-option relative rounded-xl border-2 p-4 text-left transition ${selected ? 'theme-option-selected' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                  aria-pressed={selected}
                >
                  {selected && <span className="theme-option-check absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full text-white"><Check className="h-4 w-4" /></span>}
                  <div className="mb-3 flex gap-2">
                    <span className="h-7 w-7 rounded-md border border-black/10" style={{ backgroundColor: option.primary }} />
                    <span className="h-7 w-7 rounded-md border border-black/10" style={{ backgroundColor: option.background }} />
                  </div>
                  <p className="font-bold text-slate-900">{option.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{option.description}</p>
                </button>
              );
            })}
          </div>
        </Card>
      )}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500"><User className="h-4 w-4" /> Account</h3>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-700 text-lg font-bold text-white">
              {(user?.full_name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
            </div>
            <div>
              <p className="font-bold text-slate-900">{user?.full_name}</p>
              <p className="text-sm text-slate-500">{user?.email}</p>
            </div>
          </div>
          <dl className="mt-5 space-y-2.5 text-sm">
            <div className="flex justify-between border-b border-slate-50 pb-2"><dt className="text-slate-500">Role</dt><dd><Badge tone="blue">{user?.roles?.name}</Badge></dd></div>
            <div className="flex justify-between border-b border-slate-50 pb-2"><dt className="text-slate-500">Status</dt><dd><Badge tone={user?.status === 'Active' ? 'green' : 'slate'}>{user?.status}</Badge></dd></div>
            <div className="flex justify-between border-b border-slate-50 pb-2"><dt className="text-slate-500">Phone</dt><dd className="font-medium">{user?.phone || '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Last login</dt><dd className="font-medium">{user?.last_login ? formatDateTime(user.last_login) : '—'}</dd></div>
          </dl>
          <div className="mt-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">My permissions ({(user?.roles?.permissions || []).length})</p>
            <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
              {(user?.roles?.permissions || []).includes('*') ? <Badge tone="emerald">Full access (*)</Badge>
                : (user?.roles?.permissions || []).map((p: string) => <span key={p} className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">{p}</span>)}
            </div>
          </div>
          <Button variant="secondary" className="mt-4" onClick={() => refreshUser()}>Refresh my session</Button>
        </Card>
        <Card className="p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500"><KeyRound className="h-4 w-4" /> Change password</h3>
          <form onSubmit={changePassword} className="space-y-4">
            <Field label="Current password"><Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Required to confirm" /></Field>
            <Field label="New password" required><Input type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="Min. 8 characters" /></Field>
            <Field label="Confirm new password" required><Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
            <Button type="submit" loading={saving}>Change password</Button>
          </form>
          <div className="mt-6 rounded-xl bg-slate-50 p-4 text-xs text-slate-500">
            <p className="font-semibold text-slate-700">Security notes</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4">
              <li>Passwords are stored as salted hashes — never in plain text.</li>
              <li>Sessions expire automatically; changing your password signs you out everywhere.</li>
              <li>Password changes and sign-ins are recorded in the audit log.</li>
            </ul>
          </div>
        </Card>
      </div>
    </div>
  );
}
