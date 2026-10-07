import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Plus, Search, Pencil, Trash2, ArrowLeft, Unlink } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { get, post, put, del } from '../lib/api';
import { Card, Button, Input, Select, Field, Badge, Spinner, ErrorState, EmptyState, PageHeader, Modal, ConfirmDialog, useToast, Toast } from '../components/ui';
import { GUARDIAN_TYPES } from '../lib/constants';

function ParentForm({ initial, onSaved, onCancel }: any) {
  const { showError, showSuccess, toast } = useToast();
  const [form, setForm] = useState({
    first_name: initial?.first_name || '', last_name: initial?.last_name || '', national_id: initial?.national_id || '',
    phone: initial?.phone || '', alt_phone: initial?.alt_phone || '', email: initial?.email || '',
    address: initial?.address || '', county: initial?.county || '', occupation: initial?.occupation || '',
    guardian_type: initial?.guardian_type || 'Parent',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.first_name.trim()) errs.first_name = 'Required';
    if (!form.last_name.trim()) errs.last_name = 'Required';
    if (!form.phone.trim()) errs.phone = 'Required';
    if (form.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) errs.email = 'Invalid email';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      if (initial?.id) await put('/api/parents', { ...form, id: initial.id });
      else await post('/api/parents', form);
      showSuccess(initial?.id ? 'Profile updated' : 'Parent profile created');
      setTimeout(onSaved, 400);
    } catch (err: any) { showError(err.message); } finally { setSaving(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <Toast toast={toast} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="First name" required error={errors.first_name}><Input value={form.first_name} onChange={(e) => set('first_name', e.target.value)} /></Field>
        <Field label="Last name" required error={errors.last_name}><Input value={form.last_name} onChange={(e) => set('last_name', e.target.value)} /></Field>
        <Field label="Phone" required error={errors.phone}><Input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+254..." /></Field>
        <Field label="Alternative phone"><Input value={form.alt_phone} onChange={(e) => set('alt_phone', e.target.value)} /></Field>
        <Field label="Email" error={errors.email}><Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="National ID"><Input value={form.national_id} onChange={(e) => set('national_id', e.target.value)} /></Field>
        <Field label="Guardian type"><Select value={form.guardian_type} onChange={(e) => set('guardian_type', e.target.value)}>{GUARDIAN_TYPES.map((g) => <option key={g} value={g}>{g}</option>)}</Select></Field>
        <Field label="Occupation"><Input value={form.occupation} onChange={(e) => set('occupation', e.target.value)} /></Field>
        <Field label="County"><Input value={form.county} onChange={(e) => set('county', e.target.value)} /></Field>
        <Field label="Address"><Input value={form.address} onChange={(e) => set('address', e.target.value)} /></Field>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" type="button" onClick={onCancel}>Cancel</Button>
        <Button type="submit" loading={saving}>{initial?.id ? 'Save changes' : 'Create profile'}</Button>
      </div>
    </form>
  );
}

export default function Parents() {
  const { can } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);
  const [delLoading, setDelLoading] = useState(false);
  const { showSuccess, showError, toast } = useToast();
  const canFull = can('parents.manage', 'learners.manage');

  const load = async () => {
    setLoading(true); setError('');
    try { setRows(await get(`/api/parents${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`)); }
    catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); // eslint-disable-next-line
  }, []);
  useEffect(() => { const t = setTimeout(() => { if (!loading) load(); }, 400); return () => clearTimeout(t); // eslint-disable-next-line
  }, [q]);

  const doDelete = async () => {
    setDelLoading(true);
    try { await del(`/api/parents?id=${deleting.id}`); showSuccess('Profile deleted'); setDeleting(null); load(); }
    catch (e: any) { showError(e.message); } finally { setDelLoading(false); }
  };

  return (
    <div>
      <Toast toast={toast} />
      <PageHeader title="Parents & Guardians" subtitle={`${rows.length} profile(s)`} actions={canFull && <Button onClick={() => { setEditing(null); setShowForm(true); }}><Plus className="h-4 w-4" /> Add parent</Button>} />
      <Card className="mb-4 p-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Search name, phone or ID..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </Card>
      {loading ? <Spinner /> : error ? <ErrorState message={error} onRetry={load} /> : rows.length === 0 ? (
        <EmptyState title="No parents found" subtitle="Add parent/guardian profiles and link learners to them." action={canFull ? <Button onClick={() => { setEditing(null); setShowForm(true); }}><Plus className="h-4 w-4" /> Add parent</Button> : undefined} />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead><tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Name</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Learners</th><th className="px-4 py-3 text-right">Actions</th>
              </tr></thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3"><Link to={`/parents/${p.id}`} className="font-medium text-emerald-700 hover:underline">{p.first_name} {p.last_name}</Link><p className="text-xs text-slate-500">{p.email || p.national_id || ''}</p></td>
                    <td className="px-4 py-3 text-slate-600">{p.phone}</td>
                    <td className="px-4 py-3"><Badge tone="blue">{p.guardian_type}</Badge></td>
                    <td className="px-4 py-3 text-slate-600">{p.learner_count}</td>
                    <td className="px-4 py-3"><div className="flex justify-end gap-1">
                      {canFull && <button onClick={() => { setEditing(p); setShowForm(true); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800" title="Edit"><Pencil className="h-4 w-4" /></button>}
                      {canFull && <button onClick={() => setDeleting(p)} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700" title="Delete"><Trash2 className="h-4 w-4" /></button>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {showForm && <Modal title={editing ? 'Edit profile' : 'Add parent / guardian'} onClose={() => setShowForm(false)} wide><ParentForm initial={editing} onSaved={() => { setShowForm(false); load(); }} onCancel={() => setShowForm(false)} /></Modal>}
      {deleting && <ConfirmDialog title="Delete profile" message={`Delete ${deleting.first_name} ${deleting.last_name}? Linked learners stay enrolled but will be unlinked.`} onConfirm={doDelete} onCancel={() => setDeleting(null)} loading={delLoading} />}
    </div>
  );
}

export function ParentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [parent, setParent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showLink, setShowLink] = useState(false);
  const { showSuccess, showError, toast } = useToast();
  const canFull = can('parents.manage', 'learners.manage');
  const load = async () => {
    setLoading(true); setError('');
    try { setParent(await get(`/api/parents?id=${id}`)); }
    catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); // eslint-disable-next-line
  }, [id]);
  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!parent) return <ErrorState message="Profile not found" />;
  return (
    <div>
      <Toast toast={toast} />
      <button onClick={() => navigate(-1)} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Back</button>
      <PageHeader title={`${parent.first_name} ${parent.last_name}`} subtitle={`${parent.guardian_type} · ${parent.phone}`} actions={canFull && <Button variant="outline" onClick={() => setShowLink(true)}>Link learner</Button>} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Contact details</h3>
          <dl className="space-y-2.5 text-sm">
            {[['Phone', parent.phone], ['Alt phone', parent.alt_phone || '—'], ['Email', parent.email || '—'], ['National ID', parent.national_id || '—'], ['Occupation', parent.occupation || '—'], ['County', parent.county || '—'], ['Address', parent.address || '—']].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-slate-50 pb-2 last:border-0"><dt className="text-slate-500">{k}</dt><dd className="text-right font-medium text-slate-800">{v}</dd></div>
            ))}
          </dl>
        </Card>
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Linked learners ({(parent.learners || []).length})</h3>
          <div className="space-y-2">
            {(parent.learners || []).map((l: any) => (
              <div key={l.link_id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5">
                <div className="min-w-0">
                  <Link to={`/learners/${l.id}`} className="block truncate text-sm font-semibold text-emerald-700 hover:underline">{l.first_name} {l.last_name}</Link>
                  <p className="text-xs text-slate-500">{l.relationship}{l.is_primary ? ' · Primary' : ''} · {l.admission_no}</p>
                </div>
                {canFull && <button onClick={async () => { try { await post('/api/parents', { action: 'unlink', link_id: l.link_id }); showSuccess('Unlinked'); load(); } catch (e: any) { showError(e.message); } }} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Unlink"><Unlink className="h-4 w-4" /></button>}
              </div>
            ))}
            {!(parent.learners || []).length && <p className="text-sm text-slate-500">No learners linked yet.</p>}
          </div>
        </Card>
      </div>
      {showLink && <LinkLearnerModal parentId={parent.id} onDone={() => { setShowLink(false); load(); }} onClose={() => setShowLink(false)} />}
    </div>
  );
}

function LinkLearnerModal({ parentId, onDone, onClose }: { parentId: number; onDone: () => void; onClose: () => void }) {
  const [learners, setLearners] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [learnerId, setLearnerId] = useState('');
  const [relationship, setRelationship] = useState('Guardian');
  const [isPrimary, setIsPrimary] = useState(false);
  const [saving, setSaving] = useState(false);
  const { showSuccess, showError, toast } = useToast();
  useEffect(() => { get('/api/learners?limit=500').then(setLearners).catch(() => {}); }, []);
  const filtered = learners.filter((l) => !q.trim() || `${l.first_name} ${l.last_name} ${l.admission_no}`.toLowerCase().includes(q.toLowerCase()));
  const save = async () => {
    if (!learnerId) { showError('Select a learner'); return; }
    setSaving(true);
    try {
      await post('/api/parents', { action: 'link', learner_id: Number(learnerId), parent_id: parentId, relationship, is_primary: isPrimary });
      showSuccess('Learner linked'); setTimeout(onDone, 400);
    } catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };
  return (
    <Modal title="Link learner" subtitle="Attach a learner to this parent/guardian" onClose={onClose}>
      <Toast toast={toast} />
      <div className="space-y-4">
        <Field label="Search learners"><Input placeholder="Name or admission no..." value={q} onChange={(e) => setQ(e.target.value)} /></Field>
        <Field label="Learner" required>
          <Select value={learnerId} onChange={(e) => setLearnerId(e.target.value)}>
            <option value="">— Select —</option>
            {filtered.slice(0, 80).map((l) => <option key={l.id} value={l.id}>{l.first_name} {l.last_name} · {l.admission_no}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Relationship"><Select value={relationship} onChange={(e) => setRelationship(e.target.value)}>{['Father', 'Mother', 'Guardian', 'Uncle', 'Aunt', 'Grandparent', 'Sibling', 'Sponsor', 'Other'].map((r) => <option key={r} value={r}>{r}</option>)}</Select></Field>
          <Field label="Primary contact"><label className="flex items-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2 text-sm"><input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} className="h-4 w-4 accent-emerald-700" /> Primary</label></Field>
        </div>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={saving}>Link learner</Button></div>
      </div>
    </Modal>
  );
}
