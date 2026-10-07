import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, MapPin, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { get, post, put, del } from '../lib/api';
import { Card, Button, Input, Select, Field, Badge, Spinner, ErrorState, EmptyState, PageHeader, Modal, ConfirmDialog, Textarea, useToast, Toast } from '../components/ui';
import { formatDate, todayISO } from '../lib/constants';

const EVENT_TYPES = ['Term Dates', 'Exams', 'Assessments', 'Parent Meeting', 'Holiday', 'Sports', 'General', 'Other'];
const AUDIENCES = ['All', 'Parents', 'Teachers', 'Learners', 'Staff'];
const TYPE_COLORS: Record<string, string> = {
  'Term Dates': 'bg-emerald-600', Exams: 'bg-rose-600', Assessments: 'bg-amber-500', 'Parent Meeting': 'bg-sky-600', Holiday: 'bg-violet-500', Sports: 'bg-orange-500', General: 'bg-slate-500', Other: 'bg-teal-600',
};

function monthRange(y: number, m: number) {
  const from = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const last = new Date(y, m + 1, 0).getDate();
  const to = `${y}-${String(m + 1).padStart(2, '0')}-${last}`;
  return { from, to };
}

export default function Calendar() {
  const { can } = useAuth();
  const canManage = can('events.manage');
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fType, setFType] = useState('');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [prefillDate, setPrefillDate] = useState('');
  const [deleting, setDeleting] = useState<any>(null);
  const [delLoading, setDelLoading] = useState(false);
  const { showSuccess, showError, toast } = useToast();

  const load = async () => {
    setLoading(true); setError('');
    try {
      const { from, to } = monthRange(year, month);
      setEvents(await get(`/api/communication?resource=calendar&from=${from}&to=${to}`));
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); // eslint-disable-next-line
  }, [year, month]);

  const move = (dir: number) => {
    const d = new Date(year, month + dir, 1);
    setYear(d.getFullYear()); setMonth(d.getMonth()); setSelectedDay(null);
  };

  const doDelete = async () => {
    setDelLoading(true);
    try { await del(`/api/communication?resource=events&id=${deleting.id}`); showSuccess('Event deleted'); setDeleting(null); load(); }
    catch (e: any) { showError(e.message); } finally { setDelLoading(false); }
  };

  const filtered = events.filter((e) => !fType || e.event_type === fType);
  const byDay: Record<string, any[]> = {};
  filtered.forEach((e) => { (byDay[e.start_date] = byDay[e.start_date] || []).push(e); });
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const monthName = new Date(year, month, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' });
  const dayEvents = selectedDay ? (byDay[selectedDay] || []) : [];
  const upcoming = [...filtered].filter((e) => e.start_date >= todayISO()).slice(0, 6);

  const openCreate = (dayISO?: string) => { setEditing(null); setPrefillDate(dayISO || ''); setShowForm(true); };

  return (
    <div>
      <Toast toast={toast} />
      <PageHeader title="School Calendar" subtitle="Terms, exams, meetings and school events" actions={canManage && <Button onClick={() => openCreate()}><Plus className="h-4 w-4" /> New event</Button>} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => move(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <p className="min-w-40 text-center font-bold text-slate-900">{monthName}</p>
          <Button size="sm" variant="outline" onClick={() => move(1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <div className="w-52"><Select value={fType} onChange={(e) => setFType(e.target.value)}><option value="">All event types</option>{EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</Select></div>
      </div>
      {loading ? <Spinner /> : error ? <ErrorState message={error} onRetry={load} /> : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card className="p-3 sm:p-4 xl:col-span-2">
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold uppercase text-slate-400">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((day, i) => {
                if (!day) return <div key={i} />;
                const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const list = byDay[iso] || [];
                const isToday = iso === todayISO();
                return (
                  <button key={i} onClick={() => setSelectedDay(iso)} className={`min-h-16 rounded-xl border p-1.5 text-left transition sm:min-h-20 ${selectedDay === iso ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-slate-100 hover:border-slate-300'} ${isToday ? 'bg-emerald-50/60' : 'bg-white'}`}>
                    <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${isToday ? 'bg-emerald-700 text-white' : 'text-slate-600'}`}>{day}</span>
                    <div className="mt-1 hidden space-y-0.5 sm:block">
                      {list.slice(0, 2).map((e) => (
                        <p key={e.id} className="truncate rounded px-1 py-0.5 text-[10px] font-medium text-white" style={{ background: `var(--tw-color)` }} title={e.title}>
                          <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${TYPE_COLORS[e.event_type] || 'bg-slate-500'}`} />{e.title}
                        </p>
                      ))}
                      {list.length > 2 && <p className="text-[10px] text-slate-400">+{list.length - 2} more</p>}
                    </div>
                    {list.length > 0 && <div className="mt-0.5 flex gap-0.5 sm:hidden">{list.slice(0, 3).map((e) => <span key={e.id} className={`h-1.5 w-1.5 rounded-full ${TYPE_COLORS[e.event_type] || 'bg-slate-500'}`} />)}</div>}
                  </button>
                );
              })}
            </div>
          </Card>
          <div className="space-y-4">
            <Card>
              <div className="border-b border-slate-100 px-5 py-3">
                <p className="text-sm font-bold">{selectedDay ? formatDate(selectedDay) : 'Upcoming'}</p>
              </div>
              <div className="space-y-2 p-4">
                {(selectedDay ? dayEvents : upcoming).map((e) => (
                  <div key={e.id} className="rounded-xl bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${TYPE_COLORS[e.event_type] || 'bg-slate-500'}`} />
                        <p className="text-sm font-bold">{e.title}</p>
                      </div>
                      {canManage && <div className="flex shrink-0 gap-0.5">
                        <button onClick={() => { setEditing(e); setPrefillDate(''); setShowForm(true); }} className="rounded p-1 text-slate-400 hover:bg-slate-200"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setDeleting(e)} className="rounded p-1 text-slate-400 hover:bg-rose-100 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{e.event_type} · {formatDate(e.start_date)}{e.end_date && e.end_date !== e.start_date ? ` → ${formatDate(e.end_date)}` : ''}{e.start_time ? ` · ${e.start_time.slice(0, 5)}` : ''}</p>
                    {e.location && <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3 w-3" />{e.location}</p>}
                    {e.description && <p className="mt-1 text-xs text-slate-600">{e.description}</p>}
                    <div className="mt-1.5 flex gap-1.5"><Badge tone="slate">{e.audience}</Badge>{e.organizer && <span className="text-[11px] text-slate-400">by {e.organizer}</span>}</div>
                  </div>
                ))}
                {(selectedDay ? dayEvents : upcoming).length === 0 && (
                  <EmptyState title={selectedDay ? 'No events this day' : 'Nothing upcoming'} action={canManage && selectedDay ? <Button size="sm" onClick={() => openCreate(selectedDay)}><Plus className="h-4 w-4" /> Add event</Button> : undefined} />
                )}
              </div>
            </Card>
            <Card className="p-4">
              <p className="mb-2 text-xs font-bold uppercase text-slate-400">Legend</p>
              <div className="flex flex-wrap gap-2">{EVENT_TYPES.map((t) => <span key={t} className="flex items-center gap-1.5 text-xs text-slate-600"><span className={`h-2.5 w-2.5 rounded-full ${TYPE_COLORS[t]}`} />{t}</span>)}</div>
            </Card>
          </div>
        </div>
      )}
      {showForm && <EventForm initial={editing} prefillDate={prefillDate} onSaved={() => { setShowForm(false); load(); }} onClose={() => setShowForm(false)} />}
      {deleting && <ConfirmDialog title="Delete event" message={`Delete "${deleting.title}"?`} onConfirm={doDelete} onCancel={() => setDeleting(null)} loading={delLoading} />}
    </div>
  );
}

