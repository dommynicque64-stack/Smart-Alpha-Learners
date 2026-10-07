import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { get, post, put, del } from '../lib/api';
import { Card, Button, Input, Select, Field, Badge, Spinner, ErrorState, EmptyState, PageHeader, Modal, ConfirmDialog, Tabs, useToast, Toast } from '../components/ui';
import { DAY_NAMES, SCHOOL_DAYS } from '../lib/constants';

const PALETTE = ['bg-emerald-600', 'bg-sky-600', 'bg-violet-600', 'bg-amber-600', 'bg-rose-500', 'bg-teal-600', 'bg-indigo-600', 'bg-orange-500'];
function colorFor(id: number) { return PALETTE[id % PALETTE.length]; }

export default function Timetable() {
  const { can } = useAuth();
  const canManage = can('timetable.manage');
  const [streams, setStreams] = useState<any[]>([]);
  const [terms, setTerms] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [areas, setAreas] = useState<any[]>([]);
  const [slots, setSlots] = useState<any[]>([]);
  const [streamId, setStreamId] = useState('');
  const [termId, setTermId] = useState('');
  const [byTeacher, setByTeacher] = useState('');
  const [view, setView] = useState('stream');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);
  const [delLoading, setDelLoading] = useState(false);
  const { showSuccess, showError, toast } = useToast();

  useEffect(() => {
    (async () => {
      try {
        const [s, t, v] = await Promise.all([get('/api/academic?resource=streams'), get('/api/academic?resource=terms'), get('/api/curriculum?resource=versions')]);
        setStreams(s); setTerms(t);
        const cur = t.find((x: any) => x.is_current); if (cur) setTermId(String(cur.id));
        const active = v.find((x: any) => x.is_active);
        const [tc, la] = await Promise.all([
          get('/api/teachers?status=Active').catch(() => []),
          active ? get(`/api/curriculum?resource=learning-areas&curriculum_version_id=${active.id}`).catch(() => []) : Promise.resolve([]),
        ]);
        setTeachers(tc); setAreas(la);
      } catch (e: any) { setError(e.message); } finally { setLoading(false); }
    })();
  }, []);

  const loadSlots = async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (termId) params.set('term_id', termId);
      if (view === 'stream' && streamId) params.set('stream_id', streamId);
      if (view === 'teacher' && byTeacher) params.set('teacher_id', byTeacher);
      if ((view === 'stream' && !streamId) || (view === 'teacher' && !byTeacher)) { setSlots([]); setLoading(false); return; }
      setSlots(await get(`/api/timetable?${params.toString()}`));
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { if (termId) loadSlots(); // eslint-disable-next-line
  }, [streamId, termId, byTeacher, view]);

  const doDelete = async () => {
    setDelLoading(true);
    try { await del(`/api/timetable?id=${deleting.id}`); showSuccess('Lesson removed'); setDeleting(null); loadSlots(); }
    catch (e: any) { showError(e.message); } finally { setDelLoading(false); }
  };

  const byDay: Record<number, any[]> = {};
  slots.forEach((s) => { (byDay[s.day_of_week] = byDay[s.day_of_week] || []).push(s); });
  Object.values(byDay).forEach((arr) => arr.sort((a, b) => a.start_time.localeCompare(b.start_time)));

  return (
    <div>
      <Toast toast={toast} />
      <PageHeader title="Timetable" subtitle="Weekly schedules with automatic conflict detection" actions={canManage && view === 'stream' && streamId && <Button onClick={() => { setEditing(null); setShowForm(true); }}><Plus className="h-4 w-4" /> Add lesson</Button>} />
      <Tabs tabs={[{ key: 'stream', label: 'By Stream' }, { key: 'teacher', label: 'By Teacher' }]} active={view} onChange={setView} />
      <Card className="mb-4 mt-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Term"><Select value={termId} onChange={(e) => setTermId(e.target.value)}><option value="">— Select —</option>{terms.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.academic_year_name})</option>)}</Select></Field>
          {view === 'stream'
            ? <Field label="Stream / Class"><Select value={streamId} onChange={(e) => setStreamId(e.target.value)}><option value="">— Select —</option>{streams.map((s) => <option key={s.id} value={s.id}>{s.grade_code || s.grade_name} {s.name}</option>)}</Select></Field>
            : <Field label="Teacher"><Select value={byTeacher} onChange={(e) => setByTeacher(e.target.value)}><option value="">— Select —</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>)}</Select></Field>}
        </div>
      </Card>
      {loading ? <Spinner /> : error ? <ErrorState message={error} onRetry={loadSlots} />
        : (view === 'stream' && !streamId) || (view === 'teacher' && !byTeacher) ? <EmptyState title="Select to view" subtitle={view === 'stream' ? 'Choose a stream to view its weekly timetable.' : 'Choose a teacher to view their teaching load.'} />
        : slots.length === 0 ? <EmptyState title="No lessons scheduled" subtitle="Add lessons to build the weekly timetable." action={canManage && view === 'stream' ? <Button onClick={() => { setEditing(null); setShowForm(true); }}><Plus className="h-4 w-4" /> Add lesson</Button> : undefined} />
        : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            {SCHOOL_DAYS.map((d) => (
              <Card key={d}>
                <div className="border-b border-slate-100 px-4 py-2.5"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{DAY_NAMES[d]}</p></div>
                <div className="space-y-2 p-3">
                  {(byDay[d] || []).map((s) => (
                    <div key={s.id} className="group rounded-xl border border-slate-100 bg-slate-50 p-2.5">
                      <div className="flex items-center gap-2">
                        <span className={`h-8 w-1.5 shrink-0 rounded-full ${colorFor(s.learning_area_id)}`} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-slate-900">{s.learning_area_name}</p>
                          <p className="text-[11px] text-slate-500">{s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}{s.room ? ` · ${s.room}` : ''}</p>
                          <p className="truncate text-[11px] text-slate-500">{view === 'stream' ? s.teacher_name : `${s.stream_name}`}</p>
                        </div>
                      </div>
                      {canManage && (
                        <div className="mt-1.5 hidden justify-end gap-1 group-hover:flex">
                          <button onClick={() => { setEditing(s); setShowForm(true); }} className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"><Pencil className="h-3.5 w-3.5" /></button>
                          <button onClick={() => setDeleting(s)} className="rounded p-1 text-slate-400 hover:bg-rose-100 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      )}
                    </div>
                  ))}
                  {!(byDay[d] || []).length && <p className="px-1 py-2 text-xs text-slate-400">Free day</p>}
                </div>
              </Card>
            ))}
          </div>
        )}
      {showForm && <SlotForm initial={editing} streams={streams} teachers={teachers} areas={areas} terms={terms} defaultStream={streamId} defaultTerm={termId} onSaved={() => { setShowForm(false); loadSlots(); }} onClose={() => setShowForm(false)} />}
      {deleting && <ConfirmDialog title="Remove lesson" message="Remove this lesson from the timetable?" onConfirm={doDelete} onCancel={() => setDeleting(null)} loading={delLoading} />}
    </div>
  );
}

