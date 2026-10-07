import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, CheckCircle2, Star } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { get, post, put, del } from '../lib/api';
import { Card, Button, Input, Select, Field, Badge, Spinner, ErrorState, EmptyState, PageHeader, Modal, ConfirmDialog, Tabs, Textarea, useToast, Toast } from '../components/ui';
import { CBC_RATINGS, RATING_COLORS, formatDate, todayISO } from '../lib/constants';

const TABS = [
  { key: 'versions', label: 'Versions' },
  { key: 'areas', label: 'Learning Areas' },
  { key: 'competencies', label: 'Competencies' },
  { key: 'values', label: 'Values' },
  { key: 'pcis', label: 'PCIs' },
  { key: 'records', label: 'Competency Records' },
  { key: 'observations', label: 'Observations' },
];

export default function Curriculum() {
  const { can } = useAuth();
  const [params] = useSearchParams();
  const canManage = can('curriculum.manage');
  const canRecord = canManage || can('observations.manage');
  const [tab, setTab] = useState(params.get('tab') || 'versions');
  const [versions, setVersions] = useState<any[]>([]);
  const [activeVersion, setActiveVersion] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { toast } = useToast();

  const loadVersions = async () => {
    setLoading(true); setError('');
    try {
      const v = await get('/api/curriculum?resource=versions');
      setVersions(v);
      setActiveVersion(v.find((x: any) => x.is_active) || v[0] || null);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { loadVersions(); // eslint-disable-next-line
  }, []);

  if (loading) return <Spinner label="Loading curriculum..." />;
  if (error) return <ErrorState message={error} onRetry={loadVersions} />;

  return (
    <div>
      <Toast toast={toast} />
      <PageHeader
        title="CBC Curriculum Engine"
        subtitle={activeVersion ? `Active version: ${activeVersion.name} (${activeVersion.code})` : 'No curriculum version configured yet'}
        actions={canManage && <VersionSelector versions={versions} active={activeVersion} onChanged={loadVersions} />}
      />
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      <div className="mt-4">
        {tab === 'versions' && <VersionsTab versions={versions} canManage={canManage} onChanged={loadVersions} />}
        {tab === 'areas' && <AreasTab version={activeVersion} canManage={canManage} />}
        {tab === 'competencies' && <SimpleConfigTab resource="competencies" version={activeVersion} title="Core Competencies" subtitle="Assessed independently of academic marks" canManage={canManage} />}
        {tab === 'values' && <SimpleConfigTab resource="values" version={activeVersion} title="Core Values" subtitle="Linked to learning activities & observations" canManage={canManage} />}
        {tab === 'pcis' && <SimpleConfigTab resource="pcis" version={activeVersion} title="Pertinent & Contemporary Issues" subtitle="Cross-cutting PCI categories" canManage={canManage} />}
        {tab === 'records' && <RecordsTab canRecord={canRecord} />}
        {tab === 'observations' && <ObservationsTab canRecord={canRecord} />}
      </div>
    </div>
  );
}

function VersionSelector({ versions, active, onChanged }: any) {
  const { showSuccess, showError } = useToast();
  if (!versions.length) return null;
  return (
    <select
      value={active?.id || ''}
      onChange={async (e) => {
        const id = e.target.value;
        if (!id || Number(id) === active?.id) return;
        if (!confirm('Activate this curriculum version? The current version will be archived.')) { e.target.value = String(active?.id); return; }
        try { await post('/api/curriculum?resource=versions', { action: 'activate', id: Number(id) }); showSuccess('Version activated'); onChanged(); }
        catch (err: any) { showError(err.message); }
      }}
      className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium outline-none focus:border-emerald-600"
    >
      {versions.map((v: any) => <option key={v.id} value={v.id}>{v.name}{v.is_active ? ' (active)' : ''}</option>)}
    </select>
  );
}

function VersionsTab({ versions, canManage, onChanged }: any) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);
  const [delLoading, setDelLoading] = useState(false);
  const { showSuccess, showError, toast } = useToast();
  const doDelete = async () => {
    setDelLoading(true);
    try { await del(`/api/curriculum?resource=versions&id=${deleting.id}`); showSuccess('Version deleted'); setDeleting(null); onChanged(); }
    catch (e: any) { showError(e.message); } finally { setDelLoading(false); }
  };
  return (
    <div>
      <Toast toast={toast} />
      {canManage && <div className="mb-4"><Button onClick={() => { setEditing(null); setShowForm(true); }}><Plus className="h-4 w-4" /> New version</Button></div>}
      {!versions.length ? <EmptyState title="No curriculum versions" subtitle="Create a version (e.g. CBC 2024, CBE 2026) to start configuring learning areas. Versions are never hard-coded — activate a new one any time." /> : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {versions.map((v: any) => (
            <Card key={v.id} className={`p-5 ${v.is_active ? 'ring-2 ring-emerald-500' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-slate-900">{v.name}</p>
                  <p className="font-mono text-xs text-slate-500">{v.code}</p>
                </div>
                {v.is_active ? <Badge tone="green"><CheckCircle2 className="mr-1 h-3 w-3" />Active</Badge> : <Badge tone="slate">{v.status}</Badge>}
              </div>
              {v.description && <p className="mt-2 text-sm text-slate-600">{v.description}</p>}
              <p className="mt-2 text-xs text-slate-500">Effective: {v.effective_from || '—'} → {v.effective_to || '—'}</p>
              {canManage && (
                <div className="mt-4 flex gap-2">
                  {!v.is_active && <Button size="sm" variant="outline" onClick={async () => { if (!confirm('Activate this version?')) return; try { await post('/api/curriculum?resource=versions', { action: 'activate', id: v.id }); showSuccess('Activated'); onChanged(); } catch (e: any) { showError(e.message); } }}>Activate</Button>}
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(v); setShowForm(true); }}><Pencil className="h-4 w-4" /></Button>
                  {!v.is_active && <Button size="sm" variant="ghost" onClick={() => setDeleting(v)}><Trash2 className="h-4 w-4 text-rose-600" /></Button>}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      {showForm && <VersionForm initial={editing} onSaved={() => { setShowForm(false); onChanged(); }} onClose={() => setShowForm(false)} />}
      {deleting && <ConfirmDialog title="Delete version" message={`Delete ${deleting.name}? Only versions with no learning areas can be deleted.`} onConfirm={doDelete} onCancel={() => setDeleting(null)} loading={delLoading} />}
    </div>
  );
}

function VersionForm({ initial, onSaved, onClose }: any) {
  const [form, setForm] = useState({ name: initial?.name || '', code: initial?.code || '', description: initial?.description || '', effective_from: initial?.effective_from || '', effective_to: initial?.effective_to || '' });
  const [saving, setSaving] = useState(false);
  const { showError, showSuccess, toast } = useToast();
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.code.trim()) { showError('Name and code are required'); return; }
    setSaving(true);
    try {
      const payload = { ...form, effective_from: form.effective_from || null, effective_to: form.effective_to || null };
      if (initial?.id) await put('/api/curriculum?resource=versions', { ...payload, id: initial.id });
      else await post('/api/curriculum?resource=versions', { ...payload, status: 'Draft' });
      showSuccess('Version saved'); setTimeout(onSaved, 400);
    } catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };
  return (
    <Modal title={initial ? 'Edit version' : 'New curriculum version'} onClose={onClose}>
      <Toast toast={toast} />
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Name" required><Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. CBC 2024" /></Field>
          <Field label="Code" required><Input value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="e.g. CBC-2024" /></Field>
        </div>
        <Field label="Description"><Textarea rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Effective from"><Input type="date" value={form.effective_from} onChange={(e) => set('effective_from', e.target.value)} /></Field>
          <Field label="Effective to"><Input type="date" value={form.effective_to} onChange={(e) => set('effective_to', e.target.value)} /></Field>
        </div>
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Save</Button></div>
      </form>
    </Modal>
  );
}

function AreasTab({ version, canManage }: any) {
  const [areas, setAreas] = useState<any[]>([]);
  const [levels, setLevels] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fLevel, setFLevel] = useState('');
  const [fGrade, setFGrade] = useState('');
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [expandedStrand, setExpandedStrand] = useState<Record<number, boolean>>({});
  const [modal, setModal] = useState<{ type: 'area' | 'strand' | 'outcome'; initial?: any; parentId?: number } | null>(null);
  const [deleting, setDeleting] = useState<{ resource: string; row: any } | null>(null);
  const [delLoading, setDelLoading] = useState(false);
  const { showSuccess, showError, toast } = useToast();

  const load = async () => {
    if (!version) { setLoading(false); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({ resource: 'learning-areas', tree: '1', curriculum_version_id: String(version.id) });
      if (fLevel) params.set('level_id', fLevel);
      if (fGrade) params.set('grade_id', fGrade);
      const [a, l, g] = await Promise.all([
        get(`/api/curriculum?${params.toString()}`),
        levels.length ? Promise.resolve(levels) : get('/api/academic?resource=levels'),
        grades.length ? Promise.resolve(grades) : get('/api/academic?resource=grades'),
      ]);
      setAreas(a); setLevels(l); setGrades(g);
    } catch (e: any) { showError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); // eslint-disable-next-line
  }, [version?.id, fLevel, fGrade]);

  const doDelete = async () => {
    if (!deleting) return;
    setDelLoading(true);
    try { await del(`/api/curriculum?resource=${deleting.resource}&id=${deleting.row.id}`); showSuccess('Deleted'); setDeleting(null); load(); }
    catch (e: any) { showError(e.message); } finally { setDelLoading(false); }
  };

  if (!version) return <EmptyState title="No curriculum version" subtitle="Create and activate a version first." />;
  const levelName = (id: number) => levels.find((l) => l.id === id)?.name || 'All levels';
  const gradeName = (id: number) => grades.find((g) => g.id === id)?.name || 'All grades';

  return (
    <div>
      <Toast toast={toast} />
      <Card className="mb-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Filter by level"><Select value={fLevel} onChange={(e) => { setFLevel(e.target.value); setFGrade(''); }}><option value="">All levels</option>{levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></Field>
          <Field label="Filter by grade"><Select value={fGrade} onChange={(e) => setFGrade(e.target.value)}><option value="">All grades</option>{grades.filter((g) => !fLevel || String(g.level_id) === String(fLevel)).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select></Field>
          <div className="flex items-end">{canManage && <Button onClick={() => setModal({ type: 'area' })}><Plus className="h-4 w-4" /> Learning area</Button>}</div>
        </div>
      </Card>
      {loading ? <Spinner /> : areas.length === 0 ? <EmptyState title="No learning areas" subtitle={`No learning areas in ${version.name} for this filter.`} /> : (
        <div className="space-y-3">
          {areas.map((a) => (
            <Card key={a.id}>
              <div className="flex items-center gap-2 px-4 py-3">
                <button onClick={() => setExpanded({ ...expanded, [a.id]: !expanded[a.id] })} className="rounded-lg p-1 hover:bg-slate-100">
                  {expanded[a.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900">{a.name} {a.code && <span className="font-mono text-xs font-normal text-slate-400">· {a.code}</span>}</p>
                  <p className="text-xs text-slate-500">{a.level_id ? levelName(a.level_id) : 'All levels'} · {a.grade_id ? gradeName(a.grade_id) : 'All grades'} · {(a.strands || []).length} strand(s){a.is_compulsory === false ? ' · Optional' : ''}</p>
                </div>
                {canManage && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setModal({ type: 'strand', parentId: a.id })} title="Add strand"><Plus className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setModal({ type: 'area', initial: a })}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleting({ resource: 'learning-areas', row: a })}><Trash2 className="h-4 w-4 text-rose-600" /></Button>
                  </div>
                )}
              </div>
              {expanded[a.id] && (
                <div className="space-y-2 border-t border-slate-100 px-4 py-3 pl-10">
                  {(a.strands || []).map((s: any) => (
                    <div key={s.id} className="rounded-xl bg-slate-50 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setExpandedStrand({ ...expandedStrand, [s.id]: !expandedStrand[s.id] })} className="rounded p-0.5 hover:bg-slate-200">
                          {expandedStrand[s.id] ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </button>
                        <p className="flex-1 text-sm font-semibold text-slate-800">{s.name} <span className="text-xs font-normal text-slate-400">· {(s.outcomes || []).length} outcome(s){s.term ? ` · ${s.term}` : ''}</span></p>
                        {canManage && (
                          <div className="flex gap-0.5">
                            <button onClick={() => setModal({ type: 'outcome', parentId: s.id })} className="rounded p-1 text-slate-500 hover:bg-slate-200" title="Add outcome"><Plus className="h-3.5 w-3.5" /></button>
                            <button onClick={() => setModal({ type: 'strand', initial: s })} className="rounded p-1 text-slate-500 hover:bg-slate-200"><Pencil className="h-3.5 w-3.5" /></button>
                            <button onClick={() => setDeleting({ resource: 'strands', row: s })} className="rounded p-1 text-slate-500 hover:bg-rose-100 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        )}
                      </div>
                      {expandedStrand[s.id] && (
                        <ul className="mt-2 space-y-1.5 pl-6">
                          {(s.outcomes || []).map((o: any) => (
                            <li key={o.id} className="group flex items-start justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
                              <span><span className="font-semibold">{o.code ? `${o.code} — ` : ''}</span>{o.title}{o.description ? <span className="block text-xs text-slate-500">{o.description}</span> : null}</span>
                              {canManage && (
                                <span className="flex shrink-0 gap-0.5 opacity-0 transition group-hover:opacity-100">
                                  <button onClick={() => setModal({ type: 'outcome', initial: o })} className="rounded p-1 hover:bg-slate-100"><Pencil className="h-3.5 w-3.5" /></button>
                                  <button onClick={() => setDeleting({ resource: 'outcomes', row: o })} className="rounded p-1 hover:bg-rose-100 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                                </span>
                              )}
                            </li>
                          ))}
                          {!(s.outcomes || []).length && <p className="py-1 text-xs text-slate-400">No specific outcomes yet.</p>}
                        </ul>
                      )}
                    </div>
                  ))}
                  {!(a.strands || []).length && <p className="text-sm text-slate-400">No strands yet. {canManage ? 'Add the first strand.' : ''}</p>}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      {modal?.type === 'area' && <AreaForm version={version} levels={levels} grades={grades} initial={modal.initial} onSaved={() => { setModal(null); load(); }} onClose={() => setModal(null)} />}
      {modal?.type === 'strand' && <StrandForm learningAreaId={modal.parentId || modal.initial?.learning_area_id} initial={modal.initial} grades={grades} onSaved={() => { setModal(null); load(); }} onClose={() => setModal(null)} />}
      {modal?.type === 'outcome' && <OutcomeForm strandId={modal.parentId || modal.initial?.strand_id} initial={modal.initial} onSaved={() => { setModal(null); load(); }} onClose={() => setModal(null)} />}
      {deleting && <ConfirmDialog title="Delete" message={`Delete "${deleting.row.name || deleting.row.title}"? Items with children cannot be deleted.`} onConfirm={doDelete} onCancel={() => setDeleting(null)} loading={delLoading} />}
    </div>
  );
}

function AreaForm({ version, levels, grades, initial, onSaved, onClose }: any) {
  const [form, setForm] = useState({ name: initial?.name || '', code: initial?.code || '', level_id: initial?.level_id || '', grade_id: initial?.grade_id || '', is_compulsory: initial?.is_compulsory !== false, description: initial?.description || '' });
  const [saving, setSaving] = useState(false);
  const { showError, showSuccess, toast } = useToast();
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { showError('Name is required'); return; }
    setSaving(true);
    try {
      const payload = { curriculum_version_id: version.id, name: form.name.trim(), code: form.code.trim() || null, level_id: form.level_id ? Number(form.level_id) : null, grade_id: form.grade_id ? Number(form.grade_id) : null, is_compulsory: form.is_compulsory, description: form.description || null };
      if (initial?.id) await put('/api/curriculum?resource=learning-areas', { ...payload, id: initial.id });
      else await post('/api/curriculum?resource=learning-areas', payload);
      showSuccess('Learning area saved'); setTimeout(onSaved, 400);
    } catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };
  return (
    <Modal title={initial ? 'Edit learning area' : 'New learning area'} subtitle={version.name} onClose={onClose}>
      <Toast toast={toast} />
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Name" required><Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Mathematics" /></Field>
          <Field label="Code"><Input value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="e.g. MAT" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Level (optional)"><Select value={form.level_id} onChange={(e) => set('level_id', e.target.value)}><option value="">All levels</option>{levels.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></Field>
          <Field label="Grade (optional)"><Select value={form.grade_id} onChange={(e) => set('grade_id', e.target.value)}><option value="">All grades</option>{grades.filter((g: any) => !form.level_id || String(g.level_id) === String(form.level_id)).map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select></Field>
        </div>
        <Field label="Description"><Textarea rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.is_compulsory} onChange={(e) => set('is_compulsory', e.target.checked)} className="h-4 w-4 accent-emerald-700" /> Compulsory learning area</label>
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Save</Button></div>
      </form>
    </Modal>
  );
}

function StrandForm({ learningAreaId, initial, grades, onSaved, onClose }: any) {
  const [form, setForm] = useState({ name: initial?.name || '', code: initial?.code || '', grade_id: initial?.grade_id || '', term: initial?.term || '', order_index: initial?.order_index ?? 0, description: initial?.description || '' });
  const [saving, setSaving] = useState(false);
  const { showError, showSuccess, toast } = useToast();
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { showError('Name is required'); return; }
    setSaving(true);
    try {
      const payload = { learning_area_id: learningAreaId, name: form.name.trim(), code: form.code.trim() || null, grade_id: form.grade_id ? Number(form.grade_id) : null, term: form.term || null, order_index: Number(form.order_index) || 0, description: form.description || null };
      if (initial?.id) await put('/api/curriculum?resource=strands', { ...payload, id: initial.id });
      else await post('/api/curriculum?resource=strands', payload);
      showSuccess('Strand saved'); setTimeout(onSaved, 400);
    } catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };
  return (
    <Modal title={initial ? 'Edit strand' : 'New strand'} onClose={onClose}>
      <Toast toast={toast} />
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Name" required><Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Numbers" /></Field>
          <Field label="Code"><Input value={form.code} onChange={(e) => set('code', e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Grade"><Select value={form.grade_id} onChange={(e) => set('grade_id', e.target.value)}><option value="">All</option>{grades.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select></Field>
          <Field label="Term"><Select value={form.term} onChange={(e) => set('term', e.target.value)}><option value="">All terms</option>{['Term 1', 'Term 2', 'Term 3'].map((t) => <option key={t} value={t}>{t}</option>)}</Select></Field>
          <Field label="Order"><Input type="number" value={form.order_index} onChange={(e) => set('order_index', e.target.value)} /></Field>
        </div>
        <Field label="Description"><Textarea rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Save</Button></div>
      </form>
    </Modal>
  );
}

function OutcomeForm({ strandId, initial, onSaved, onClose }: any) {
  const [form, setForm] = useState({ code: initial?.code || '', title: initial?.title || '', description: initial?.description || '', order_index: initial?.order_index ?? 0 });
  const [saving, setSaving] = useState(false);
  const { showError, showSuccess, toast } = useToast();
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { showError('Outcome title is required'); return; }
    setSaving(true);
    try {
      const payload = { strand_id: strandId, code: form.code.trim() || null, title: form.title.trim(), description: form.description || null, order_index: Number(form.order_index) || 0 };
      if (initial?.id) await put('/api/curriculum?resource=outcomes', { ...payload, id: initial.id });
      else await post('/api/curriculum?resource=outcomes', payload);
      showSuccess('Outcome saved'); setTimeout(onSaved, 400);
    } catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };
  return (
    <Modal title={initial ? 'Edit specific outcome' : 'New specific outcome'} onClose={onClose}>
      <Toast toast={toast} />
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <Field label="Code"><Input value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="e.g. 7.1.1" /></Field>
          <div className="col-span-2"><Field label="Outcome" required><Input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="By the end of the strand, the learner should be able to..." /></Field></div>
        </div>
        <Field label="Description"><Textarea rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <Field label="Order"><Input type="number" value={form.order_index} onChange={(e) => set('order_index', e.target.value)} /></Field>
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Save</Button></div>
      </form>
    </Modal>
  );
}

function SimpleConfigTab({ resource, version, title, subtitle, canManage }: any) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);
  const [delLoading, setDelLoading] = useState(false);
  const { showSuccess, showError, toast } = useToast();
  const load = async () => {
    if (!version) { setLoading(false); return; }
    setLoading(true);
    try { setRows(await get(`/api/curriculum?resource=${resource}&curriculum_version_id=${version.id}`)); }
    catch (e: any) { showError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); // eslint-disable-next-line
  }, [version?.id]);
  const doDelete = async () => {
    setDelLoading(true);
    try { await del(`/api/curriculum?resource=${resource}&id=${deleting.id}`); showSuccess('Deleted'); setDeleting(null); load(); }
    catch (e: any) { showError(e.message); } finally { setDelLoading(false); }
  };
  if (!version) return <EmptyState title="No curriculum version" subtitle="Create and activate a version first." />;
  return (
    <div>
      <Toast toast={toast} />
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">{subtitle} · scoped to <span className="font-semibold">{version.name}</span></p>
        {canManage && <Button onClick={() => { setEditing(null); setShowForm(true); }}><Plus className="h-4 w-4" /> Add</Button>}
      </div>
      {loading ? <Spinner /> : rows.length === 0 ? <EmptyState title={`No ${title.toLowerCase()} yet`} /> : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100"><Star className="h-4 w-4 text-emerald-700" /></div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{r.name} {r.code && <span className="font-mono text-xs font-normal text-slate-400">· {r.code}</span>}</p>
                    {r.description && <p className="mt-0.5 text-sm text-slate-600">{r.description}</p>}
                  </div>
                </div>
                {canManage && (
                  <div className="flex shrink-0 gap-0.5">
                    <button onClick={() => { setEditing(r); setShowForm(true); }} className="rounded p-1.5 text-slate-500 hover:bg-slate-100"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => setDeleting(r)} className="rounded p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      {showForm && <SimpleConfigForm resource={resource} version={version} title={title} initial={editing} onSaved={() => { setShowForm(false); load(); }} onClose={() => setShowForm(false)} />}
      {deleting && <ConfirmDialog title="Delete" message={`Delete "${deleting.name}"?`} onConfirm={doDelete} onCancel={() => setDeleting(null)} loading={delLoading} />}
    </div>
  );
}

function SimpleConfigForm({ resource, version, title, initial, onSaved, onClose }: any) {
  const [form, setForm] = useState({ name: initial?.name || '', code: initial?.code || '', description: initial?.description || '' });
  const [saving, setSaving] = useState(false);
  const { showError, showSuccess, toast } = useToast();
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { showError('Name is required'); return; }
    setSaving(true);
    try {
      const payload = { curriculum_version_id: version.id, name: form.name.trim(), code: form.code.trim() || null, description: form.description || null };
      if (initial?.id) await put(`/api/curriculum?resource=${resource}`, { ...payload, id: initial.id });
      else await post(`/api/curriculum?resource=${resource}`, payload);
      showSuccess('Saved'); setTimeout(onSaved, 400);
    } catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };
  return (
    <Modal title={`${initial ? 'Edit' : 'Add'} ${title.replace(/s$/, '').toLowerCase()}`} subtitle={version.name} onClose={onClose}>
      <Toast toast={toast} />
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Name" required><Input value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="Code"><Input value={form.code} onChange={(e) => set('code', e.target.value)} /></Field>
        </div>
        <Field label="Description"><Textarea rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Save</Button></div>
      </form>
    </Modal>
  );
}

function RecordsTab({ canRecord }: any) {
  const [records, setRecords] = useState<any[]>([]);
  const [competencies, setCompetencies] = useState<any[]>([]);
  const [terms, setTerms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [deleting, setDeleting] = useState<any>(null);
  const [delLoading, setDelLoading] = useState(false);
  const { showSuccess, showError, toast } = useToast();
  const load = async () => {
    setLoading(true);
    try {
      const [r, c, t, v] = await Promise.all([
        get('/api/curriculum?resource=competency-records'),
        get('/api/curriculum?resource=competencies'),
        get('/api/academic?resource=terms'),
        get('/api/curriculum?resource=versions'),
      ]);
      const active = v.find((x: any) => x.is_active);
      setRecords(r); setTerms(t);
      setCompetencies(active ? c.filter((x: any) => !x.curriculum_version_id || x.curriculum_version_id === active.id) : c);
    } catch (e: any) { showError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); // eslint-disable-next-line
  }, []);
  const [learnerMap, setLearnerMap] = useState<Record<number, string>>({});
  useEffect(() => {
    if (!records.length) return;
    const ids = [...new Set(records.map((r) => r.learner_id))].slice(0, 100);
    get(`/api/learners?limit=1000`).then((ls: any[]) => {
      const m: Record<number, string> = {};
      ls.filter((l) => ids.includes(l.id)).forEach((l) => { m[l.id] = `${l.first_name} ${l.last_name} (${l.admission_no})`; });
      setLearnerMap(m);
    }).catch(() => {});
  }, [records]);
  const doDelete = async () => {
    setDelLoading(true);
    try { await del(`/api/curriculum?resource=competency-records&id=${deleting.id}`); showSuccess('Deleted'); setDeleting(null); load(); }
    catch (e: any) { showError(e.message); } finally { setDelLoading(false); }
  };
  const compName = (id: number) => competencies.find((c) => c.id === id)?.name || `#${id}`;
  const termName = (id: number) => terms.find((t) => t.id === id)?.name || '';
  const filtered = records.filter((r) => !q.trim() || (learnerMap[r.learner_id] || '').toLowerCase().includes(q.toLowerCase()) || compName(r.competency_id).toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <Toast toast={toast} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-sm flex-1"><Input placeholder="Search learner or competency..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {canRecord && <Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> Record rating</Button>}
      </div>
      {loading ? <Spinner /> : filtered.length === 0 ? <EmptyState title="No competency records" subtitle="Rate learners against core competencies using the CBC scale (EE/ME/AE/BE)." /> : (
        <Card><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm">
          <thead><tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3">Learner</th><th className="px-4 py-3">Competency</th><th className="px-4 py-3">Term</th><th className="px-4 py-3">Rating</th><th className="px-4 py-3">Evidence</th>{canRecord && <th className="px-4 py-3 text-right">Actions</th>}
          </tr></thead>
          <tbody>
            {filtered.slice(0, 100).map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{learnerMap[r.learner_id] || `Learner #${r.learner_id}`}</td>
                <td className="px-4 py-3 text-slate-600">{compName(r.competency_id)}</td>
                <td className="px-4 py-3 text-slate-600">{termName(r.term_id)}</td>
                <td className="px-4 py-3"><span className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-bold text-white ${RATING_COLORS[r.rating] || 'bg-slate-500'}`}>{r.rating}</span></td>
                <td className="max-w-56 truncate px-4 py-3 text-slate-500">{r.evidence || '—'}</td>
                {canRecord && <td className="px-4 py-3 text-right"><button onClick={() => setDeleting(r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="h-4 w-4" /></button></td>}
              </tr>
            ))}
          </tbody>
        </table></div></Card>
      )}
      {showForm && <RecordForm competencies={competencies} terms={terms} onSaved={() => { setShowForm(false); load(); }} onClose={() => setShowForm(false)} />}
      {deleting && <ConfirmDialog title="Delete record" message="Delete this competency rating?" onConfirm={doDelete} onCancel={() => setDeleting(null)} loading={delLoading} />}
    </div>
  );
}

function useLearnerSearch() {
  const [learners, setLearners] = useState<any[]>([]);
  const [q, setQ] = useState('');
  useEffect(() => { get('/api/learners?status=Active&limit=500').then(setLearners).catch(() => {}); }, []);
  const filtered = learners.filter((l) => !q.trim() || `${l.first_name} ${l.last_name} ${l.admission_no}`.toLowerCase().includes(q.toLowerCase()));
  return { q, setQ, filtered };
}

function RecordForm({ competencies, terms, onSaved, onClose }: any) {
  const { q, setQ, filtered } = useLearnerSearch();
  const [learnerId, setLearnerId] = useState('');
  const [competencyId, setCompetencyId] = useState('');
  const [termId, setTermId] = useState(terms.find((t: any) => t.is_current)?.id || '');
  const [rating, setRating] = useState('ME2');
  const [evidence, setEvidence] = useState('');
  const [saving, setSaving] = useState(false);
  const { showError, showSuccess, toast } = useToast();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!learnerId || !competencyId || !termId) { showError('Learner, competency and term are required'); return; }
    setSaving(true);
    try {
      await post('/api/curriculum?resource=competency-records', { learner_id: Number(learnerId), competency_id: Number(competencyId), term_id: Number(termId), rating, evidence: evidence || null });
      showSuccess('Rating recorded'); setTimeout(onSaved, 400);
    } catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };
  return (
    <Modal title="Record competency rating" subtitle="CBC performance levels — independent of marks" onClose={onClose}>
      <Toast toast={toast} />
      <form onSubmit={submit} className="space-y-4">
        <Field label="Search learner"><Input placeholder="Name or admission no..." value={q} onChange={(e) => setQ(e.target.value)} /></Field>
        <Field label="Learner" required><Select value={learnerId} onChange={(e) => setLearnerId(e.target.value)}><option value="">— Select —</option>{filtered.slice(0, 80).map((l) => <option key={l.id} value={l.id}>{l.first_name} {l.last_name} · {l.admission_no}</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Competency" required><Select value={competencyId} onChange={(e) => setCompetencyId(e.target.value)}><option value="">— Select —</option>{competencies.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <Field label="Term" required><Select value={termId} onChange={(e) => setTermId(e.target.value)}>{terms.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
        </div>
        <Field label="Rating" required>
          <div className="grid grid-cols-4 gap-2">
            {CBC_RATINGS.map((r) => (
              <button type="button" key={r.code} onClick={() => setRating(r.code)} title={r.label} className={`rounded-xl border-2 px-2 py-2 text-sm font-bold transition ${rating === r.code ? `${RATING_COLORS[r.code]} border-transparent text-white` : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>{r.code}</button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">EE = Exceeding · ME = Meeting · AE = Approaching · BE = Below expectation</p>
        </Field>
        <Field label="Evidence / comment"><Textarea rows={2} value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="What did the learner do to demonstrate this?" /></Field>
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Save rating</Button></div>
      </form>
    </Modal>
  );
}

function ObservationsTab({ canRecord }: any) {
  const [rows, setRows] = useState<any[]>([]);
  const [values, setValues] = useState<any[]>([]);
  const [pcis, setPcis] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [deleting, setDeleting] = useState<any>(null);
  const [delLoading, setDelLoading] = useState(false);
  const [learnerMap, setLearnerMap] = useState<Record<number, string>>({});
  const { showSuccess, showError, toast } = useToast();
  const load = async () => {
    setLoading(true);
    try {
      const [o, v, p] = await Promise.all([
        get('/api/curriculum?resource=observations'),
        get('/api/curriculum?resource=values'),
        get('/api/curriculum?resource=pcis'),
      ]);
      setRows(o); setValues(v); setPcis(p);
    } catch (e: any) { showError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); // eslint-disable-next-line
  }, []);
  useEffect(() => {
    if (!rows.length) return;
    get('/api/learners?limit=1000').then((ls: any[]) => {
      const m: Record<number, string> = {};
      ls.forEach((l) => { m[l.id] = `${l.first_name} ${l.last_name} (${l.admission_no})`; });
      setLearnerMap(m);
    }).catch(() => {});
  }, [rows]);
  const doDelete = async () => {
    setDelLoading(true);
    try { await del(`/api/curriculum?resource=observations&id=${deleting.id}`); showSuccess('Deleted'); setDeleting(null); load(); }
    catch (e: any) { showError(e.message); } finally { setDelLoading(false); }
  };
  const valueName = (id: number) => values.find((v) => v.id === id)?.name;
  const pciName = (id: number) => pcis.find((v) => v.id === id)?.name;
  const filtered = rows.filter((r) => !q.trim() || (learnerMap[r.learner_id] || '').toLowerCase().includes(q.toLowerCase()) || (r.observation || '').toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <Toast toast={toast} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-sm flex-1"><Input placeholder="Search observations..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {canRecord && <Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> New observation</Button>}
      </div>
      {loading ? <Spinner /> : filtered.length === 0 ? <EmptyState title="No observations" subtitle="Record values-based observations and link PCIs to learning activities." /> : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filtered.slice(0, 60).map((o) => (
            <Card key={o.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-slate-900">{learnerMap[o.learner_id] || `Learner #${o.learner_id}`}</p>
                  <p className="text-xs text-slate-500">{formatDate(o.observation_date)}{o.activity ? ` · ${o.activity}` : ''}</p>
                </div>
                {canRecord && <button onClick={() => setDeleting(o)} className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>}
              </div>
              <p className="mt-2 text-sm text-slate-700">{o.observation}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {o.value_id && valueName(o.value_id) && <Badge tone="emerald">{valueName(o.value_id)}</Badge>}
                {o.pci_id && pciName(o.pci_id) && <Badge tone="blue">{pciName(o.pci_id)}</Badge>}
              </div>
            </Card>
          ))}
        </div>
      )}
      {showForm && <ObservationForm values={values} pcis={pcis} onSaved={() => { setShowForm(false); load(); }} onClose={() => setShowForm(false)} />}
      {deleting && <ConfirmDialog title="Delete observation" message="Delete this observation?" onConfirm={doDelete} onCancel={() => setDeleting(null)} loading={delLoading} />}
    </div>
  );
}

function ObservationForm({ values, pcis, onSaved, onClose }: any) {
  const { q, setQ, filtered } = useLearnerSearch();
  const [learnerId, setLearnerId] = useState('');
  const [valueId, setValueId] = useState('');
  const [pciId, setPciId] = useState('');
  const [activity, setActivity] = useState('');
  const [observation, setObservation] = useState('');
  const [date, setDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  const { showError, showSuccess, toast } = useToast();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!learnerId || !observation.trim()) { showError('Learner and observation are required'); return; }
    setSaving(true);
    try {
      await post('/api/curriculum?resource=observations', { learner_id: Number(learnerId), value_id: valueId ? Number(valueId) : null, pci_id: pciId ? Number(pciId) : null, activity: activity || null, observation: observation.trim(), observation_date: date });
      showSuccess('Observation saved'); setTimeout(onSaved, 400);
    } catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };
  return (
    <Modal title="New observation" subtitle="Values & PCI-linked learner observation" onClose={onClose}>
      <Toast toast={toast} />
      <form onSubmit={submit} className="space-y-4">
        <Field label="Search learner"><Input placeholder="Name or admission no..." value={q} onChange={(e) => setQ(e.target.value)} /></Field>
        <Field label="Learner" required><Select value={learnerId} onChange={(e) => setLearnerId(e.target.value)}><option value="">— Select —</option>{filtered.slice(0, 80).map((l) => <option key={l.id} value={l.id}>{l.first_name} {l.last_name} · {l.admission_no}</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Core value"><Select value={valueId} onChange={(e) => setValueId(e.target.value)}><option value="">— None —</option>{values.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field>
          <Field label="PCI"><Select value={pciId} onChange={(e) => setPciId(e.target.value)}><option value="">— None —</option>{pcis.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Activity"><Input value={activity} onChange={(e) => setActivity(e.target.value)} placeholder="e.g. Group discussion" /></Field>
          <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        <Field label="Observation" required><Textarea rows={3} value={observation} onChange={(e) => setObservation(e.target.value)} placeholder="What did you observe?" /></Field>
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Save observation</Button></div>
      </form>
    </Modal>
  );
}
