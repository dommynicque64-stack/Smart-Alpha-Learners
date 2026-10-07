import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Pencil, Trash2, Send, Megaphone, Inbox, Bell, Plug2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { get, post, put, del } from '../lib/api';
import { Card, Button, Input, Select, Field, Badge, Spinner, ErrorState, EmptyState, PageHeader, Modal, ConfirmDialog, Tabs, Textarea, useToast, Toast } from '../components/ui';
import { formatDate, formatDateTime, todayISO } from '../lib/constants';

const AUDIENCES = ['All', 'Parents', 'Teachers', 'Learners', 'Staff'];

function audienceTone(a: string) {
  if (a === 'All') return 'emerald';
  if (a === 'Parents') return 'blue';
  if (a === 'Teachers' || a === 'Staff') return 'purple';
  return 'amber';
}

export default function Communication() {
  const { can } = useAuth();
  const [params] = useSearchParams();
  const canManage = can('comm.manage');
  const [tab, setTab] = useState(params.get('tab') || 'announcements');
  const tabs = [
    { key: 'announcements', label: 'Announcements' },
    { key: 'messages', label: 'Messages' },
    { key: 'notifications', label: 'My Notifications' },
  ];
  if (canManage) tabs.push({ key: 'providers', label: 'Providers' });
  return (
    <div>
      <PageHeader title="Communication Centre" subtitle="Announcements, messages, notifications and provider integrations" />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      <div className="mt-4">
        {tab === 'announcements' && <AnnouncementsTab canManage={canManage} />}
        {tab === 'messages' && <MessagesTab />}
        {tab === 'notifications' && <NotificationsTab />}
        {tab === 'providers' && canManage && <ProvidersTab />}
      </div>
    </div>
  );
}

function AnnouncementsTab({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fAudience, setFAudience] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);
  const [delLoading, setDelLoading] = useState(false);
  const { showSuccess, showError, toast } = useToast();
  const load = async () => {
    setLoading(true); setError('');
    try { setRows(await get('/api/communication?resource=announcements')); }
    catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); // eslint-disable-next-line
  }, []);
  const doDelete = async () => {
    setDelLoading(true);
    try { await del(`/api/communication?resource=announcements&id=${deleting.id}`); showSuccess('Deleted'); setDeleting(null); load(); }
    catch (e: any) { showError(e.message); } finally { setDelLoading(false); }
  };
  const filtered = rows.filter((r) => !fAudience || r.audience === fAudience || r.audience === 'All');
  return (
    <div>
      <Toast toast={toast} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="w-56"><Select value={fAudience} onChange={(e) => setFAudience(e.target.value)}><option value="">All audiences</option>{AUDIENCES.map((a) => <option key={a} value={a}>{a}</option>)}</Select></div>
        {canManage && <Button onClick={() => { setEditing(null); setShowForm(true); }}><Plus className="h-4 w-4" /> New announcement</Button>}
      </div>
      {loading ? <Spinner /> : error ? <ErrorState message={error} onRetry={load} /> : filtered.length === 0 ? (
        <EmptyState title="No announcements" subtitle="School-wide notices will appear here." />
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => (
            <Card key={a.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100"><Megaphone className="h-5 w-5 text-emerald-700" /></div>
                  <div>
                    <p className="font-bold text-slate-900">{a.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">Published {formatDate(a.publish_date)}{a.expiry_date ? ` · Expires ${formatDate(a.expiry_date)}` : ''}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={audienceTone(a.audience) as any}>{a.audience}</Badge>
                  {a.status !== 'Published' && <Badge tone="slate">{a.status}</Badge>}
                  {canManage && <>
                    <button onClick={() => { setEditing(a); setShowForm(true); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => setDeleting(a)} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                  </>}
                </div>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{a.body}</p>
            </Card>
          ))}
        </div>
      )}
      {showForm && <AnnouncementForm initial={editing} onSaved={() => { setShowForm(false); load(); }} onClose={() => setShowForm(false)} />}
      {deleting && <ConfirmDialog title="Delete announcement" message={`Delete "${deleting.title}"?`} onConfirm={doDelete} onCancel={() => setDeleting(null)} loading={delLoading} />}
    </div>
  );
}

