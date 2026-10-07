import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, X, Clock, CalendarX, Coffee } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { get, post } from '../lib/api';
import { Card, Button, Select, Field, Badge, Spinner, ErrorState, EmptyState, PageHeader, Tabs, useToast, Toast } from '../components/ui';
import { todayISO, formatDate, fullName } from '../lib/constants';

const STATUS_META: Record<string, { label: string; icon: any; active: string; idle: string }> = {
  Present: { label: 'P', icon: Check, active: 'bg-emerald-600 text-white border-emerald-600', idle: 'text-emerald-700 border-slate-200 hover:border-emerald-400' },
  Absent: { label: 'A', icon: X, active: 'bg-rose-600 text-white border-rose-600', idle: 'text-rose-700 border-slate-200 hover:border-rose-400' },
  Late: { label: 'L', icon: Clock, active: 'bg-amber-500 text-white border-amber-500', idle: 'text-amber-700 border-slate-200 hover:border-amber-400' },
  Excused: { label: 'E', icon: CalendarX, active: 'bg-sky-600 text-white border-sky-600', idle: 'text-sky-700 border-slate-200 hover:border-sky-400' },
  'Half-day': { label: 'H', icon: Coffee, active: 'bg-violet-600 text-white border-violet-600', idle: 'text-violet-700 border-slate-200 hover:border-violet-400' },
};