function SlotForm({ initial, streams, teachers, areas, terms, defaultStream, defaultTerm, onSaved, onClose }: any) {
  const [form, setForm] = useState({
    stream_id: initial?.stream_id || defaultStream || '', term_id: initial?.term_id || defaultTerm || '',
    day_of_week: initial?.day_of_week ?? 1, start_time: initial?.start_time?.slice(0, 5) || '08:00', end_time: initial?.end_time?.slice(0, 5) || '08:40',
    learning_area_id: initial?.learning_area_id || '', teacher_id: initial?.teacher_id || '', room: initial?.room || '',
  });
  const [saving, setSaving] = useState(false);
  const [streamQ, setStreamQ] = useState('');
  const { showError, showSuccess, toast } = useToast();
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const filteredStreams = streams.filter((s: any) => !streamQ.trim() || `${s.grade_name} ${s.name}`.toLowerCase().includes(streamQ.toLowerCase()));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.stream_id || !form.term_id || !form.learning_area_id || !form.teacher_id) { showError('Stream, term, learning area and teacher are required'); return; }
    if (form.start_time >= form.end_time) { showError('End time must be after start time'); return; }
    setSaving(true);
    try {
      const payload = { stream_id: Number(form.stream_id), term_id: Number(form.term_id), day_of_week: Number(form.day_of_week), start_time: form.start_time, end_time: form.end_time, learning_area_id: Number(form.learning_area_id), teacher_id: Number(form.teacher_id), room: form.room || null };
      if (initial?.id) await put('/api/timetable', { ...payload, id: initial.id });
      else await post('/api/timetable', payload);
      showSuccess('Lesson saved'); setTimeout(onSaved, 400);
    } catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };
  return (
    <Modal title={initial ? 'Edit lesson' : 'Add lesson'} onClose={onClose}>
      <Toast toast={toast} />
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Term" required><Select value={form.term_id} onChange={(e) => set('term_id', e.target.value)}><option value="">— Select —</option>{terms.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
          <Field label="Day" required><Select value={form.day_of_week} onChange={(e) => set('day_of_week', e.target.value)}>{SCHOOL_DAYS.map((d) => <option key={d} value={d}>{DAY_NAMES[d]}</option>)}<option value={6}>Saturday</option><option value={0}>Sunday</option></Select></Field>
        </div>
        <Field label="Search stream"><Input placeholder="Filter streams..." value={streamQ} onChange={(e) => setStreamQ(e.target.value)} /></Field>
        <Field label="Stream" required><Select value={form.stream_id} onChange={(e) => set('stream_id', e.target.value)}><option value="">— Select —</option>{filteredStreams.map((s: any) => <option key={s.id} value={s.id}>{s.grade_code || s.grade_name} {s.name}</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Start" required><Input type="time" value={form.start_time} onChange={(e) => set('start_time', e.target.value)} /></Field>
          <Field label="End" required><Input type="time" value={form.end_time} onChange={(e) => set('end_time', e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Learning area" required><Select value={form.learning_area_id} onChange={(e) => set('learning_area_id', e.target.value)}><option value="">— Select —</option>{areas.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
          <Field label="Teacher" required><Select value={form.teacher_id} onChange={(e) => set('teacher_id', e.target.value)}><option value="">— Select —</option>{teachers.map((t: any) => <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>)}</Select></Field>
        </div>
        <Field label="Room"><Input value={form.room} onChange={(e) => set('room', e.target.value)} placeholder="Optional" /></Field>
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Save lesson</Button></div>
      </form>
    </Modal>
  );
}
