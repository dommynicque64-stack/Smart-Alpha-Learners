import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Plus, Search, Pencil, Trash2, ArrowLeft, UserPlus, Unlink } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { get, post, put, del } from '../lib/api';
import { Card, Button, Input, Select, Field, Badge, Spinner, ErrorState, EmptyState, PageHeader, Modal, ConfirmDialog, useToast, Toast } from '../components/ui';
import { EMPLOYMENT_TYPES } from '../lib/constants';

function TeacherForm({ initial, onSaved, onCancel }: any) {
  const { showError, showSuccess, toast } = useToast();
  const [form, setForm] = useState({
    staff_no: initial?.staff_no || '', tsc_no: initial?.tsc_no || '', first_name: initial?.first_name || '', last_name: initial?.last_name || '',
    phone: initial?.phone || '', email: initial?.email || '', qualification: initial?.qualification || '', specialization: initial?.specialization || '',
    employment_type: initial?.employment_type || 'Full-time', status: initial?.status || 'Active', date_joined: initial?.date_joined || '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.staff_no.trim()) errs.staff_no = 'Required';
    if (!form.first_name.trim()) errs.first_name = 'Required';
    if (!form.last_name.trim()) errs.last_name = 'Required';
    if (form.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) errs.email = 'Invalid email';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const payload = { ...form, date_joined: form.date_joined || null };
      if (initial?.id) await put('/api/teachers', { ...payload, id: initial.id });
      else await post('/api/teachers', payload);
      showSuccess(initial?.id ? 'Teacher updated' : 'Teacher added');
      setTimeout(onSaved, 400);
    } catch (err: any) { showError(err.message); } finally { setSaving(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <Toast toast={toast} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Staff number" required error={errors.staff_no}><Input value={form.staff_no} onChange={(e) => set('staff_no', e.target.value)} /></Field>
        <Field label="TSC number"><Input value={form.tsc_no} onChange={(e) => set('tsc_no', e.target.value)} /></Field>
        <Field label="First name" required error={errors.first_name}><Input value={form.first_name} onChange={(e) => set('first_name', e.target.value)} /></Field>
        <Field label="Last name" required error={errors.last_name}><Input value={form.last_name} onChange={(e) => set('last_name', e.target.value)} /></Field>
        <Field label="Phone"><Input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Email" error={errors.email}><Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Qualification"><Input value={form.qualification} onChange={(e) => set('qualification', e.target.value)} placeholder="e.g. B.Ed, P1, Diploma" /></Field>
        <Field label="Specialization"><Input value={form.specialization} onChange={(e) => set('specialization', e.target.value)} placeholder="e.g. Mathematics / CRE" /></Field>
        <Field label="Employment type"><Select value={form.employment_type} onChange={(e) => set('employment_type', e.target.value)}>{EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</Select></Field>
        <Field label="Status"><Select value={form.status} onChange={(e) => set('status', e.target.value)}>{['Active', 'Inactive', 'On Leave', 'Exited'].map((s) => <option key={s} value={s}>{s}</option>)}</Select></Field>
        <Field label="Date joined"><Input type="date" value={form.date_joined} onChange={(e) => set('date_joined', e.target.value)} /></Field>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" type="button" onClick={onCancel}>Cancel</Button>
        <Button type="submit" loading={saving}>{initial?.id ? 'Save changes' : 'Add teacher'}</Button>
      </div>
    </form>
  );
}

export default function Teachers() {
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
  const canFull = can('teachers.manage', 'academic.manage');

  const load = async () => {
    setLoading(true); setError('');
    try { setRows(await get(`/api/teachers${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`)); }
    catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); // eslint-disable-next-line
  }, []);
  useEffect(() => { const t = setTimeout(() => { if (!loading) load(); }, 400); return () => clearTimeout(t); // eslint-disable-next-line
  }, [q]);

  const doDelete = async () => {
    setDelLoading(true);
    try { await del(`/api/teachers?id=${deleting.id}`); showSuccess('Teacher deleted'); setDeleting(null); load(); }
    catch (e: any) { showError(e.message); } finally { setDelLoading(false); }
  };

  return (
    <div>
      <Toast toast={toast} />
      <PageHeader title="Teachers & Staff" subtitle={`${rows.length} record(s)`} actions={canFull && <Button onClick={() => { setEditing(null); setShowForm(true); }}><Plus className="h-4 w-4" /> Add teacher</Button>} />
      <Card className="mb-4 p-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Search name, staff no or TSC no..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </Card>
      {loading ? <Spinner /> : error ? <ErrorState message={error} onRetry={load} /> : rows.length === 0 ? (
        <EmptyState title="No teachers found" action={canFull ? <Button onClick={() => { setEditing(null); setShowForm(true); }}><Plus className="h-4 w-4" /> Add teacher</Button> : undefined} />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead><tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Staff No</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Specialization</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th>
              </tr></thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs font-semibold">{t.staff_no}</td>
                    <td className="px-4 py-3"><Link to={`/teachers/${t.id}`} className="font-medium text-emerald-700 hover:underline">{t.first_name} {t.last_name}</Link><p className="text-xs text-slate-500">{t.tsc_no ? `TSC ${t.tsc_no}` : t.email || ''}</p></td>
                    <td className="px-4 py-3 text-slate-600">{t.specialization || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{t.phone || '—'}</td>
                    <td className="px-4 py-3"><Badge tone={t.status === 'Active' ? 'green' : 'slate'}>{t.status}</Badge></td>
                    <td className="px-4 py-3"><div className="flex justify-end gap-1">
                      {canFull && <button onClick={() => { setEditing(t); setShowForm(true); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800" title="Edit"><Pencil className="h-4 w-4" /></button>}
                      {canFull && <button onClick={() => setDeleting(t)} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700" title="Delete"><Trash2 className="h-4 w-4" /></button>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {showForm && <Modal title={editing ? 'Edit teacher' : 'Add teacher'} onClose={() => setShowForm(false)} wide><TeacherForm initial={editing} onSaved={() => { setShowForm(false); load(); }} onCancel={() => setShowForm(false)} /></Modal>}
      {deleting && <ConfirmDialog title="Delete teacher" message={`Delete ${deleting.first_name} ${deleting.last_name}? Their assignments will be removed.`} onConfirm={doDelete} onCancel={() => setDeleting(null)} loading={delLoading} />}
    </div>
  );
}

export function TeacherDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [teacher, setTeacher] = useState<any>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAssign, setShowAssign] = useState(false);
  const [showLinkUser, setShowLinkUser] = useState(false);
  const { showSuccess, showError, toast } = useToast();
  const canFull = can('teachers.manage', 'academic.manage');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const t = await get(`/api/teachers?id=${id}`);
      setTeacher(t);
      setAssignments(await get(`/api/teachers?assignments=1&teacher_id=${id}`));
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); // eslint-disable-next-line
  }, [id]);
  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!teacher) return <ErrorState message="Teacher not found" />;

  return (
    <div>
      <Toast toast={toast} />
      <button onClick={() => navigate(-1)} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Back</button>
      <PageHeader title={`${teacher.first_name} ${teacher.last_name}`} subtitle={`Staff ${teacher.staff_no}${teacher.tsc_no ? ` · TSC ${teacher.tsc_no}` : ''}`} actions={<Badge tone={teacher.status === 'Active' ? 'green' : 'slate'}>{teacher.status}</Badge>} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Profile</h3>
          <dl className="space-y-2.5 text-sm">
            {[['Phone', teacher.phone || '—'], ['Email', teacher.email || '—'], ['Qualification', teacher.qualification || '—'], ['Specialization', teacher.specialization || '—'], ['Employment', teacher.employment_type], ['Date joined', teacher.date_joined || '—'], ['Class teacher of', (teacher.homeroom_streams || []).map((s: any) => s.name).join(', ') || '—']].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-slate-50 pb-2 last:border-0"><dt className="text-slate-500">{k}</dt><dd className="text-right font-medium text-slate-800">{v as string}</dd></div>
            ))}
          </dl>
          <h3 className="mb-3 mt-6 text-sm font-bold uppercase tracking-wide text-slate-500">Login account</h3>
          {teacher.login_account ? (
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm">
              <div><p className="font-semibold text-slate-800">{teacher.login_account.full_name}</p><p className="text-xs text-slate-500">{teacher.login_account.email} · {teacher.login_account.status}</p></div>
              {canFull && <Button size="sm" variant="outline" onClick={async () => { try { await put('/api/teachers', { id: teacher.id, app_user_id: null }); showSuccess('Account unlinked'); load(); } catch (e: any) { showError(e.message); } }}><Unlink className="h-3.5 w-3.5" /> Unlink</Button>}
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-xl border border-dashed border-slate-300 px-3.5 py-3 text-sm text-slate-500">
              <span>No login account linked</span>
              {can('users.manage') && <Button size="sm" variant="outline" onClick={() => setShowLinkUser(true)}><UserPlus className="h-3.5 w-3.5" /> Link account</Button>}
            </div>
          )}
        </Card>
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Class & subject assignments</h3>
            {canFull && <Button size="sm" variant="outline" onClick={() => setShowAssign(true)}><Plus className="h-3.5 w-3.5" /> Assign</Button>}
          </div>
          <div className="space-y-2">
            {assignments.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">{a.grade_name} {a.stream_name} — {a.learning_area_name}</p>
                  <p className="text-xs text-slate-500">{a.role}</p>
                </div>
                {canFull && <button onClick={async () => { try { await post('/api/teachers', { action: 'unassign', assignment_id: a.id }); showSuccess('Assignment removed'); load(); } catch (e: any) { showError(e.message); } }} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Remove"><Unlink className="h-4 w-4" /></button>}
              </div>
            ))}
            {!assignments.length && <p className="text-sm text-slate-500">No assignments yet. Assign this teacher to streams and learning areas.</p>}
          </div>
        </Card>
      </div>
      {showAssign && <AssignModal teacherId={teacher.id} onDone={() => { setShowAssign(false); load(); }} onClose={() => setShowAssign(false)} />}
      {showLinkUser && <LinkUserModal kind="teacher" recordId={teacher.id} onDone={() => { setShowLinkUser(false); load(); }} onClose={() => setShowLinkUser(false)} />}
    </div>
  );
}