export default function Attendance() {
  const { can } = useAuth();
  const [params] = useSearchParams();
  const canMark = can('attendance.mark', 'attendance.manage');
  const [streams, setStreams] = useState<any[]>([]);
  const [terms, setTerms] = useState<any[]>([]);
  const [streamId, setStreamId] = useState(params.get('stream_id') || '');
  const [date, setDate] = useState(todayISO());
  const [termId, setTermId] = useState('');
  const [learners, setLearners] = useState<any[]>([]);
  const [marks, setMarks] = useState<Record<number, { status: string; remarks: string }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [summary, setSummary] = useState<any[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [view, setView] = useState('register');
  const { showSuccess, showError, toast } = useToast();

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [s, t] = await Promise.all([get('/api/academic?resource=streams'), get('/api/academic?resource=terms')]);
        setStreams(s); setTerms(t);
        const cur = t.find((x: any) => x.is_current); if (cur) setTermId(String(cur.id));
      } catch (e: any) { setError(e.message); } finally { setLoading(false); }
    })();
  }, []);

  const loadRegister = async () => {
    if (!streamId || !date) return;
    setLoading(true); setError('');
    try {
      const [ls, recs] = await Promise.all([
        get(`/api/learners?stream_id=${streamId}&status=Active&limit=500`),
        get(`/api/attendance?stream_id=${streamId}&date=${date}`),
      ]);
      setLearners(ls);
      const m: Record<number, { status: string; remarks: string }> = {};
      ls.forEach((l: any) => { m[l.id] = { status: 'Present', remarks: '' }; });
      (recs || []).forEach((r: any) => { m[r.learner_id] = { status: r.status, remarks: r.remarks || '' }; });
      setMarks(m);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  useEffect(() => { if (streamId && date) loadRegister(); // eslint-disable-next-line
  }, [streamId, date]);

  const loadSummary = async () => {
    if (!streamId || !month) return;
    setSummaryLoading(true);
    try { setSummary(await get(`/api/attendance?summary=1&stream_id=${streamId}&month=${month}`)); }
    catch (e: any) { showError(e.message); } finally { setSummaryLoading(false); }
  };
  useEffect(() => { if (view === 'summary') loadSummary(); // eslint-disable-next-line
  }, [view, streamId, month]);

  const markAll = (status: string) => {
    const m = { ...marks };
    Object.keys(m).forEach((k) => { m[Number(k)] = { ...m[Number(k)], status }; });
    setMarks(m);
  };

  const save = async () => {
    if (!streamId || !date) return;
    setSaving(true);
    try {
      const records = Object.entries(marks).map(([learner_id, v]) => ({ learner_id: Number(learner_id), status: v.status, remarks: v.remarks || null }));
      const res = await post('/api/attendance', { stream_id: Number(streamId), date, term_id: termId ? Number(termId) : null, records });
      showSuccess(`Attendance saved for ${res.saved} learner(s)`);
    } catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };

  const counts = Object.values(marks).reduce((acc: any, v: any) => { acc[v.status] = (acc[v.status] || 0) + 1; return acc; }, {});
  const streamName = streams.find((s) => String(s.id) === String(streamId));

  if (loading && !streams.length) return <Spinner />;
  if (error && !streams.length) return <ErrorState message={error} />;

  return (
    <div>
      <Toast toast={toast} />
      <PageHeader title="Attendance" subtitle="Daily registers and monthly summaries" />
      <Tabs tabs={[{ key: 'register', label: 'Daily Register' }, { key: 'summary', label: 'Monthly Summary' }]} active={view} onChange={setView} />
      <Card className="mb-4 mt-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Stream / Class"><Select value={streamId} onChange={(e) => setStreamId(e.target.value)}><option value="">— Select —</option>{streams.map((s) => <option key={s.id} value={s.id}>{s.grade_code || s.grade_name} {s.name}</option>)}</Select></Field>
          {view === 'register' ? (<>
            <Field label="Date"><input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/30" /></Field>
            <Field label="Term"><Select value={termId} onChange={(e) => setTermId(e.target.value)}><option value="">— None —</option>{terms.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.academic_year_name})</option>)}</Select></Field>
            <div className="flex items-end gap-2">
              <Button variant="outline" size="sm" onClick={() => markAll('Present')}>All present</Button>
              <Button variant="outline" size="sm" onClick={() => markAll('Absent')}>All absent</Button>
            </div>
          </>) : (
            <Field label="Month"><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/30" /></Field>
          )}
        </div>
      </Card>

      {view === 'register' ? (
        !streamId ? <EmptyState title="Select a stream" subtitle="Choose a class to load its attendance register." /> : loading ? <Spinner /> : learners.length === 0 ? (
          <EmptyState title="No active learners" subtitle="This stream has no active learners enrolled." />
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-2">
              {Object.entries(STATUS_META).map(([k, m]) => (
                <Badge key={k} tone={k === 'Present' ? 'green' : k === 'Absent' ? 'red' : k === 'Late' ? 'amber' : k === 'Excused' ? 'blue' : 'purple'}>{k}: {counts[k] || 0}</Badge>
              ))}
              <span className="ml-auto text-sm text-slate-500">{streamName?.grade_code || ''} {streamName?.name} · {formatDate(date)} · {learners.length} learners</span>
            </div>
            <Card>
              <div className="divide-y divide-slate-100">
                {learners.map((l, idx) => {
                  const mk = marks[l.id] || { status: 'Present', remarks: '' };
                  return (
                    <div key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                      <span className="w-7 text-xs text-slate-400">{idx + 1}</span>
                      <div className="min-w-0 flex-1 basis-40">
                        <p className="truncate text-sm font-medium text-slate-800">{fullName(l)}</p>
                        <p className="font-mono text-xs text-slate-400">{l.admission_no}</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(STATUS_META).map(([status, meta]) => (
                          <button
                            key={status}
                            disabled={!canMark}
                            onClick={() => setMarks({ ...marks, [l.id]: { ...mk, status } })}
                            title={status}
                            className={`flex h-9 w-9 items-center justify-center rounded-lg border text-xs font-bold transition disabled:opacity-40 ${mk.status === status ? meta.active : `bg-white ${meta.idle}`}`}
                          >
                            {meta.label}
                          </button>
                        ))}
                      </div>
                      <input
                        value={mk.remarks}
                        disabled={!canMark}
                        onChange={(e) => setMarks({ ...marks, [l.id]: { ...mk, remarks: e.target.value } })}
                        placeholder="Remark..."
                        className="w-full min-w-0 flex-1 basis-32 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-emerald-500 sm:w-36 sm:flex-none"
                      />
                    </div>
                  );
                })}
              </div>
            </Card>
            {canMark && (
              <div className="sticky bottom-4 mt-4 flex justify-end">
                <Button size="lg" onClick={save} loading={saving} className="shadow-lg">Save attendance for {formatDate(date)}</Button>
              </div>
            )}
            {!canMark && <p className="mt-3 text-sm text-slate-500">You have view-only access to attendance.</p>}
          </>
        )
      ) : (
        !streamId ? <EmptyState title="Select a stream" subtitle="Choose a class to view its monthly summary." /> : summaryLoading ? <Spinner /> : summary.length === 0 ? (
          <EmptyState title="No records" subtitle={`No attendance records for ${month}.`} />
        ) : (
          <Card><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm">
            <thead><tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Learner</th><th className="px-4 py-3 text-center">Present</th><th className="px-4 py-3 text-center">Absent</th><th className="px-4 py-3 text-center">Late</th><th className="px-4 py-3 text-center">Excused</th><th className="px-4 py-3 text-center">Half</th><th className="px-4 py-3 text-center">Rate</th>
            </tr></thead>
            <tbody>
              {summary.map((r) => {
                const rate = r.total ? Math.round(((r.present + r.late) / r.total) * 100) : 0;
                return (
                  <tr key={r.learner_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-2.5"><p className="font-medium text-slate-800">{r.name}</p><p className="font-mono text-xs text-slate-400">{r.admission_no}</p></td>
                    <td className="px-4 py-2.5 text-center text-emerald-700">{r.present}</td>
                    <td className="px-4 py-2.5 text-center text-rose-700">{r.absent}</td>
                    <td className="px-4 py-2.5 text-center text-amber-700">{r.late}</td>
                    <td className="px-4 py-2.5 text-center text-sky-700">{r.excused}</td>
                    <td className="px-4 py-2.5 text-center text-violet-700">{r.half}</td>
                    <td className="px-4 py-2.5 text-center font-semibold">{rate}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div></Card>
        )
      )}
    </div>
  );
}