function AnnouncementForm({ initial, onSaved, onClose }: any) {
  const [form, setForm] = useState({ title: initial?.title || '', body: initial?.body || '', audience: initial?.audience || 'All', publish_date: initial?.publish_date || todayISO(), expiry_date: initial?.expiry_date || '', status: initial?.status || 'Published' });
  const [saving, setSaving] = useState(false);
  const { showError, showSuccess, toast } = useToast();
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) { showError('Title and body are required'); return; }
    setSaving(true);
    try {
      const payload = { ...form, expiry_date: form.expiry_date || null };
      if (initial?.id) await put('/api/communication?resource=announcements', { ...payload, id: initial.id });
      else await post('/api/communication?resource=announcements', payload);
      showSuccess(initial?.id ? 'Announcement updated' : 'Announcement published — audience notified');
      setTimeout(onSaved, 400);
    } catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };
  return (
    <Modal title={initial ? 'Edit announcement' : 'New announcement'} onClose={onClose}>
      <Toast toast={toast} />
      <form onSubmit={submit} className="space-y-4">
        <Field label="Title" required><Input value={form.title} onChange={(e) => set('title', e.target.value)} /></Field>
        <Field label="Message" required><Textarea rows={4} value={form.body} onChange={(e) => set('body', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Audience"><Select value={form.audience} onChange={(e) => set('audience', e.target.value)}>{AUDIENCES.map((a) => <option key={a} value={a}>{a}</option>)}</Select></Field>
          <Field label="Status"><Select value={form.status} onChange={(e) => set('status', e.target.value)}><option>Published</option><option>Draft</option></Select></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Publish date"><Input type="date" value={form.publish_date} onChange={(e) => set('publish_date', e.target.value)} /></Field>
          <Field label="Expiry date"><Input type="date" value={form.expiry_date} onChange={(e) => set('expiry_date', e.target.value)} /></Field>
        </div>
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Save</Button></div>
      </form>
    </Modal>
  );
}

function MessagesTab() {
  const [box, setBox] = useState('inbox');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCompose, setShowCompose] = useState(false);
  const [replyTo, setReplyTo] = useState<any>(null);
  const [viewing, setViewing] = useState<any>(null);
  const { toast } = useToast();
  const load = async () => {
    setLoading(true); setError('');
    try { setRows(await get(`/api/communication?resource=messages&box=${box}`)); }
    catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); // eslint-disable-next-line
  }, [box]);
  const openMsg = async (m: any) => {
    setViewing(m);
    if (box === 'inbox' && !m.is_read) {
      try { await put('/api/communication?resource=messages', { id: m.id }); load(); } catch { /* noop */ }
    }
  };
  return (
    <div>
      <Toast toast={toast} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs tabs={[{ key: 'inbox', label: 'Inbox' }, { key: 'sent', label: 'Sent' }]} active={box} onChange={setBox} />
        <Button onClick={() => { setReplyTo(null); setShowCompose(true); }}><Send className="h-4 w-4" /> Compose</Button>
      </div>
      {loading ? <Spinner /> : error ? <ErrorState message={error} onRetry={load} /> : rows.length === 0 ? (
        <EmptyState title={box === 'inbox' ? 'Inbox is empty' : 'No sent messages'} icon={<Inbox className="h-8 w-8 text-slate-300" />} />
      ) : (
        <Card>
          <div className="divide-y divide-slate-100">
            {rows.map((m) => (
              <button key={m.id} onClick={() => openMsg(m)} className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 ${!m.is_read && box === 'inbox' ? 'bg-emerald-50/50' : ''}`}>
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${!m.is_read && box === 'inbox' ? 'bg-emerald-700 text-white' : 'bg-slate-200 text-slate-600'}`}>
                  {(box === 'inbox' ? m.sender_name : (m.recipient_name || '?')).split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm ${!m.is_read && box === 'inbox' ? 'font-bold text-slate-900' : 'font-medium text-slate-800'}`}>{m.subject}</p>
                  <p className="truncate text-xs text-slate-500">{box === 'inbox' ? `From ${m.sender_name}` : `To ${m.recipient_name || m.audience || ''}`} · {formatDateTime(m.created_at)}</p>
                </div>
                {!m.is_read && box === 'inbox' && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-600" />}
              </button>
            ))}
          </div>
        </Card>
      )}
      {viewing && (
        <Modal title={viewing.subject} subtitle={`${box === 'inbox' ? `From ${viewing.sender_name}` : `To ${viewing.recipient_name || viewing.audience || ''}`} · ${formatDateTime(viewing.created_at)}`} onClose={() => setViewing(null)}>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{viewing.body}</p>
          {box === 'inbox' && <div className="mt-5 flex justify-end"><Button variant="outline" onClick={() => { setReplyTo(viewing); setViewing(null); setShowCompose(true); }}>Reply</Button></div>}
        </Modal>
      )}
      {showCompose && <ComposeModal replyTo={replyTo} onSent={() => { setShowCompose(false); setBox('sent'); }} onClose={() => setShowCompose(false)} />}
    </div>
  );
}

function ComposeModal({ replyTo, onSent, onClose }: any) {
  const { roleName } = useAuth();
  const [directory, setDirectory] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [recipientId, setRecipientId] = useState(replyTo?.sender_id || '');
  const [audience, setAudience] = useState('');
  const [subject, setSubject] = useState(replyTo ? `Re: ${replyTo.subject}` : '');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const { showError, showSuccess, toast } = useToast();
  useEffect(() => { get('/api/communication?resource=directory').then(setDirectory).catch(() => {}); }, []);
  const filtered = directory.filter((u) => !q.trim() || `${u.full_name} ${u.email}`.toLowerCase().includes(q.toLowerCase()));
  const isLearner = roleName === 'Learner';
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) { showError('Subject and message are required'); return; }
    if (!recipientId && !audience) { showError('Choose a recipient or an audience'); return; }
    setSaving(true);
    try {
      await post('/api/communication?resource=messages', {
        subject: subject.trim(), body: body.trim(),
        recipient_id: recipientId ? Number(recipientId) : null,
        audience: !recipientId ? audience : null,
        parent_message_id: replyTo?.id || null,
      });
      showSuccess('Message sent');
      setTimeout(onSent, 400);
    } catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };
  return (
    <Modal title={replyTo ? 'Reply' : 'Compose message'} onClose={onClose}>
      <Toast toast={toast} />
      <form onSubmit={submit} className="space-y-4">
        <Field label="Find person"><Input placeholder="Search name or email..." value={q} onChange={(e) => setQ(e.target.value)} /></Field>
        <Field label="Recipient" required={!audience}>
          <Select value={recipientId} onChange={(e) => { setRecipientId(e.target.value); if (e.target.value) setAudience(''); }}>
            <option value="">— Select person —</option>
            {filtered.slice(0, 80).map((u) => <option key={u.id} value={u.id}>{u.full_name} · {u.role_name} ({u.email})</option>)}
          </Select>
        </Field>
        {!isLearner && !recipientId && (
          <Field label="...or message a group"><Select value={audience} onChange={(e) => setAudience(e.target.value)}><option value="">— No group —</option>{AUDIENCES.filter((a) => a !== 'All').map((a) => <option key={a} value={a}>{a}</option>)}</Select></Field>
        )}
        <Field label="Subject" required><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
        <Field label="Message" required><Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}><Send className="h-4 w-4" /> Send</Button></div>
      </form>
    </Modal>
  );
}

export function NotificationsTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { showError, toast } = useToast();
  const load = async () => {
    setLoading(true); setError('');
    try { const d = await get('/api/communication?resource=notifications&limit=100'); setRows(d.rows); setUnread(d.unread); }
    catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); // eslint-disable-next-line
  }, []);
  const markRead = async (id: number) => {
    try { await put('/api/communication?resource=notifications', { id }); load(); window.dispatchEvent(new Event('elimu:notifications-changed')); } catch (e: any) { showError(e.message); }
  };
  const markAll = async () => {
    try { await put('/api/communication?resource=notifications', { action: 'read-all' }); load(); window.dispatchEvent(new Event('elimu:notifications-changed')); } catch (e: any) { showError(e.message); }
  };
  const remove = async (id: number) => {
    try { await del(`/api/communication?resource=notifications&id=${id}`); load(); window.dispatchEvent(new Event('elimu:notifications-changed')); } catch (e: any) { showError(e.message); }
  };
  const toneFor = (t: string) => t === 'fee' ? 'amber' : t === 'announcement' ? 'blue' : t === 'event' ? 'purple' : t === 'message' ? 'emerald' : 'slate';
  return (
    <div>
      <Toast toast={toast} />
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">{unread} unread notification(s)</p>
        {unread > 0 && <Button size="sm" variant="outline" onClick={markAll}>Mark all read</Button>}
      </div>
      {loading ? <Spinner /> : error ? <ErrorState message={error} onRetry={load} /> : rows.length === 0 ? (
        <EmptyState title="No notifications" subtitle="Fee alerts, announcements and event reminders will appear here." icon={<Bell className="h-8 w-8 text-slate-300" />} />
      ) : (
        <div className="space-y-2">
          {rows.map((n) => (
            <div key={n.id} className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${n.is_read ? 'border-slate-200 bg-white' : 'border-emerald-200 bg-emerald-50/60'}`}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={toneFor(n.type) as any}>{n.type}</Badge>
                  <span className="text-xs text-slate-400">{formatDateTime(n.created_at)}</span>
                </div>
                <p className="mt-1 text-sm font-semibold text-slate-900">{n.title}</p>
                {n.body && <p className="mt-0.5 text-sm text-slate-600">{n.body}</p>}
                {n.link && <Link to={n.link} className="mt-1 inline-block text-xs font-semibold text-emerald-700 hover:underline">Open →</Link>}
              </div>
              <div className="flex shrink-0 gap-1">
                {!n.is_read && <Button size="sm" variant="ghost" onClick={() => markRead(n.id)}>Mark read</Button>}
                <button onClick={() => remove(n.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Dismiss"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProvidersTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);
  const [delLoading, setDelLoading] = useState(false);
  const { showSuccess, showError, toast } = useToast();
  const load = async () => {
    setLoading(true);
    try { setRows(await get('/api/communication?resource=providers')); } catch (e: any) { showError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); // eslint-disable-next-line
  }, []);
  const doDelete = async () => {
    setDelLoading(true);
    try { await del(`/api/communication?resource=providers&id=${deleting.id}`); showSuccess('Deleted'); setDeleting(null); load(); }
    catch (e: any) { showError(e.message); } finally { setDelLoading(false); }
  };
  return (
    <div>
      <Toast toast={toast} />
      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        In-app notifications work now. Email/SMS providers are configured here for Phase 4 delivery — only non-secret settings are stored. API keys and secrets must live in server environment variables, never in this form or frontend code.
      </div>
      <div className="mb-4"><Button onClick={() => { setEditing(null); setShowForm(true); }}><Plug2 className="h-4 w-4" /> Add provider</Button></div>
      {loading ? <Spinner /> : rows.length === 0 ? <EmptyState title="No providers configured" /> : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="flex items-start justify-between">
                <div><p className="text-sm font-bold">{p.name}</p><p className="font-mono text-xs text-slate-400">{p.kind}{p.sender_id ? ` · ${p.sender_id}` : ''}</p></div>
                <Badge tone={p.is_active ? 'green' : 'slate'}>{p.is_active ? 'Active' : 'Inactive'}</Badge>
              </div>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setEditing(p); setShowForm(true); }}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleting(p)}><Trash2 className="h-3.5 w-3.5 text-rose-600" /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {showForm && <ProviderForm initial={editing} onSaved={() => { setShowForm(false); load(); }} onClose={() => setShowForm(false)} />}
      {deleting && <ConfirmDialog title="Delete provider" message={`Delete "${deleting.name}"?`} onConfirm={doDelete} onCancel={() => setDeleting(null)} loading={delLoading} />}
    </div>
  );
}

function ProviderForm({ initial, onSaved, onClose }: any) {
  const [form, setForm] = useState({ kind: initial?.kind || 'sms', name: initial?.name || '', sender_id: initial?.sender_id || '', is_active: initial?.is_active !== false });
  const [saving, setSaving] = useState(false);
  const { showError, showSuccess, toast } = useToast();
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { showError('Provider name is required'); return; }
    setSaving(true);
    try {
      if (initial?.id) await put('/api/communication?resource=providers', { ...form, id: initial.id });
      else await post('/api/communication?resource=providers', form);
      showSuccess('Provider saved'); setTimeout(onSaved, 400);
    } catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };
  return (
    <Modal title={initial ? 'Edit provider' : 'Add provider'} onClose={onClose}>
      <Toast toast={toast} />
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Kind" required><Select value={form.kind} onChange={(e) => set('kind', e.target.value)}><option value="sms">SMS</option><option value="email">Email</option></Select></Field>
          <Field label="Name" required><Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Africa's Talking, Gmail SMTP" /></Field>
        </div>
        <Field label="Sender ID / From address"><Input value={form.sender_id} onChange={(e) => set('sender_id', e.target.value)} placeholder="e.g. ELIMU" /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} className="h-4 w-4 accent-emerald-700" /> Active</label>
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Save</Button></div>
      </form>
    </Modal>
  );
}
