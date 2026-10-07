import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Plus, Search, Pencil, Trash2, ArrowLeft, Link2, Unlink, UserPlus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { get, post, put, del } from '../lib/api';
import { Card, Button, Input, Select, Field, Badge, Spinner, ErrorState, EmptyState, PageHeader, Modal, ConfirmDialog, useToast, Toast } from '../components/ui';
import { fullName, formatDate, ageFromDob, GENDER_OPTIONS, LEARNER_STATUSES, ratingLabel } from '../lib/constants';

export function LearnerForm({ initial, grades, streams, years, onSaved, onCancel }: any) {
  const { showError, showSuccess, toast } = useToast();
  const [form, setForm] = useState({
    admission_no: initial?.admission_no || '', first_name: initial?.first_name || '', middle_name: initial?.middle_name || '',
    last_name: initial?.last_name || '', dob: initial?.dob || '', gender: initial?.gender || '',
    grade_id: initial?.grade_id || '', stream_id: initial?.stream_id || '', academic_year_id: initial?.academic_year_id || (years.find((y: any) => y.is_current)?.id || ''),
    admission_date: initial?.admission_date || '', previous_school: initial?.previous_school || '', status: initial?.status || 'Active',
    emergency_contact_name: initial?.emergency_contact_name || '', emergency_contact_phone: initial?.emergency_contact_phone || '',
    medical_notes: initial?.medical_notes || '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const filteredStreams = streams.filter((s: any) => !form.grade_id || String(s.grade_id) === String(form.grade_id));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.admission_no.trim()) errs.admission_no = 'Required';
    if (!form.first_name.trim()) errs.first_name = 'Required';
    if (!form.last_name.trim()) errs.last_name = 'Required';
    if (!form.grade_id) errs.grade_id = 'Required';
    if (!form.stream_id) errs.stream_id = 'Required';
    if (!form.academic_year_id) errs.academic_year_id = 'Required';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const payload = { ...form, grade_id: Number(form.grade_id), stream_id: Number(form.stream_id), academic_year_id: Number(form.academic_year_id), dob: form.dob || null, admission_date: form.admission_date || null };
      if (initial?.id) await put('/api/learners', { ...payload, id: initial.id });
      else await post('/api/learners', payload);
      showSuccess(initial?.id ? 'Learner updated' : 'Learner admitted');
      setTimeout(onSaved, 400);
    } catch (err: any) { showError(err.message); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Toast toast={toast} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Admission number" required error={errors.admission_no}><Input value={form.admission_no} onChange={(e) => set('admission_no', e.target.value)} placeholder="e.g. ELM/2026/001" /></Field>
        <Field label="Status" required><Select value={form.status} onChange={(e) => set('status', e.target.value)}>{LEARNER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</Select></Field>
        <Field label="First name" required error={errors.first_name}><Input value={form.first_name} onChange={(e) => set('first_name', e.target.value)} /></Field>
        <Field label="Middle name"><Input value={form.middle_name} onChange={(e) => set('middle_name', e.target.value)} /></Field>
        <Field label="Last name" required error={errors.last_name}><Input value={form.last_name} onChange={(e) => set('last_name', e.target.value)} /></Field>
        <Field label="Gender"><Select value={form.gender} onChange={(e) => set('gender', e.target.value)}><option value="">— Select —</option>{GENDER_OPTIONS.map((g) => <option key={g} value={g}>{g}</option>)}</Select></Field>
        <Field label="Date of birth"><Input type="date" value={form.dob} onChange={(e) => set('dob', e.target.value)} /></Field>
        <Field label="Admission date"><Input type="date" value={form.admission_date} onChange={(e) => set('admission_date', e.target.value)} /></Field>
        <Field label="Grade" required error={errors.grade_id}>
          <Select value={form.grade_id} onChange={(e) => { set('grade_id', e.target.value); set('stream_id', ''); }}>
            <option value="">— Select —</option>{grades.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
        </Field>
        <Field label="Stream / Class" required error={errors.stream_id}>
          <Select value={form.stream_id} onChange={(e) => set('stream_id', e.target.value)}>
            <option value="">— Select —</option>{filteredStreams.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Academic year" required error={errors.academic_year_id}>
          <Select value={form.academic_year_id} onChange={(e) => set('academic_year_id', e.target.value)}>
            <option value="">— Select —</option>{years.map((y: any) => <option key={y.id} value={y.id}>{y.name}{y.is_current ? ' (current)' : ''}</option>)}
          </Select>
        </Field>
        <Field label="Previous school"><Input value={form.previous_school} onChange={(e) => set('previous_school', e.target.value)} /></Field>
        <Field label="Emergency contact name"><Input value={form.emergency_contact_name} onChange={(e) => set('emergency_contact_name', e.target.value)} /></Field>
        <Field label="Emergency contact phone"><Input value={form.emergency_contact_phone} onChange={(e) => set('emergency_contact_phone', e.target.value)} /></Field>
      </div>
      <Field label="Medical notes"><Input value={form.medical_notes} onChange={(e) => set('medical_notes', e.target.value)} placeholder="Allergies, conditions, medication..." /></Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" type="button" onClick={onCancel}>Cancel</Button>
        <Button type="submit" loading={saving}>{initial?.id ? 'Save changes' : 'Admit learner'}</Button>
      </div>
    </form>
  );
}

export default function Learners() {
  const { can } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [streams, setStreams] = useState<any[]>([]);
  const [years, setYears] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [fGrade, setFGrade] = useState('');
  const [fStream, setFStream] = useState('');
  const [fStatus, setFStatus] = useState('Active');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);
  const [delLoading, setDelLoading] = useState(false);
  const { showSuccess, showError, toast } = useToast();
  const canFull = can('learners.manage');
  const canEdit = canFull || can('learners.edit');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (fGrade) params.set('grade_id', fGrade);
      if (fStream) params.set('stream_id', fStream);
      if (fStatus) params.set('status', fStatus);
      const [l, g, s, y] = await Promise.all([
        get(`/api/learners?${params.toString()}`),
        grades.length ? Promise.resolve(grades) : get('/api/academic?resource=grades'),
        streams.length ? Promise.resolve(streams) : get('/api/academic?resource=streams'),
        years.length ? Promise.resolve(years) : get('/api/academic?resource=years'),
      ]);
      setRows(l); setGrades(g); setStreams(s); setYears(y);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); // eslint-disable-next-line
  }, []);
  useEffect(() => {
    const t = setTimeout(() => { if (!loading) load(); }, 400);
    return () => clearTimeout(t); // eslint-disable-next-line
  }, [q, fGrade, fStream, fStatus]);

  const doDelete = async () => {
    setDelLoading(true);
    try { await del(`/api/learners?id=${deleting.id}`); showSuccess('Learner deleted'); setDeleting(null); load(); }
    catch (e: any) { showError(e.message); } finally { setDelLoading(false); }
  };

  const filteredStreams = streams.filter((s) => !fGrade || String(s.grade_id) === String(fGrade));

  return (
    <div>
      <Toast toast={toast} />
      <PageHeader title="Learners" subtitle={`${rows.length} learner(s) shown`} actions={canFull && <Button onClick={() => { setEditing(null); setShowForm(true); }}><Plus className="h-4 w-4" /> Admit learner</Button>} />
      <Card className="mb-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input className="pl-9" placeholder="Search name or admission no..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={fGrade} onChange={(e) => { setFGrade(e.target.value); setFStream(''); }}><option value="">All grades</option>{grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select>
          <Select value={fStream} onChange={(e) => setFStream(e.target.value)}><option value="">All streams</option>{filteredStreams.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
          <Select value={fStatus} onChange={(e) => setFStatus(e.target.value)}><option value="">All statuses</option>{LEARNER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</Select>
        </div>
      </Card>
      {loading ? <Spinner /> : error ? <ErrorState message={error} onRetry={load} /> : rows.length === 0 ? (
        <EmptyState title="No learners found" subtitle="Adjust filters or admit a new learner." action={canFull ? <Button onClick={() => { setEditing(null); setShowForm(true); }}><Plus className="h-4 w-4" /> Admit learner</Button> : undefined} />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Admission No</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Grade</th><th className="px-4 py-3">Stream</th><th className="px-4 py-3">Gender</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-700">{l.admission_no}</td>
                    <td className="px-4 py-3"><Link to={`/learners/${l.id}`} className="font-medium text-emerald-700 hover:underline">{fullName(l)}</Link></td>
                    <td className="px-4 py-3 text-slate-600">{l.grade_code || l.grade_name}</td>
                    <td className="px-4 py-3 text-slate-600">{l.stream_name}</td>
                    <td className="px-4 py-3 text-slate-600">{l.gender || '—'}</td>
                    <td className="px-4 py-3"><Badge tone={l.status === 'Active' ? 'green' : 'slate'}>{l.status}</Badge></td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {canEdit && <button onClick={() => { setEditing(l); setShowForm(true); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800" title="Edit"><Pencil className="h-4 w-4" /></button>}
                        {canFull && <button onClick={() => setDeleting(l)} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700" title="Delete"><Trash2 className="h-4 w-4" /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {showForm && (
        <Modal title={editing ? 'Edit learner' : 'Admit learner'} subtitle={editing ? fullName(editing) : 'Create a complete learner profile'} onClose={() => setShowForm(false)} wide>
          <LearnerForm initial={editing} grades={grades} streams={streams} years={years} onSaved={() => { setShowForm(false); load(); }} onCancel={() => setShowForm(false)} />
        </Modal>
      )}
      {deleting && <ConfirmDialog title="Delete learner" message={`Delete ${fullName(deleting)} (${deleting.admission_no})? This removes their links, observations and attendance records. This cannot be undone.`} onConfirm={doDelete} onCancel={() => setDeleting(null)} loading={delLoading} />}
    </div>
  );
}

export function LearnerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const [learner, setLearner] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showLink, setShowLink] = useState(false);
  const { showSuccess, showError, toast } = useToast();
  const canEdit = can('learners.manage', 'learners.edit');
  const canLink = can('learners.manage', 'parents.manage');

  const load = async () => {
    setLoading(true); setError('');
    try { setLearner(await get(`/api/learners?id=${id}`)); }
    catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); // eslint-disable-next-line
  }, [id]);

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!learner) return <ErrorState message="Learner not found" />;
  const age = ageFromDob(learner.dob);

  return (
    <div>
      <Toast toast={toast} />
      <button onClick={() => navigate(-1)} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Back</button>
      <PageHeader
        title={fullName(learner)}
        subtitle={`Adm ${learner.admission_no} · ${learner.grade_name} ${learner.stream_name} · ${learner.academic_year_name}`}
        actions={<Badge tone={learner.status === 'Active' ? 'green' : 'slate'}>{learner.status}</Badge>}
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <div className="p-5">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-700 text-xl font-bold text-white">{learner.first_name?.[0]}{learner.last_name?.[0]}</div>
              <div>
                <p className="font-bold text-slate-900">{fullName(learner)}</p>
                <p className="text-sm text-slate-500">{learner.gender || '—'}{age !== null ? ` · ${age} yrs` : ''}</p>
              </div>
            </div>
            <dl className="mt-5 space-y-2.5 text-sm">
              {[['Date of birth', formatDate(learner.dob)], ['Admission date', formatDate(learner.admission_date)], ['Previous school', learner.previous_school || '—'], ['Emergency contact', learner.emergency_contact_name ? `${learner.emergency_contact_name} · ${learner.emergency_contact_phone || ''}` : '—'], ['Medical notes', learner.medical_notes || '—']].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-slate-50 pb-2 last:border-0"><dt className="text-slate-500">{k}</dt><dd className="text-right font-medium text-slate-800">{v}</dd></div>
              ))}
            </dl>
          </div>
        </Card>
        <Card>
          <div className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Parents / Guardians</h3>
              {canLink && <Button size="sm" variant="outline" onClick={() => setShowLink(true)}><Link2 className="h-3.5 w-3.5" /> Link</Button>}
            </div>
            <div className="space-y-2">
              {(learner.parents || []).map((p: any) => (
                <div key={p.link_id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <Link to={`/parents/${p.id}`} className="block truncate text-sm font-semibold text-emerald-700 hover:underline">{p.first_name} {p.last_name}</Link>
                    <p className="text-xs text-slate-500">{p.relationship}{p.is_primary ? ' · Primary' : ''} · {p.phone}</p>
                  </div>
                  {canLink && <button onClick={async () => { try { await post('/api/parents', { action: 'unlink', link_id: p.link_id }); showSuccess('Unlinked'); load(); } catch (e: any) { showError(e.message); } }} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Unlink"><Unlink className="h-4 w-4" /></button>}
                </div>
              ))}
              {!(learner.parents || []).length && <p className="text-sm text-slate-500">No parents linked yet.</p>}
            </div>
            <h3 className="mb-3 mt-6 text-sm font-bold uppercase tracking-wide text-slate-500">Attendance</h3>
            <div className="rounded-xl bg-slate-50 p-4 text-center">
              <p className="text-3xl font-bold text-slate-900">{learner.attendance?.rate === null || learner.attendance?.rate === undefined ? '—' : `${learner.attendance.rate}%`}</p>
              <p className="text-xs text-slate-500">{learner.attendance?.present || 0} / {learner.attendance?.total || 0} days present</p>
            </div>
          </div>
        </Card>
        <div className="space-y-4">
          <Card>
            <div className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Competency ratings</h3>
                {can('observations.manage', 'curriculum.manage') && <Link to="/curriculum?tab=records" className="text-xs font-semibold text-emerald-700 hover:underline">+ Record</Link>}
              </div>
              <div className="space-y-1.5">
                {(learner.competency_records || []).slice(0, 8).map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <span className="truncate font-medium text-slate-700">{r.competencies?.name}</span>
                    <Badge tone={r.rating?.startsWith('EE') ? 'green' : r.rating?.startsWith('ME') ? 'blue' : r.rating?.startsWith('AE') ? 'amber' : 'red'}>{r.rating}</Badge>
                  </div>
                ))}
                {!(learner.competency_records || []).length && <p className="text-sm text-slate-500">No ratings yet.</p>}
              </div>
            </div>
          </Card>
          <Card>
            <div className="p-5">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Observations</h3>
              <div className="space-y-2">
                {(learner.observations || []).slice(0, 5).map((o: any) => (
                  <div key={o.id} className="rounded-xl bg-slate-50 px-3.5 py-2.5">
                    <p className="text-xs font-bold text-slate-700">{o.core_values?.name || 'General'} · {formatDate(o.observation_date)}</p>
                    <p className="mt-0.5 text-sm text-slate-600">{o.observation}</p>
                  </div>
                ))}
                {!(learner.observations || []).length && <p className="text-sm text-slate-500">No observations yet.</p>}
              </div>
            </div>
          </Card>
        </div>
      </div>
      {showLink && <LinkParentModal learnerId={learner.id} onDone={() => { setShowLink(false); load(); }} onClose={() => setShowLink(false)} />}
    </div>
  );
}