export function AssignModal({ teacherId, onDone, onClose }: { teacherId: number; onDone: () => void; onClose: () => void }) {
  const [grades, setGrades] = useState<any[]>([]);
  const [streams, setStreams] = useState<any[]>([]);
  const [areas, setAreas] = useState<any[]>([]);
  const [years, setYears] = useState<any[]>([]);
  const [gradeId, setGradeId] = useState('');
  const [streamId, setStreamId] = useState('');
  const [areaId, setAreaId] = useState('');
  const [yearId, setYearId] = useState('');
  const [role, setRole] = useState('Subject Teacher');
  const [saving, setSaving] = useState(false);
  const { showSuccess, showError, toast } = useToast();
  useEffect(() => {
    (async () => {
      try {
        const [g, s, y] = await Promise.all([get('/api/academic?resource=grades'), get('/api/academic?resource=streams'), get('/api/academic?resource=years')]);
        setGrades(g); setStreams(s); setYears(y);
        const cur = y.find((x: any) => x.is_current); if (cur) setYearId(String(cur.id));
        const versions = await get('/api/curriculum?resource=versions');
        const active = versions.find((v: any) => v.is_active);
        const la = await get(`/api/curriculum?resource=learning-areas${active ? `&curriculum_version_id=${active.id}` : ''}`);
        setAreas(la);
      } catch { /* noop */ }
    })();
  }, []);
  const filtered = streams.filter((s) => !gradeId || String(s.grade_id) === String(gradeId));
  const save = async () => {
    if (!streamId || !yearId) { showError('Stream and academic year are required'); return; }
    setSaving(true);
    try {
      await post('/api/teachers', { action: 'assign', teacher_id: teacherId, stream_id: Number(streamId), learning_area_id: areaId ? Number(areaId) : null, academic_year_id: Number(yearId), role });
      showSuccess('Teacher assigned'); setTimeout(onDone, 400);
    } catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };
  return (
    <Modal title="Assign teacher" subtitle="Link to a stream/class and learning area" onClose={onClose}>
      <Toast toast={toast} />
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Grade"><Select value={gradeId} onChange={(e) => { setGradeId(e.target.value); setStreamId(''); }}><option value="">All</option>{grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select></Field>
          <Field label="Stream" required><Select value={streamId} onChange={(e) => setStreamId(e.target.value)}><option value="">— Select —</option>{filtered.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        </div>
        <Field label="Learning area (optional — blank = all areas)"><Select value={areaId} onChange={(e) => setAreaId(e.target.value)}><option value="">All learning areas</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Academic year" required><Select value={yearId} onChange={(e) => setYearId(e.target.value)}><option value="">— Select —</option>{years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</Select></Field>
          <Field label="Role"><Select value={role} onChange={(e) => setRole(e.target.value)}>{['Subject Teacher', 'Class Teacher', 'Assistant'].map((r) => <option key={r} value={r}>{r}</option>)}</Select></Field>
        </div>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={saving}>Assign</Button></div>
      </div>
    </Modal>
  );
}

export function LinkUserModal({ kind, recordId, onDone, onClose }: { kind: 'teacher' | 'parent' | 'learner'; recordId: number; onDone: () => void; onClose: () => void }) {
  const [users, setUsers] = useState<any[]>([]);
  const [userId, setUserId] = useState('');
  const [saving, setSaving] = useState(false);
  const { showSuccess, showError, toast } = useToast();
  useEffect(() => { get('/api/users').then(setUsers).catch(() => {}); }, []);
  const save = async () => {
    if (!userId) { showError('Select a user account'); return; }
    setSaving(true);
    try {
      const ep = kind === 'teacher' ? '/api/teachers' : kind === 'parent' ? '/api/parents' : '/api/learners';
      await put(ep, { id: recordId, app_user_id: Number(userId) });
      showSuccess('Account linked'); setTimeout(onDone, 400);
    } catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };
  return (
    <Modal title="Link login account" subtitle="Connect this profile to a user account for portal access" onClose={onClose}>
      <Toast toast={toast} />
      <div className="space-y-4">
        <Field label="User account" required>
          <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">— Select —</option>
            {users.filter((u) => u.status === 'Active').map((u) => <option key={u.id} value={u.id}>{u.full_name} · {u.email} ({u.roles?.name})</option>)}
          </Select>
        </Field>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={saving}>Link account</Button></div>
      </div>
    </Modal>
  );
}