function EventForm({ initial, prefillDate, onSaved, onClose }: any) {
  const [form, setForm] = useState({
    title: initial?.title || '', description: initial?.description || '', event_type: initial?.event_type || 'General',
    start_date: initial?.start_date || prefillDate || todayISO(), end_date: initial?.end_date || prefillDate || todayISO(),
    start_time: initial?.start_time?.slice(0, 5) || '', end_time: initial?.end_time?.slice(0, 5) || '',
    location: initial?.location || '', audience: initial?.audience || 'All', organizer: initial?.organizer || '', notify_audience: false,
  });
  const [saving, setSaving] = useState(false);
  const { showError, showSuccess, toast } = useToast();
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.start_date) { showError('Title and start date are required'); return; }
    setSaving(true);
    try {
      const payload = { ...form, start_time: form.start_time || null, end_time: form.end_time || null };
      if (initial?.id) await put('/api/communication?resource=events', { ...payload, id: initial.id });
      else await post('/api/communication?resource=events', payload);
      showSuccess('Event saved'); setTimeout(onSaved, 400);
    } catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };
  return (
    <Modal title={initial ? 'Edit event' : 'New event'} onClose={onClose}>
      <Toast toast={toast} />
      <form onSubmit={submit} className="space-y-4">
        <Field label="Title" required><Input value={form.title} onChange={(e) => set('title', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Type"><Select value={form.event_type} onChange={(e) => set('event_type', e.target.value)}>{EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</Select></Field>
          <Field label="Audience"><Select value={form.audience} onChange={(e) => set('audience', e.target.value)}>{AUDIENCES.map((a) => <option key={a} value={a}>{a}</option>)}</Select></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Start date" required><Input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} /></Field>
          <Field label="End date"><Input type="date" value={form.end_date} onChange={(e) => set('end_date', e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Start time"><Input type="time" value={form.start_time} onChange={(e) => set('start_time', e.target.value)} /></Field>
          <Field label="End time"><Input type="time" value={form.end_time} onChange={(e) => set('end_time', e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Location"><Input value={form.location} onChange={(e) => set('location', e.target.value)} /></Field>
          <Field label="Organizer"><Input value={form.organizer} onChange={(e) => set('organizer', e.target.value)} /></Field>
        </div>
        <Field label="Description"><Textarea rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
        {!initial && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.notify_audience} onChange={(e) => set('notify_audience', e.target.checked)} className="h-4 w-4 accent-emerald-700" /> Notify audience (in-app notification)</label>}
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Save event</Button></div>
      </form>
    </Modal>
  );
}
