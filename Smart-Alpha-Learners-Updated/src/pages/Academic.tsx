import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { get, post, put, del } from '../lib/api';
import { Card, Button, Input, Select, Field, Badge, Spinner, ErrorState, EmptyState, PageHeader, Modal, ConfirmDialog, Tabs, useToast, Toast } from '../components/ui';

type TabKey = 'years' | 'terms' | 'levels' | 'grades' | 'streams';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'years', label: 'Academic Years' },
  { key: 'terms', label: 'Terms' },
  { key: 'levels', label: 'School Levels' },
  { key: 'grades', label: 'Grades' },
  { key: 'streams', label: 'Streams / Classes' },
];

export default function Academic() {
  const { can } = useAuth();
  const canManage = can('academic.manage');
  const [tab, setTab] = useState<TabKey>('years');
  const [rows, setRows] = useState<any[]>([]);
  const [years, setYears] = useState<any[]>([]);
  const [levels, setLevels] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);
  const [delLoading, setDelLoading] = useState(false);
  const [fYear, setFYear] = useState('');
  const [fLevel, setFLevel] = useState('');
  const [fGrade, setFGrade] = useState('');
  const { showSuccess, showError, toast } = useToast();

  const loadLookups = async () => {
    const [y, l, g] = await Promise.all([
      get('/api/academic?resource=years'),
      get('/api/academic?resource=levels'),
      get('/api/academic?resource=grades'),
    ]);
    setYears(y); setLevels(l); setGrades(g);
    try { setTeachers(await get('/api/teachers?status=Active')); } catch { /* may lack permission */ }
  };

  const loadTab = async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ resource: tab });
      if (tab === 'terms' && fYear) params.set('academic_year_id', fYear);
      if (tab === 'grades' && fLevel) params.set('level_id', fLevel);
      if (tab === 'streams') {
        params.set('include', 'counts');
        if (fGrade) params.set('grade_id', fGrade);
        if (fYear) params.set('academic_year_id', fYear);
      }
      setRows(await get(`/api/academic?${params.toString()}`));
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  useEffect(() => { loadLookups(); // eslint-disable-next-line
  }, []);
  useEffect(() => { loadTab(); // eslint-disable-next-line
  }, [tab, fYear, fLevel, fGrade]);

  const doDelete = async () => {
    setDelLoading(true);
    try { await del(`/api/academic?resource=${tab}&id=${deleting.id}`); showSuccess('Deleted'); setDeleting(null); loadTab(); loadLookups(); }
    catch (e: any) { showError(e.message); } finally { setDelLoading(false); }
  };

  const openCreate = () => { setEditing(null); setShowForm(true); };
  const openEdit = (r: any) => { setEditing(r); setShowForm(true); };

  return (
    <div>
      <Toast toast={toast} />
      <PageHeader title="Academic Structure" subtitle="Years, terms, levels, grades and streams" actions={canManage && <Button onClick={openCreate}><Plus className="h-4 w-4" /> Add {TABS.find((t) => t.key === tab)?.label.replace(/s$/, '')}</Button>} />
      <Tabs tabs={TABS.map((t) => ({ key: t.key, label: t.label }))} active={tab} onChange={(k) => setTab(k as TabKey)} />
      <div className="mt-4">
        {tab === 'terms' && (
          <Card className="mb-4 p-4"><div className="max-w-xs"><Select value={fYear} onChange={(e) => setFYear(e.target.value)}><option value="">All academic years</option>{years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</Select></div></Card>
        )}
        {tab === 'grades' && (
          <Card className="mb-4 p-4"><div className="max-w-xs"><Select value={fLevel} onChange={(e) => setFLevel(e.target.value)}><option value="">All levels</option>{levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></div></Card>
        )}
        {tab === 'streams' && (
          <Card className="mb-4 p-4"><div className="grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
            <Select value={fYear} onChange={(e) => setFYear(e.target.value)}><option value="">All years</option>{years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</Select>
            <Select value={fGrade} onChange={(e) => setFGrade(e.target.value)}><option value="">All grades</option>{grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select>
          </div></Card>
        )}
        {loading ? <Spinner /> : error ? <ErrorState message={error} onRetry={loadTab} /> : rows.length === 0 ? (
          <EmptyState title="Nothing here yet" subtitle="Add the first record for this section." action={canManage ? <Button onClick={openCreate}><Plus className="h-4 w-4" /> Add</Button> : undefined} />
        ) : tab === 'streams' ? <StreamsTable rows={rows} canManage={canManage} onEdit={openEdit} onDelete={setDeleting} /> : tab === 'grades' ? <GenericTable tab={tab} rows={rows} canManage={canManage} onEdit={openEdit} onDelete={setDeleting} cols={[{ k: 'name', h: 'Grade' }, { k: 'code', h: 'Code' }, { k: 'level_name', h: 'Level' }, { k: 'order_index', h: 'Order' }]} />
          : tab === 'levels' ? <GenericTable tab={tab} rows={rows} canManage={canManage} onEdit={openEdit} onDelete={setDeleting} cols={[{ k: 'name', h: 'Level' }, { k: 'code', h: 'Code' }, { k: 'order_index', h: 'Order' }, { k: 'is_enabled', h: 'Enabled', fmt: (v: boolean) => v ? 'Yes' : 'No' }]} />
          : tab === 'terms' ? <GenericTable tab={tab} rows={rows} canManage={canManage} onEdit={openEdit} onDelete={setDeleting} cols={[{ k: 'name', h: 'Term' }, { k: 'academic_year_name', h: 'Year' }, { k: 'start_date', h: 'Starts' }, { k: 'end_date', h: 'Ends' }, { k: 'is_current', h: 'Current', fmt: (v: boolean) => v ? 'Yes' : 'No' }]} />
          : <GenericTable tab={tab} rows={rows} canManage={canManage} onEdit={openEdit} onDelete={setDeleting} cols={[{ k: 'name', h: 'Year' }, { k: 'start_date', h: 'Starts' }, { k: 'end_date', h: 'Ends' }, { k: 'is_current', h: 'Current', fmt: (v: boolean) => v ? 'Yes' : 'No' }, { k: 'status', h: 'Status' }]} />
        }
      </div>
      {showForm && (
        <Modal title={`${editing ? 'Edit' : 'Add'} ${TABS.find((t) => t.key === tab)?.label.replace(/s$/, '')}`} onClose={() => setShowForm(false)}>
          <AcademicForm tab={tab} initial={editing} years={years} levels={levels} grades={grades} teachers={teachers} onSaved={() => { setShowForm(false); loadTab(); loadLookups(); }} onCancel={() => setShowForm(false)} />
        </Modal>
      )}
      {deleting && <ConfirmDialog title="Delete record" message="Delete this record? Records with dependent data (learners, streams, grades) cannot be deleted." onConfirm={doDelete} onCancel={() => setDeleting(null)} loading={delLoading} />}
    </div>
  );
}

function GenericTable({ rows, cols, canManage, onEdit, onDelete }: any) {
  return (
    <Card><div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm">
      <thead><tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
        {cols.map((c: any) => <th key={c.k} className="px-4 py-3">{c.h}</th>)}
        <th className="px-4 py-3 text-right">Actions</th>
      </tr></thead>
      <tbody>
        {rows.map((r: any) => (
          <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
            {cols.map((c: any) => (
              <td key={c.k} className="px-4 py-3 text-slate-700">
                {c.k === 'is_current' && r[c.k] ? <Badge tone="green">Current</Badge> : c.k === 'is_enabled' ? <Badge tone={r[c.k] ? 'green' : 'slate'}>{r[c.k] ? 'Enabled' : 'Disabled'}</Badge> : c.fmt ? c.fmt(r[c.k]) : (r[c.k] ?? '—')}
              </td>
            ))}
            <td className="px-4 py-3"><div className="flex justify-end gap-1">
              {canManage && <button onClick={() => onEdit(r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"><Pencil className="h-4 w-4" /></button>}
              {canManage && <button onClick={() => onDelete(r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="h-4 w-4" /></button>}
            </div></td>
          </tr>
        ))}
      </tbody>
    </table></div></Card>
  );
}

function StreamsTable({ rows, canManage, onEdit, onDelete }: any) {
  return (
    <Card><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
      <thead><tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
        <th className="px-4 py-3">Stream</th><th className="px-4 py-3">Grade</th><th className="px-4 py-3">Class Teacher</th><th className="px-4 py-3">Learners</th><th className="px-4 py-3">Capacity</th><th className="px-4 py-3 text-right">Actions</th>
      </tr></thead>
      <tbody>
        {rows.map((r: any) => (
          <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
            <td className="px-4 py-3 font-semibold text-slate-800">{r.name}</td>
            <td className="px-4 py-3 text-slate-600">{r.grade_code || r.grade_name}</td>
            <td className="px-4 py-3 text-slate-600">{r.class_teacher_name || '—'}</td>
            <td className="px-4 py-3 text-slate-600">{r.learner_count}{r.boys !== undefined ? ` (${r.boys}B/${r.girls}G)` : ''}</td>
            <td className="px-4 py-3 text-slate-600">{r.capacity || '—'}</td>
            <td className="px-4 py-3"><div className="flex justify-end gap-1">
              {canManage && <button onClick={() => onEdit(r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"><Pencil className="h-4 w-4" /></button>}
              {canManage && <button onClick={() => onDelete(r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="h-4 w-4" /></button>}
            </div></td>
          </tr>
        ))}
      </tbody>
    </table></div></Card>
  );
}

function AcademicForm({ tab, initial, years, levels, grades, teachers, onSaved, onCancel }: any) {
  const { showError, showSuccess, toast } = useToast();
  const [form, setForm] = useState<any>({ ...(initial || {}) });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  useEffect(() => {
    if (!initial) {
      if (tab === 'terms') { const cur = years.find((y: any) => y.is_current); if (cur) set('academic_year_id', cur.id); }
      if (tab === 'streams') { const cur = years.find((y: any) => y.is_current); if (cur) set('academic_year_id', cur.id); }
    }
    // eslint-disable-next-line
  }, []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (initial?.id) await put(`/api/academic?resource=${tab}`, { ...form, id: initial.id });
      else await post(`/api/academic?resource=${tab}`, form);
      showSuccess('Saved'); setTimeout(onSaved, 400);
    } catch (err: any) { showError(err.message); } finally { setSaving(false); }
  };
  const filteredGrades = tab === 'streams' && form.grade_id ? grades : grades;
  return (
    <form onSubmit={submit} className="space-y-4">
      <Toast toast={toast} />
      {tab === 'years' && (<>
        <Field label="Year name" required><Input value={form.name || ''} onChange={(e) => set('name', e.target.value)} placeholder="e.g. 2026" /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Start date"><Input type="date" value={form.start_date || ''} onChange={(e) => set('start_date', e.target.value)} /></Field>
          <Field label="End date"><Input type="date" value={form.end_date || ''} onChange={(e) => set('end_date', e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Status"><Select value={form.status || 'Active'} onChange={(e) => set('status', e.target.value)}>{['Active', 'Archived'].map((s) => <option key={s} value={s}>{s}</option>)}</Select></Field>
          <Field label="Current year"><label className="flex items-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2 text-sm"><input type="checkbox" checked={!!form.is_current} onChange={(e) => set('is_current', e.target.checked)} className="h-4 w-4 accent-emerald-700" /> Set as current</label></Field>
        </div>
      </>)}
      {tab === 'terms' && (<>
        <Field label="Academic year" required><Select value={form.academic_year_id || ''} onChange={(e) => set('academic_year_id', Number(e.target.value))}><option value="">— Select —</option>{years.map((y: any) => <option key={y.id} value={y.id}>{y.name}</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Term name" required><Input value={form.name || ''} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Term 1" /></Field>
          <Field label="Term number"><Input type="number" min={1} max={3} value={form.term_number || ''} onChange={(e) => set('term_number', e.target.value ? Number(e.target.value) : null)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Start date"><Input type="date" value={form.start_date || ''} onChange={(e) => set('start_date', e.target.value)} /></Field>
          <Field label="End date"><Input type="date" value={form.end_date || ''} onChange={(e) => set('end_date', e.target.value)} /></Field>
        </div>
        <Field label="Current term"><label className="flex items-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2 text-sm"><input type="checkbox" checked={!!form.is_current} onChange={(e) => set('is_current', e.target.checked)} className="h-4 w-4 accent-emerald-700" /> Set as current</label></Field>
      </>)}
      {tab === 'levels' && (<>
        <Field label="Level name" required><Input value={form.name || ''} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Junior School" /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Code"><Input value={form.code || ''} onChange={(e) => set('code', e.target.value)} placeholder="e.g. JS" /></Field>
          <Field label="Order"><Input type="number" value={form.order_index ?? 0} onChange={(e) => set('order_index', Number(e.target.value))} /></Field>
        </div>
        <Field label="Enabled"><label className="flex items-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2 text-sm"><input type="checkbox" checked={form.is_enabled !== false} onChange={(e) => set('is_enabled', e.target.checked)} className="h-4 w-4 accent-emerald-700" /> Enabled for this school</label></Field>
      </>)}
      {tab === 'grades' && (<>
        <Field label="Level" required><Select value={form.level_id || ''} onChange={(e) => set('level_id', Number(e.target.value))}><option value="">— Select —</option>{levels.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></Field>
        <Field label="Grade name" required><Input value={form.name || ''} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Grade 7" /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Code"><Input value={form.code || ''} onChange={(e) => set('code', e.target.value)} placeholder="e.g. G7" /></Field>
          <Field label="Order"><Input type="number" value={form.order_index ?? 0} onChange={(e) => set('order_index', Number(e.target.value))} /></Field>
        </div>
      </>)}
      {tab === 'streams' && (<>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Grade" required><Select value={form.grade_id || ''} onChange={(e) => set('grade_id', Number(e.target.value))}><option value="">— Select —</option>{filteredGrades.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select></Field>
          <Field label="Academic year" required><Select value={form.academic_year_id || ''} onChange={(e) => set('academic_year_id', Number(e.target.value))}><option value="">— Select —</option>{years.map((y: any) => <option key={y.id} value={y.id}>{y.name}</option>)}</Select></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Stream name" required><Input value={form.name || ''} onChange={(e) => set('name', e.target.value)} placeholder="e.g. East, 7 Green" /></Field>
          <Field label="Capacity"><Input type="number" value={form.capacity || ''} onChange={(e) => set('capacity', e.target.value ? Number(e.target.value) : null)} /></Field>
        </div>
        <Field label="Class teacher"><Select value={form.class_teacher_id || ''} onChange={(e) => set('class_teacher_id', e.target.value ? Number(e.target.value) : null)}><option value="">— None —</option>{teachers.map((t: any) => <option key={t.id} value={t.id}>{t.first_name} {t.last_name} ({t.staff_no})</option>)}</Select></Field>
      </>)}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" type="button" onClick={onCancel}>Cancel</Button>
        <Button type="submit" loading={saving}>{initial?.id ? 'Save changes' : 'Create'}</Button>
      </div>
    </form>
  );
}