export function LinkParentModal({ learnerId, onDone, onClose }: { learnerId: number; onDone: () => void; onClose: () => void }) {
  const [parents, setParents] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [parentId, setParentId] = useState('');
  const [relationship, setRelationship] = useState('Guardian');
  const [isPrimary, setIsPrimary] = useState(false);
  const [saving, setSaving] = useState(false);
  const { showSuccess, showError, toast } = useToast();
  useEffect(() => { get('/api/parents?limit=300').then(setParents).catch(() => {}); }, []);
  const filtered = parents.filter((p) => !q.trim() || `${p.first_name} ${p.last_name} ${p.phone}`.toLowerCase().includes(q.toLowerCase()));
  const save = async () => {
    if (!parentId) { showError('Select a parent/guardian'); return; }
    setSaving(true);
    try {
      await post('/api/parents', { action: 'link', learner_id: learnerId, parent_id: Number(parentId), relationship, is_primary: isPrimary });
      showSuccess('Parent linked'); setTimeout(onDone, 400);
    } catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };
  return (
    <Modal title="Link parent / guardian" subtitle="Attach an existing parent profile to this learner" onClose={onClose}>
      <Toast toast={toast} />
      <div className="space-y-4">
        <Field label="Search parents"><Input placeholder="Name or phone..." value={q} onChange={(e) => setQ(e.target.value)} /></Field>
        <Field label="Parent / Guardian" required>
          <Select value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">— Select —</option>
            {filtered.slice(0, 60).map((p) => <option key={p.id} value={p.id}>{p.first_name} {p.last_name} · {p.phone}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Relationship"><Select value={relationship} onChange={(e) => setRelationship(e.target.value)}>{['Father', 'Mother', 'Guardian', 'Uncle', 'Aunt', 'Grandparent', 'Sibling', 'Sponsor', 'Other'].map((r) => <option key={r} value={r}>{r}</option>)}</Select></Field>
          <Field label="Primary contact"><label className="flex items-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2 text-sm"><input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} className="h-4 w-4 accent-emerald-700" /> Primary</label></Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} loading={saving}><UserPlus className="h-4 w-4" /> Link parent</Button>
        </div>
      </div>
    </Modal>
  );
}
