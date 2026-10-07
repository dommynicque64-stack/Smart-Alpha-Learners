import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Search, ShieldAlert, BookOpen, ArrowLeftRight, Package, UserPlus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { get, post, put, del } from '../lib/api';
import { Card, Button, Input, Select, Field, Badge, Spinner, ErrorState, EmptyState, PageHeader, Modal, ConfirmDialog, Tabs, Textarea, useToast, Toast } from '../components/ui';
import { formatDate, todayISO } from '../lib/constants';

export function useLearnerLookup() {
  const [learners, setLearners] = useState<any[]>([]);
  const [q, setQ] = useState('');
  useEffect(() => { get('/api/learners?status=Active&limit=500').then(setLearners).catch(() => {}); }, []);
  const filtered = learners.filter((l) => !q.trim() || `${l.first_name} ${l.last_name} ${l.admission_no}`.toLowerCase().includes(q.toLowerCase()));
  return { q, setQ, filtered };
}

// ================= DISCIPLINE / PASTORAL =================

export function Discipline() {
  const { can } = useAuth();
  const canManage = can('discipline.manage');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fQ, setFQ] = useState('');
  const [fSeverity, setFSeverity] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);
  const [delLoading, setDelLoading] = useState(false);
  const { showSuccess, showError, toast } = useToast();
  const load = async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (fSeverity) params.set('severity', fSeverity);
      if (fStatus) params.set('status', fStatus);
      setRows(await get(`/api/operations?resource=discipline&${params.toString()}`));
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); // eslint-disable-next-line
  }, [fSeverity, fStatus]);
  const doDelete = async () => {
    setDelLoading(true);
    try { await del(`/api/operations?resource=discipline&id=${deleting.id}`); showSuccess('Record deleted'); setDeleting(null); load(); }
    catch (e: any) { showError(e.message); } finally { setDelLoading(false); }
  };
  const filtered = rows.filter((r) => !fQ.trim() || `${r.learner_name} ${r.admission_no} ${r.incident}`.toLowerCase().includes(fQ.toLowerCase()));
  const tone = (s: string) => s === 'Serious' ? 'red' : s === 'Moderate' ? 'amber' : 'slate';
  return (
    <div>
      <Toast toast={toast} />
      <PageHeader title="Discipline & Pastoral Care" subtitle="Confidential incident management — restricted access" actions={canManage && <Button onClick={() => { setEditing(null); setShowForm(true); }}><Plus className="h-4 w-4" /> Record incident</Button>} />
      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        These records are confidential. Only staff with discipline permissions can view them. Parents and learners do not see this page.
      </div>
      <Card className="mb-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="pl-9" placeholder="Search learner or incident..." value={fQ} onChange={(e) => setFQ(e.target.value)} /></div>
          <Select value={fSeverity} onChange={(e) => setFSeverity(e.target.value)}><option value="">All severities</option>{['Minor', 'Moderate', 'Serious'].map((s) => <option key={s} value={s}>{s}</option>)}</Select>
          <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)}><option value="">All statuses</option>{['Open', 'In Review', 'Resolved', 'Escalated'].map((s) => <option key={s} value={s}>{s}</option>)}</Select>
        </div>
      </Card>
      {loading ? <Spinner /> : error ? <ErrorState message={error} onRetry={load} /> : filtered.length === 0 ? <EmptyState title="No incidents" icon={<ShieldAlert className="h-8 w-8 text-slate-300" />} /> : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold">{r.learner_name} <span className="font-mono text-xs font-normal text-slate-400">· {r.admission_no}</span></p>
                  <p className="mt-0.5 text-xs text-slate-500">{formatDate(r.incident_date)}{r.location ? ` · ${r.location}` : ''}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge tone={tone(r.severity) as any}>{r.severity}</Badge>
                  <Badge tone={r.status === 'Resolved' ? 'green' : r.status === 'Open' ? 'red' : 'amber'}>{r.status}</Badge>
                  {canManage && <>
                    <button onClick={() => { setEditing(r); setShowForm(true); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => setDeleting(r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                  </>}
                </div>
              </div>
              <p className="mt-2 text-sm text-slate-700">{r.incident}</p>
              {(r.action_taken || r.staff_involved) && (
                <div className="mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                  {r.staff_involved && <p className="rounded-lg bg-slate-50 px-3 py-2"><span className="font-semibold">Staff involved:</span> {r.staff_involved}</p>}
                  {r.action_taken && <p className="rounded-lg bg-slate-50 px-3 py-2"><span className="font-semibold">Action:</span> {r.action_taken}</p>}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      {showForm && <DisciplineForm initial={editing} onSaved={() => { setShowForm(false); load(); }} onClose={() => setShowForm(false)} />}
      {deleting && <ConfirmDialog title="Delete record" message="Delete this discipline record? This is audit-logged." onConfirm={doDelete} onCancel={() => setDeleting(null)} loading={delLoading} />}
    </div>
  );
}

function DisciplineForm({ initial, onSaved, onClose }: any) {
  const { q, setQ, filtered } = useLearnerLookup();
  const [form, setForm] = useState({
    learner_id: initial?.learner_id || '', incident: initial?.incident || '', incident_date: initial?.incident_date || todayISO(),
    location: initial?.location || '', severity: initial?.severity || 'Minor', staff_involved: initial?.staff_involved || '',
    witnesses: initial?.witnesses || '', action_taken: initial?.action_taken || '', status: initial?.status || 'Open', notes: initial?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const { showError, showSuccess, toast } = useToast();
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.learner_id || !form.incident.trim() || !form.incident_date) { showError('Learner, incident and date are required'); return; }
    setSaving(true);
    try {
      if (initial?.id) await put('/api/operations?resource=discipline', { ...form, id: initial.id, learner_id: Number(form.learner_id) });
      else await post('/api/operations?resource=discipline', { ...form, learner_id: Number(form.learner_id) });
      showSuccess('Record saved'); setTimeout(onSaved, 400);
    } catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };
  return (
    <Modal title={initial ? 'Edit incident' : 'Record incident'} onClose={onClose}>
      <Toast toast={toast} />
      <form onSubmit={submit} className="space-y-4">
        {!initial && (<>
          <Field label="Search learner"><Input placeholder="Name or admission no..." value={q} onChange={(e) => setQ(e.target.value)} /></Field>
          <Field label="Learner" required><Select value={form.learner_id} onChange={(e) => set('learner_id', e.target.value)}><option value="">— Select —</option>{filtered.slice(0, 80).map((l) => <option key={l.id} value={l.id}>{l.first_name} {l.last_name} · {l.admission_no}</option>)}</Select></Field>
        </>)}
        <Field label="What happened?" required><Textarea rows={3} value={form.incident} onChange={(e) => set('incident', e.target.value)} /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Date" required><Input type="date" value={form.incident_date} onChange={(e) => set('incident_date', e.target.value)} /></Field>
          <Field label="Location"><Input value={form.location} onChange={(e) => set('location', e.target.value)} /></Field>
          <Field label="Severity"><Select value={form.severity} onChange={(e) => set('severity', e.target.value)}><option>Minor</option><option>Moderate</option><option>Serious</option></Select></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Staff involved"><Input value={form.staff_involved} onChange={(e) => set('staff_involved', e.target.value)} /></Field>
          <Field label="Witnesses"><Input value={form.witnesses} onChange={(e) => set('witnesses', e.target.value)} /></Field>
        </div>
        <Field label="Action taken"><Textarea rows={2} value={form.action_taken} onChange={(e) => set('action_taken', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status"><Select value={form.status} onChange={(e) => set('status', e.target.value)}>{['Open', 'In Review', 'Resolved', 'Escalated'].map((s) => <option key={s} value={s}>{s}</option>)}</Select></Field>
          <Field label="Notes"><Input value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        </div>
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Save</Button></div>
      </form>
    </Modal>
  );
}

// ================= STAFF =================

export function Staff() {
  const { can } = useAuth();
  const canManage = can('staff.manage');
  const [tab, setTab] = useState('directory');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fQ, setFQ] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const { showSuccess, showError, toast } = useToast();
  const load = async () => {
    setLoading(true);
    try { setRows(await get('/api/operations?resource=staff')); } catch (e: any) { showError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); // eslint-disable-next-line
  }, []);
  const filtered = rows.filter((r) => !fQ.trim() || `${r.first_name} ${r.last_name} ${r.staff_no} ${r.job_title || ''} ${r.department || ''}`.toLowerCase().includes(fQ.toLowerCase()));
  return (
    <div>
      <Toast toast={toast} />
      <PageHeader title="Staff Management" subtitle="Directory, leave records and professional development" actions={canManage && tab === 'directory' && <Button onClick={() => { setEditing(null); setShowForm(true); }}><UserPlus className="h-4 w-4" /> Add staff</Button>} />
      <Tabs tabs={[{ key: 'directory', label: 'Directory', count: rows.length }, { key: 'leave', label: 'Leave Records' }, { key: 'pd', label: 'Professional Dev.' }]} active={tab} onChange={setTab} />
      <div className="mt-4">
        {tab === 'directory' && (<>
          <div className="relative mb-4 max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="pl-9" placeholder="Search staff..." value={fQ} onChange={(e) => setFQ(e.target.value)} /></div>
          {loading ? <Spinner /> : filtered.length === 0 ? <EmptyState title="No staff records" subtitle="Teaching staff live under Teachers; this directory covers all employees." /> : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((s) => (
                <Card key={s.id} className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-700 text-sm font-bold text-white">{s.first_name?.[0]}{s.last_name?.[0]}</div>
                      <div><p className="text-sm font-bold">{s.first_name} {s.last_name}</p><p className="font-mono text-xs text-slate-400">{s.staff_no}</p></div>
                    </div>
                    <Badge tone={s.employment_status === 'Active' ? 'green' : 'slate'}>{s.employment_status}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{s.job_title || '—'}{s.department ? ` · ${s.department}` : ''}</p>
                  <p className="text-xs text-slate-500">{s.phone || ''}{s.phone && s.email ? ' · ' : ''}{s.email || ''}</p>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setDetail(s)}>Details</Button>
                    {canManage && <Button size="sm" variant="ghost" onClick={() => { setEditing(s); setShowForm(true); }}><Pencil className="h-3.5 w-3.5" /></Button>}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>)}
        {tab === 'leave' && <LeaveTab canManage={canManage} staff={rows} />}
        {tab === 'pd' && <PdTab canManage={canManage} staff={rows} />}
      </div>
      {showForm && <StaffForm initial={editing} onSaved={() => { setShowForm(false); load(); }} onClose={() => setShowForm(false)} />}
      {detail && <StaffDetailModal staff={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function StaffForm({ initial, onSaved, onClose }: any) {
  const [form, setForm] = useState({
    staff_no: initial?.staff_no || '', first_name: initial?.first_name || '', last_name: initial?.last_name || '',
    phone: initial?.phone || '', email: initial?.email || '', department: initial?.department || '', job_title: initial?.job_title || '',
    employment_status: initial?.employment_status || 'Active', employment_type: initial?.employment_type || 'Full-time',
    subjects: initial?.subjects || '', date_joined: initial?.date_joined || '',
  });
  const [saving, setSaving] = useState(false);
  const { showError, showSuccess, toast } = useToast();
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.staff_no.trim() || !form.first_name.trim() || !form.last_name.trim()) { showError('Staff no, first and last names are required'); return; }
    setSaving(true);
    try {
      if (initial?.id) await put('/api/operations?resource=staff', { ...form, id: initial.id });
      else await post('/api/operations?resource=staff', form);
      showSuccess('Staff saved'); setTimeout(onSaved, 400);
    } catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };
  return (
    <Modal title={initial ? 'Edit staff' : 'Add staff'} onClose={onClose} wide>
      <Toast toast={toast} />
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Staff no" required><Input value={form.staff_no} onChange={(e) => set('staff_no', e.target.value)} /></Field>
          <Field label="First name" required><Input value={form.first_name} onChange={(e) => set('first_name', e.target.value)} /></Field>
          <Field label="Last name" required><Input value={form.last_name} onChange={(e) => set('last_name', e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Job title"><Input value={form.job_title} onChange={(e) => set('job_title', e.target.value)} placeholder="e.g. Bursar" /></Field>
          <Field label="Department"><Input value={form.department} onChange={(e) => set('department', e.target.value)} placeholder="e.g. Finance" /></Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Phone"><Input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Email"><Input value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Date joined"><Input type="date" value={form.date_joined} onChange={(e) => set('date_joined', e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Employment status"><Select value={form.employment_status} onChange={(e) => set('employment_status', e.target.value)}>{['Active', 'On Leave', 'Suspended', 'Exited'].map((s) => <option key={s} value={s}>{s}</option>)}</Select></Field>
          <Field label="Employment type"><Select value={form.employment_type} onChange={(e) => set('employment_type', e.target.value)}>{['Full-time', 'Part-time', 'Contract', 'Volunteer', 'Intern'].map((s) => <option key={s} value={s}>{s}</option>)}</Select></Field>
          <Field label="Subjects / skills"><Input value={form.subjects} onChange={(e) => set('subjects', e.target.value)} /></Field>
        </div>
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Save</Button></div>
      </form>
    </Modal>
  );
}

function StaffDetailModal({ staff, onClose }: any) {
  const [leave, setLeave] = useState<any[]>([]);
  const [pd, setPd] = useState<any[]>([]);
  useEffect(() => {
    get(`/api/operations?resource=staff-leave&staff_id=${staff.id}`).then(setLeave).catch(() => {});
    get(`/api/operations?resource=staff-pd&staff_id=${staff.id}`).then(setPd).catch(() => {});
  }, [staff.id]);
  return (
    <Modal title={`${staff.first_name} ${staff.last_name}`} subtitle={`${staff.staff_no} · ${staff.job_title || '—'} · ${staff.department || '—'}`} onClose={onClose}>
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg bg-slate-50 p-2.5"><p className="text-xs text-slate-500">Phone</p><p className="font-medium">{staff.phone || '—'}</p></div>
          <div className="rounded-lg bg-slate-50 p-2.5"><p className="text-xs text-slate-500">Email</p><p className="font-medium">{staff.email || '—'}</p></div>
          <div className="rounded-lg bg-slate-50 p-2.5"><p className="text-xs text-slate-500">Status</p><p className="font-medium">{staff.employment_status} · {staff.employment_type}</p></div>
          <div className="rounded-lg bg-slate-50 p-2.5"><p className="text-xs text-slate-500">Joined</p><p className="font-medium">{formatDate(staff.date_joined)}</p></div>
        </dl>
        <div>
          <p className="mb-1.5 text-xs font-bold uppercase text-slate-400">Leave history ({leave.length})</p>
          {leave.slice(0, 5).map((l) => <p key={l.id} className="rounded-lg bg-slate-50 px-3 py-1.5 text-sm">{l.leave_type}: {formatDate(l.start_date)} → {formatDate(l.end_date)} · {l.status}</p>)}
          {!leave.length && <p className="text-sm text-slate-400">No leave records.</p>}
        </div>
        <div>
          <p className="mb-1.5 text-xs font-bold uppercase text-slate-400">Professional development ({pd.length})</p>
          {pd.slice(0, 5).map((p) => <p key={p.id} className="rounded-lg bg-slate-50 px-3 py-1.5 text-sm">{p.title}{p.provider ? ` · ${p.provider}` : ''}{p.pd_date ? ` · ${formatDate(p.pd_date)}` : ''}</p>)}
          {!pd.length && <p className="text-sm text-slate-400">No PD records.</p>}
        </div>
      </div>
    </Modal>
  );
}

function LeaveTab({ canManage, staff }: any) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const { showSuccess, showError, toast } = useToast();
  const load = async () => {
    setLoading(true);
    try { setRows(await get('/api/operations?resource=staff-leave')); } catch (e: any) { showError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); // eslint-disable-next-line
  }, []);
  const setStatus = async (id: number, status: string) => {
    try { await put('/api/operations?resource=staff-leave', { id, status }); showSuccess(`Leave ${status.toLowerCase()}`); load(); }
    catch (e: any) { showError(e.message); }
  };
  return (
    <div>
      <Toast toast={toast} />
      {canManage && <div className="mb-4"><Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> Record leave</Button></div>}
      {loading ? <Spinner /> : rows.length === 0 ? <EmptyState title="No leave records" /> : (
        <Card><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm">
          <thead><tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500"><th className="px-4 py-3">Staff</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Dates</th><th className="px-4 py-3">Status</th>{canManage && <th className="px-4 py-3 text-right">Actions</th>}</tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
              <td className="px-4 py-2.5 font-medium">{r.staff_name} <span className="font-mono text-xs text-slate-400">{r.staff_no}</span></td>
              <td className="px-4 py-2.5">{r.leave_type}</td>
              <td className="px-4 py-2.5 text-xs">{formatDate(r.start_date)} → {formatDate(r.end_date)}</td>
              <td className="px-4 py-2.5"><Badge tone={r.status === 'Approved' ? 'green' : r.status === 'Rejected' ? 'red' : 'amber'}>{r.status}</Badge></td>
              {canManage && <td className="px-4 py-2.5 text-right">
                {r.status === 'Pending' && <><Button size="sm" variant="outline" onClick={() => setStatus(r.id, 'Approved')}>Approve</Button> <Button size="sm" variant="ghost" onClick={() => setStatus(r.id, 'Rejected')}>Reject</Button></>}
              </td>}
            </tr>
          ))}</tbody>
        </table></div></Card>
      )}
      {showForm && <LeaveForm staff={staff} onSaved={() => { setShowForm(false); load(); }} onClose={() => setShowForm(false)} />}
    </div>
  );
}

function LeaveForm({ staff, onSaved, onClose }: any) {
  const [form, setForm] = useState({ staff_id: '', leave_type: 'Annual', start_date: todayISO(), end_date: todayISO(), reason: '' });
  const [saving, setSaving] = useState(false);
  const { showError, showSuccess, toast } = useToast();
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.staff_id) { showError('Select a staff member'); return; }
    setSaving(true);
    try { await post('/api/operations?resource=staff-leave', { ...form, staff_id: Number(form.staff_id) }); showSuccess('Leave recorded'); setTimeout(onSaved, 400); }
    catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };
  return (
    <Modal title="Record leave" onClose={onClose}>
      <Toast toast={toast} />
      <form onSubmit={submit} className="space-y-4">
        <Field label="Staff" required><Select value={form.staff_id} onChange={(e) => set('staff_id', e.target.value)}><option value="">— Select —</option>{staff.map((s: any) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name} ({s.staff_no})</option>)}</Select></Field>
        <Field label="Leave type"><Select value={form.leave_type} onChange={(e) => set('leave_type', e.target.value)}>{['Annual', 'Sick', 'Maternity', 'Paternity', 'Study', 'Unpaid', 'Other'].map((t) => <option key={t} value={t}>{t}</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Start"><Input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} /></Field>
          <Field label="End"><Input type="date" value={form.end_date} onChange={(e) => set('end_date', e.target.value)} /></Field>
        </div>
        <Field label="Reason"><Input value={form.reason} onChange={(e) => set('reason', e.target.value)} /></Field>
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Save</Button></div>
      </form>
    </Modal>
  );
}

function PdTab({ canManage, staff }: any) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const { showSuccess, showError, toast } = useToast();
  const load = async () => {
    setLoading(true);
    try { setRows(await get('/api/operations?resource=staff-pd')); } catch (e: any) { showError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); // eslint-disable-next-line
  }, []);
  return (
    <div>
      <Toast toast={toast} />
      {canManage && <div className="mb-4"><Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> Add training</Button></div>}
      {loading ? <Spinner /> : rows.length === 0 ? <EmptyState title="No training records" /> : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {rows.map((r) => (
            <Card key={r.id} className="p-4">
              <p className="text-sm font-bold">{r.title}</p>
              <p className="text-xs text-slate-500">{r.staff_name}{r.provider ? ` · ${r.provider}` : ''}{r.pd_date ? ` · ${formatDate(r.pd_date)}` : ''}{r.duration_hours ? ` · ${r.duration_hours}h` : ''}</p>
              {r.notes && <p className="mt-1 text-sm text-slate-600">{r.notes}</p>}
            </Card>
          ))}
        </div>
      )}
      {showForm && <PdForm staff={staff} onSaved={() => { setShowForm(false); load(); }} onClose={() => setShowForm(false)} />}
    </div>
  );
}

function PdForm({ staff, onSaved, onClose }: any) {
  const [form, setForm] = useState({ staff_id: '', title: '', provider: '', pd_date: todayISO(), duration_hours: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const { showError, showSuccess, toast } = useToast();
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.staff_id || !form.title.trim()) { showError('Staff and title are required'); return; }
    setSaving(true);
    try { await post('/api/operations?resource=staff-pd', { ...form, staff_id: Number(form.staff_id), duration_hours: form.duration_hours ? Number(form.duration_hours) : null }); showSuccess('Saved'); setTimeout(onSaved, 400); }
    catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };
  return (
    <Modal title="Add training / CPD" onClose={onClose}>
      <Toast toast={toast} />
      <form onSubmit={submit} className="space-y-4">
        <Field label="Staff" required><Select value={form.staff_id} onChange={(e) => set('staff_id', e.target.value)}><option value="">— Select —</option>{staff.map((s: any) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name} ({s.staff_no})</option>)}</Select></Field>
        <Field label="Title" required><Input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. CBC Assessment Workshop" /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Provider"><Input value={form.provider} onChange={(e) => set('provider', e.target.value)} /></Field>
          <Field label="Date"><Input type="date" value={form.pd_date} onChange={(e) => set('pd_date', e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Duration (hours)"><Input type="number" value={form.duration_hours} onChange={(e) => set('duration_hours', e.target.value)} /></Field>
          <Field label="Notes"><Input value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        </div>
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Save</Button></div>
      </form>
    </Modal>
  );
}

// ================= LIBRARY =================

export function Library() {
  const { can } = useAuth();
  const canManage = can('library.manage');
  const canBorrow = canManage || can('library.borrow');
  const [tab, setTab] = useState('catalogue');
  const [books, setBooks] = useState<any[]>([]);
  const [txns, setTxns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fQ, setFQ] = useState('');
  const [fCat, setFCat] = useState('');
  const [showBook, setShowBook] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [issueFor, setIssueFor] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);
  const [delLoading, setDelLoading] = useState(false);
  const { showSuccess, showError, toast } = useToast();
  const load = async () => {
    setLoading(true);
    try {
      const [b, t] = await Promise.all([get('/api/operations?resource=books'), get('/api/operations?resource=book-txns&status=Issued')]);
      setBooks(b); setTxns(t);
    } catch (e: any) { showError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); // eslint-disable-next-line
  }, []);
  const doDelete = async () => {
    setDelLoading(true);
    try { await del(`/api/operations?resource=books&id=${deleting.id}`); showSuccess('Book deleted'); setDeleting(null); load(); }
    catch (e: any) { showError(e.message); } finally { setDelLoading(false); }
  };
  const doReturn = async (txn: any, fine: string) => {
    try { await post('/api/operations?resource=book-txns', { action: 'return', id: txn.id, fine_amount: fine ? Number(fine) : 0 }); showSuccess('Book returned'); load(); }
    catch (e: any) { showError(e.message); }
  };
  const cats = [...new Set(books.map((b) => b.category).filter(Boolean))];
  const filtered = books.filter((b) => (!fQ.trim() || `${b.title} ${b.author || ''} ${b.isbn || ''}`.toLowerCase().includes(fQ.toLowerCase())) && (!fCat || b.category === fCat));
  const totalCopies = books.reduce((s, b) => s + Number(b.copies_total || 0), 0);
  const availCopies = books.reduce((s, b) => s + Number(b.copies_available || 0), 0);
  return (
    <div>
      <Toast toast={toast} />
      <PageHeader title="Library" subtitle={`${books.length} titles · ${availCopies}/${totalCopies} copies available · ${txns.length} issued`} actions={canManage && <Button onClick={() => { setEditing(null); setShowBook(true); }}><Plus className="h-4 w-4" /> Add book</Button>} />
      <Tabs tabs={[{ key: 'catalogue', label: 'Catalogue', count: books.length }, { key: 'issued', label: 'Issued', count: txns.length }, { key: 'history', label: 'History' }]} active={tab} onChange={setTab} />
      <div className="mt-4">
        {tab === 'catalogue' && (<>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="pl-9" placeholder="Search title, author, ISBN..." value={fQ} onChange={(e) => setFQ(e.target.value)} /></div>
            <Select value={fCat} onChange={(e) => setFCat(e.target.value)}><option value="">All categories</option>{cats.map((c: string) => <option key={c} value={c}>{c}</option>)}</Select>
          </div>
          {loading ? <Spinner /> : filtered.length === 0 ? <EmptyState title="No books" icon={<BookOpen className="h-8 w-8 text-slate-300" />} /> : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((b) => (
                <Card key={b.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div><p className="text-sm font-bold">{b.title}</p><p className="text-xs text-slate-500">{b.author || 'Unknown author'}{b.isbn ? ` · ISBN ${b.isbn}` : ''}</p></div>
                    <Badge tone={Number(b.copies_available) > 0 ? 'green' : 'red'}>{b.copies_available}/{b.copies_total}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{b.category || 'Uncategorised'}{b.shelf ? ` · Shelf ${b.shelf}` : ''}</p>
                  <div className="mt-3 flex gap-2">
                    {canBorrow && Number(b.copies_available) > 0 && <Button size="sm" variant="outline" onClick={() => setIssueFor(b)}><ArrowLeftRight className="h-3.5 w-3.5" /> Issue</Button>}
                    {canManage && <><Button size="sm" variant="ghost" onClick={() => { setEditing(b); setShowBook(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleting(b)}><Trash2 className="h-3.5 w-3.5 text-rose-600" /></Button></>}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>)}
        {tab === 'issued' && <IssuedList txns={txns} onReturn={doReturn} />}
        {tab === 'history' && <HistoryList />}
      </div>
      {showBook && <BookForm initial={editing} onSaved={() => { setShowBook(false); load(); }} onClose={() => setShowBook(false)} />}
      {issueFor && <IssueModal book={issueFor} onDone={() => { setIssueFor(null); load(); }} onClose={() => setIssueFor(null)} />}
      {deleting && <ConfirmDialog title="Delete book" message={`Delete \"${deleting.title}\"?`} onConfirm={doDelete} onCancel={() => setDeleting(null)} loading={delLoading} />}
    </div>
  );
}

function BookForm({ initial, onSaved, onClose }: any) {
  const [form, setForm] = useState({ title: initial?.title || '', author: initial?.author || '', isbn: initial?.isbn || '', publisher: initial?.publisher || '', category: initial?.category || '', copies_total: initial?.copies_total ?? 1, shelf: initial?.shelf || '', notes: initial?.notes || '' });
  const [saving, setSaving] = useState(false);
  const { showError, showSuccess, toast } = useToast();
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { showError('Title is required'); return; }
    setSaving(true);
    try {
      const payload = { ...form, copies_total: Number(form.copies_total) || 1 };
      if (initial?.id) await put('/api/operations?resource=books', { ...payload, id: initial.id });
      else await post('/api/operations?resource=books', payload);
      showSuccess('Book saved'); setTimeout(onSaved, 400);
    } catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };
  return (
    <Modal title={initial ? 'Edit book' : 'Add book'} onClose={onClose}>
      <Toast toast={toast} />
      <form onSubmit={submit} className="space-y-4">
        <Field label="Title" required><Input value={form.title} onChange={(e) => set('title', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Author"><Input value={form.author} onChange={(e) => set('author', e.target.value)} /></Field>
          <Field label="ISBN"><Input value={form.isbn} onChange={(e) => set('isbn', e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Publisher"><Input value={form.publisher} onChange={(e) => set('publisher', e.target.value)} /></Field>
          <Field label="Category"><Input value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="e.g. Fiction, CBC Grade 7" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Copies"><Input type="number" min="1" value={form.copies_total} onChange={(e) => set('copies_total', e.target.value)} /></Field>
          <Field label="Shelf"><Input value={form.shelf} onChange={(e) => set('shelf', e.target.value)} /></Field>
        </div>
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Save</Button></div>
      </form>
    </Modal>
  );
}

function IssueModal({ book, onDone, onClose }: any) {
  const { q, setQ, filtered } = useLearnerLookup();
  const [learnerId, setLearnerId] = useState('');
  const [guest, setGuest] = useState('');
  const [due, setDue] = useState('');
  const [saving, setSaving] = useState(false);
  const { showError, showSuccess, toast } = useToast();
  const submit = async () => {
    if (!learnerId && !guest.trim()) { showError('Select a learner or enter a borrower name'); return; }
    setSaving(true);
    try {
      await post('/api/operations?resource=book-txns', { action: 'issue', book_id: book.id, learner_id: learnerId ? Number(learnerId) : null, borrower_name: learnerId ? null : guest.trim(), due_date: due || null });
      showSuccess('Book issued'); setTimeout(onDone, 400);
    } catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };
  return (
    <Modal title={`Issue — ${book.title}`} subtitle={`${book.copies_available} copie(s) available`} onClose={onClose}>
      <Toast toast={toast} />
      <div className="space-y-4">
        <Field label="Search learner"><Input placeholder="Name or admission no..." value={q} onChange={(e) => setQ(e.target.value)} /></Field>
        <Field label="Learner"><Select value={learnerId} onChange={(e) => setLearnerId(e.target.value)}><option value="">— Guest / staff —</option>{filtered.slice(0, 80).map((l) => <option key={l.id} value={l.id}>{l.first_name} {l.last_name} · {l.admission_no}</option>)}</Select></Field>
        {!learnerId && <Field label="Borrower name"><Input value={guest} onChange={(e) => setGuest(e.target.value)} placeholder="Staff or guest name" /></Field>}
        <Field label="Due date"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={saving}>Issue book</Button></div>
      </div>
    </Modal>
  );
}

function IssuedList({ txns, onReturn }: any) {
  const [fines, setFines] = useState<Record<number, string>>({});
  if (!txns.length) return <EmptyState title="Nothing issued" subtitle="Issued books awaiting return will appear here." />;
  return (
    <Card><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm">
      <thead><tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500"><th className="px-4 py-3">Book</th><th className="px-4 py-3">Borrower</th><th className="px-4 py-3">Issued</th><th className="px-4 py-3">Due</th><th className="px-4 py-3">Fine (KES)</th><th className="px-4 py-3 text-right">Action</th></tr></thead>
      <tbody>{txns.map((t: any) => {
        const overdue = t.due_date && t.due_date < todayISO();
        return (
          <tr key={t.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
            <td className="px-4 py-2.5 font-medium">{t.book_title}</td>
            <td className="px-4 py-2.5">{t.borrower_name}</td>
            <td className="px-4 py-2.5 text-xs">{formatDate(t.issue_date)}</td>
            <td className="px-4 py-2.5 text-xs"><span className={overdue ? 'font-bold text-rose-600' : ''}>{formatDate(t.due_date)}{overdue ? ' (overdue)' : ''}</span></td>
            <td className="px-4 py-2.5"><Input type="number" min="0" className="w-24" placeholder="0" value={fines[t.id] || ''} onChange={(e) => setFines({ ...fines, [t.id]: e.target.value })} /></td>
            <td className="px-4 py-2.5 text-right"><Button size="sm" onClick={() => onReturn(t, fines[t.id] || '')}>Receive</Button></td>
          </tr>
        );
      })}</tbody>
    </table></div></Card>
  );
}

function HistoryList() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { get('/api/operations?resource=book-txns').then(setRows).catch(() => {}).finally(() => setLoading(false)); }, []);
  if (loading) return <Spinner />;
  if (!rows.length) return <EmptyState title="No borrowing history" />;
  return (
    <Card><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm">
      <thead><tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500"><th className="px-4 py-3">Book</th><th className="px-4 py-3">Borrower</th><th className="px-4 py-3">Issued</th><th className="px-4 py-3">Returned</th><th className="px-4 py-3">Status</th></tr></thead>
      <tbody>{rows.map((t) => (
        <tr key={t.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
          <td className="px-4 py-2.5">{t.book_title}</td>
          <td className="px-4 py-2.5">{t.borrower_name}</td>
          <td className="px-4 py-2.5 text-xs">{formatDate(t.issue_date)}</td>
          <td className="px-4 py-2.5 text-xs">{formatDate(t.return_date)}</td>
          <td className="px-4 py-2.5"><Badge tone={t.status === 'Returned' ? 'green' : 'amber'}>{t.status}</Badge></td>
        </tr>
      ))}</tbody>
    </table></div></Card>
  );
}

// ================= INVENTORY =================

export function Inventory() {
  const { can } = useAuth();
  const canManage = can('inventory.manage');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fQ, setFQ] = useState('');
  const [fCond, setFCond] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);
  const [delLoading, setDelLoading] = useState(false);
  const { showSuccess, showError, toast } = useToast();
  const load = async () => {
    setLoading(true); setError('');
    try { setRows(await get('/api/operations?resource=inventory')); } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); // eslint-disable-next-line
  }, []);
  const doDelete = async () => {
    setDelLoading(true);
    try { await del(`/api/operations?resource=inventory&id=${deleting.id}`); showSuccess('Deleted'); setDeleting(null); load(); }
    catch (e: any) { showError(e.message); } finally { setDelLoading(false); }
  };
  const filtered = rows.filter((r) => (!fQ.trim() || `${r.name} ${r.asset_no || ''} ${r.location || ''} ${r.department || ''}`.toLowerCase().includes(fQ.toLowerCase())) && (!fCond || r.condition === fCond));
  const tone = (c: string) => c === 'New' || c === 'Good' ? 'green' : c === 'Fair' ? 'amber' : c === 'Damaged' ? 'red' : 'slate';
  return (
    <div>
      <Toast toast={toast} />
      <PageHeader title="Inventory & Assets" subtitle={`${rows.length} asset record(s)`} actions={canManage && <Button onClick={() => { setEditing(null); setShowForm(true); }}><Plus className="h-4 w-4" /> Add asset</Button>} />
      <Card className="mb-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="pl-9" placeholder="Search assets..." value={fQ} onChange={(e) => setFQ(e.target.value)} /></div>
          <Select value={fCond} onChange={(e) => setFCond(e.target.value)}><option value="">All conditions</option>{['New', 'Good', 'Fair', 'Damaged', 'Disposed'].map((c) => <option key={c} value={c}>{c}</option>)}</Select>
        </div>
      </Card>
      {loading ? <Spinner /> : error ? <ErrorState message={error} onRetry={load} /> : filtered.length === 0 ? <EmptyState title="No assets" icon={<Package className="h-8 w-8 text-slate-300" />} /> : (
        <Card><div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm">
          <thead><tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500"><th className="px-4 py-3">Asset</th><th className="px-4 py-3">Qty</th><th className="px-4 py-3">Location</th><th className="px-4 py-3">Department</th><th className="px-4 py-3">Condition</th><th className="px-4 py-3">Supplier</th>{canManage && <th className="px-4 py-3 text-right">Actions</th>}</tr></thead>
          <tbody>{filtered.map((r) => (
            <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
              <td className="px-4 py-2.5"><p className="font-medium">{r.name}</p><p className="font-mono text-xs text-slate-400">{r.asset_no || '—'}</p></td>
              <td className="px-4 py-2.5">{r.quantity}</td>
              <td className="px-4 py-2.5">{r.location || '—'}</td>
              <td className="px-4 py-2.5">{r.department || '—'}</td>
              <td className="px-4 py-2.5"><Badge tone={tone(r.condition) as any}>{r.condition}</Badge></td>
              <td className="px-4 py-2.5 text-xs">{r.supplier || '—'}</td>
              {canManage && <td className="px-4 py-2.5 text-right">
                <button onClick={() => { setEditing(r); setShowForm(true); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => setDeleting(r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
              </td>}
            </tr>
          ))}</tbody>
        </table></div></Card>
      )}
      {showForm && <AssetForm initial={editing} onSaved={() => { setShowForm(false); load(); }} onClose={() => setShowForm(false)} />}
      {deleting && <ConfirmDialog title="Delete asset" message={`Delete \"${deleting.name}\"?`} onConfirm={doDelete} onCancel={() => setDeleting(null)} loading={delLoading} />}
    </div>
  );
}

function AssetForm({ initial, onSaved, onClose }: any) {
  const [form, setForm] = useState({
    asset_no: initial?.asset_no || '', name: initial?.name || '', category: initial?.category || '', quantity: initial?.quantity ?? 1,
    location: initial?.location || '', condition: initial?.condition || 'Good', department: initial?.department || '',
    supplier: initial?.supplier || '', purchase_date: initial?.purchase_date || '', purchase_cost: initial?.purchase_cost || '', notes: initial?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const { showError, showSuccess, toast } = useToast();
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { showError('Asset name is required'); return; }
    setSaving(true);
    try {
      const payload = { ...form, quantity: Number(form.quantity) || 1, purchase_cost: form.purchase_cost ? Number(form.purchase_cost) : null, purchase_date: form.purchase_date || null };
      if (initial?.id) await put('/api/operations?resource=inventory', { ...payload, id: initial.id });
      else await post('/api/operations?resource=inventory', payload);
      showSuccess('Asset saved'); setTimeout(onSaved, 400);
    } catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };
  return (
    <Modal title={initial ? 'Edit asset' : 'Add asset'} onClose={onClose}>
      <Toast toast={toast} />
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Asset no"><Input value={form.asset_no} onChange={(e) => set('asset_no', e.target.value)} placeholder="e.g. AST-001" /></Field>
          <Field label="Name" required><Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Projector" /></Field>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Category"><Input value={form.category} onChange={(e) => set('category', e.target.value)} /></Field>
          <Field label="Quantity"><Input type="number" min="1" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} /></Field>
          <Field label="Condition"><Select value={form.condition} onChange={(e) => set('condition', e.target.value)}>{['New', 'Good', 'Fair', 'Damaged', 'Disposed'].map((c) => <option key={c} value={c}>{c}</option>)}</Select></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Location"><Input value={form.location} onChange={(e) => set('location', e.target.value)} /></Field>
          <Field label="Department"><Input value={form.department} onChange={(e) => set('department', e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Supplier"><Input value={form.supplier} onChange={(e) => set('supplier', e.target.value)} /></Field>
          <Field label="Purchase date"><Input type="date" value={form.purchase_date} onChange={(e) => set('purchase_date', e.target.value)} /></Field>
          <Field label="Cost (KES)"><Input type="number" value={form.purchase_cost} onChange={(e) => set('purchase_cost', e.target.value)} /></Field>
        </div>
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Save</Button></div>
      </form>
    </Modal>
  );
}
