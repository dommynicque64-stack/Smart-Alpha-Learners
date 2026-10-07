import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  GraduationCap, UserCheck, Users, Layers, BookOpen, ClipboardCheck, TrendingUp,
  ArrowRight, AlertTriangle, CheckCircle2, Clock, Wallet,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { get } from '../lib/api';
import { Card, CardHeader, Spinner, ErrorState, Badge, PageHeader } from '../components/ui';
import { formatDateTime, DAY_NAMES } from '../lib/constants';

export function AdminDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try { setData(await get('/api/dashboard?view=admin')); }
    catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  if (loading) return <Spinner label="Loading dashboard..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const stats = [
    { label: 'Active Learners', value: data.learners_active, sub: `${data.boys} boys · ${data.girls} girls`, icon: GraduationCap, tone: 'bg-emerald-700', to: '/learners' },
    { label: 'Teachers & Staff', value: data.teachers, sub: 'Across all levels', icon: UserCheck, tone: 'bg-sky-700', to: '/teachers' },
    { label: 'Parents / Guardians', value: data.parents, sub: 'Linked profiles', icon: Users, tone: 'bg-violet-700', to: '/parents' },
    { label: 'Streams / Classes', value: data.streams, sub: 'Current year', icon: Layers, tone: 'bg-amber-600', to: '/academic' },
  ];
  const maxGrade = Math.max(1, ...((data.grade_distribution || []).map((g: any) => g.count)));
  const rate = data.attendance_today?.rate;

  return (
    <div>
      <PageHeader title={`Good day — here's ${data.current_year ? data.current_year.name : 'your school'} at a glance`} subtitle={`${data.learners_total} total learners enrolled · ${data.users} system users · Curriculum: ${data.active_version?.name || 'Not set'}`} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} to={s.to}>
            <Card className="group p-5 transition hover:shadow-md">
              <div className="flex items-start justify-between">
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${s.tone}`}>
                  <s.icon className="h-5 w-5 text-white" />
                </div>
                <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-1 group-hover:text-slate-500" />
              </div>
              <p className="mt-4 text-3xl font-bold text-slate-900">{s.value}</p>
              <p className="text-sm font-medium text-slate-700">{s.label}</p>
              <p className="text-xs text-slate-500">{s.sub}</p>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Attendance today" subtitle="Across all marked streams" action={<Link to="/attendance" className="text-sm font-semibold text-emerald-700 hover:underline">Open register</Link>} />
          <div className="px-5 pb-5">
            {rate === null || rate === undefined ? (
              <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <AlertTriangle className="h-4 w-4" /> No attendance marked yet today.
              </div>
            ) : (
              <div>
                <div className="flex items-end justify-between">
                  <p className="text-4xl font-bold text-slate-900">{rate}%</p>
                  <p className="text-sm text-slate-500">{data.attendance_today.present} / {data.attendance_today.total} present</p>
                </div>
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${rate >= 90 ? 'bg-emerald-600' : rate >= 75 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${rate}%` }} />
                </div>
              </div>
            )}
            {data.attendance_trend?.length > 0 && (
              <div className="mt-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Last {data.attendance_trend.length} marked days</p>
                <div className="flex h-24 items-end gap-1.5">
                  {data.attendance_trend.map((d: any) => (
                    <div key={d.date} className="group relative flex-1" title={`${d.date}: ${d.rate}%`}>
                      <div className={`w-full rounded-t ${d.rate >= 90 ? 'bg-emerald-500' : d.rate >= 75 ? 'bg-amber-400' : 'bg-rose-400'}`} style={{ height: `${Math.max(6, d.rate)}%` }} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Enrolment by grade" subtitle="Active learners per grade" />
          <div className="space-y-2.5 px-5 pb-5">
            {(data.grade_distribution || []).filter((g: any) => g.count > 0).slice(0, 10).map((g: any) => (
              <div key={g.grade_id}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">{g.grade}</span>
                  <span className="text-slate-500">{g.count}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-emerald-600" style={{ width: `${(g.count / maxGrade) * 100}%` }} />
                </div>
              </div>
            ))}
            {(data.grade_distribution || []).every((g: any) => g.count === 0) && (
              <p className="text-sm text-slate-500">No learners enrolled yet. <Link to="/learners" className="font-semibold text-emerald-700">Add learners</Link> or use <Link to="/import" className="font-semibold text-emerald-700">Data Import</Link>.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Recent activity" subtitle="Latest audit-logged actions" action={<Link to="/audit" className="text-sm font-semibold text-emerald-700 hover:underline">View all</Link>} />
          <div className="space-y-1 px-3 pb-4">
            {(data.recent_audit || []).map((a: any) => (
              <div key={a.id} className="flex items-start gap-2.5 rounded-xl px-2 py-2 hover:bg-slate-50">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                  <Clock className="h-3.5 w-3.5 text-slate-500" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{a.action}</p>
                  <p className="truncate text-xs text-slate-500">{a.user_email || 'system'} · {formatDateTime(a.created_at)}</p>
                </div>
              </div>
            ))}
            {!(data.recent_audit || []).length && <p className="px-2 pb-2 text-sm text-slate-500">No activity recorded yet.</p>}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Link to="/curriculum"><Card className="group flex items-center gap-4 p-5 transition hover:shadow-md">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100"><BookOpen className="h-5 w-5 text-emerald-700" /></div>
          <div className="flex-1"><p className="text-sm font-semibold text-slate-900">CBC Curriculum Engine</p><p className="text-xs text-slate-500">{data.learning_areas} learning areas · {data.active_version?.name || 'no active version'}</p></div>
          <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500" />
        </Card></Link>
        <Link to="/timetable"><Card className="group flex items-center gap-4 p-5 transition hover:shadow-md">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-100"><TrendingUp className="h-5 w-5 text-sky-700" /></div>
          <div className="flex-1"><p className="text-sm font-semibold text-slate-900">Timetables</p><p className="text-xs text-slate-500">Weekly class schedules with conflict checks</p></div>
          <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500" />
        </Card></Link>
        <Link to="/attendance"><Card className="group flex items-center gap-4 p-5 transition hover:shadow-md">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100"><ClipboardCheck className="h-5 w-5 text-amber-700" /></div>
          <div className="flex-1"><p className="text-sm font-semibold text-slate-900">Attendance Records</p><p className="text-xs text-slate-500">Daily registers & monthly summaries</p></div>
          <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500" />
        </Card></Link>
      </div>
    </div>
  );
}

export function TeacherDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    get('/api/dashboard?view=teacher').then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);
  if (loading) return <Spinner label="Loading dashboard..." />;
  if (error) return <ErrorState message={error} />;
  if (!data.teacher) return <ErrorState message="No teacher profile is linked to your account. Please contact the administrator." />;

  const todayName = DAY_NAMES[new Date().getDay()];
  return (
    <div>
      <PageHeader title={`Welcome, ${data.teacher.first_name}`} subtitle={`${data.streams?.length || 0} assigned stream(s) · ${data.assignments?.length || 0} teaching assignment(s)`} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title={`Today's lessons — ${todayName}`} subtitle="Your timetable for today" action={<Link to="/timetable" className="text-sm font-semibold text-emerald-700 hover:underline">Full timetable</Link>} />
          <div className="space-y-2 px-5 pb-5">
            {(data.today_slots || []).map((s: any) => (
              <div key={s.id} className="flex items-center gap-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                <div className="w-24 shrink-0 text-sm font-semibold text-slate-800">{s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{s.learning_areas?.name}</p>
                  <p className="text-xs text-slate-500">{s.streams?.name}{s.room ? ` · Room ${s.room}` : ''}</p>
                </div>
              </div>
            ))}
            {!(data.today_slots || []).length && <p className="pb-2 text-sm text-slate-500">No lessons scheduled for today.</p>}
          </div>
        </Card>
        <Card>
          <CardHeader title="Attendance today" subtitle="Marking progress per stream" action={<Link to="/attendance" className="text-sm font-semibold text-emerald-700 hover:underline">Mark attendance</Link>} />
          <div className="space-y-2 px-5 pb-5">
            {(data.attendance_today || []).map((a: any) => (
              <div key={a.stream_id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{a.stream}</p>
                  <p className="text-xs text-slate-500">{a.marked}/{a.total} marked · {a.present} present</p>
                </div>
                {a.marked >= a.total && a.total > 0 ? <Badge tone="green"><CheckCircle2 className="mr-1 h-3 w-3" />Done</Badge> : <Badge tone="amber">Pending</Badge>}
              </div>
            ))}
            {!(data.attendance_today || []).length && <p className="pb-2 text-sm text-slate-500">No streams assigned to you yet.</p>}
          </div>
        </Card>
      </div>
      <Card className="mt-4">
        <CardHeader title="My streams" subtitle="Classes you teach or supervise as class teacher" />
        <div className="grid grid-cols-1 gap-3 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-3">
          {(data.streams || []).map((s: any) => (
            <Link key={s.id} to={`/attendance?stream_id=${s.id}`} className="rounded-xl border border-slate-200 p-4 transition hover:border-emerald-300 hover:shadow-sm">
              <p className="text-sm font-bold text-slate-900">{s.grades?.code || s.grades?.name} {s.name}</p>
              <p className="text-xs text-slate-500">{s.learner_count} learners{(data.homeroom || []).some((h: any) => h.id === s.id) ? ' · Class teacher' : ''}</p>
            </Link>
          ))}
          {!(data.streams || []).length && <p className="text-sm text-slate-500">No streams assigned yet.</p>}
        </div>
      </Card>
    </div>
  );
}

export function LearnerDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    get('/api/dashboard?view=learner').then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);
  if (loading) return <Spinner label="Loading dashboard..." />;
  if (error) return <ErrorState message={error} />;
  if (!data.learner) return <ErrorState message="No learner profile is linked to your account. Please contact the administrator." />;
  const l = data.learner;
  const rate = data.attendance?.rate;
  const byDay: Record<number, any[]> = {};
  (data.timetable || []).forEach((s: any) => { (byDay[s.day_of_week] = byDay[s.day_of_week] || []).push(s); });
  return (
    <div>
      <PageHeader title={`Welcome, ${l.first_name}`} subtitle={`${l.grades?.name || ''} · ${l.streams?.name || ''} · Adm ${l.admission_no}`} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Attendance rate</p>
          <p className="mt-2 text-4xl font-bold text-slate-900">{rate === null || rate === undefined ? '—' : `${rate}%`}</p>
          <p className="mt-1 text-sm text-slate-500">{data.attendance.present}/{data.attendance.total} days present</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Competency assessments</p>
          <p className="mt-2 text-4xl font-bold text-slate-900">{(data.competency_records || []).length}</p>
          <p className="mt-1 text-sm text-slate-500">Across all core competencies</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Teacher observations</p>
          <p className="mt-2 text-4xl font-bold text-slate-900">{(data.observations || []).length}</p>
          <p className="mt-1 text-sm text-slate-500">Values & behaviour notes</p>
        </Card>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="My weekly timetable" subtitle="Current term schedule" />
          <div className="space-y-3 px-5 pb-5">
            {[1, 2, 3, 4, 5].map((d) => (
              <div key={d}>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">{DAY_NAMES[d]}</p>
                <div className="space-y-1.5">
                  {(byDay[d] || []).map((s: any) => (
                    <div key={s.id} className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                      <span className="w-24 shrink-0 font-semibold text-slate-700">{s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}</span>
                      <span className="truncate text-slate-800">{s.learning_areas?.name}</span>
                    </div>
                  ))}
                  {!(byDay[d] || []).length && <p className="text-xs text-slate-400">No lessons</p>}
                </div>
              </div>
            ))}
          </div>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Latest competency ratings" subtitle="Independent of academic marks" />
            <div className="space-y-2 px-5 pb-5">
              {(data.competency_records || []).slice(0, 6).map((r: any) => (
                <div key={r.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5">
                  <span className="text-sm font-medium text-slate-800">{r.competencies?.name}</span>
                  <Badge tone={r.rating?.startsWith('EE') ? 'green' : r.rating?.startsWith('ME') ? 'blue' : r.rating?.startsWith('AE') ? 'amber' : 'red'}>{r.rating}</Badge>
                </div>
              ))}
              {!(data.competency_records || []).length && <p className="pb-2 text-sm text-slate-500">No competency assessments yet.</p>}
            </div>
          </Card>
          <Card>
            <CardHeader title="Recent observations" subtitle="What your teachers noticed" />
            <div className="space-y-2 px-5 pb-5">
              {(data.observations || []).slice(0, 4).map((o: any) => (
                <div key={o.id} className="rounded-xl bg-slate-50 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800">{o.core_values?.name || 'General'}</p>
                    <span className="text-xs text-slate-500">{o.observation_date}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{o.observation}</p>
                </div>
              ))}
              {!(data.observations || []).length && <p className="pb-2 text-sm text-slate-500">No observations yet.</p>}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

export function ParentDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    get('/api/dashboard?view=parent').then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);
  if (loading) return <Spinner label="Loading dashboard..." />;
  if (error) return <ErrorState message={error} />;
  if (!data.parent) return <ErrorState message="No parent profile is linked to your account. Please contact the administrator." />;
  return (
    <div>
      <PageHeader title={`Welcome, ${data.parent.first_name}`} subtitle={`${(data.children || []).length} child(ren) linked to your account`} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {(data.children || []).map((c: any) => (
          <Card key={c.learner.id}>
            <CardHeader
              title={`${c.learner.first_name} ${c.learner.last_name}`}
              subtitle={`${c.learner.grades?.name || ''} · ${c.learner.streams?.name || ''} · Adm ${c.learner.admission_no} · ${c.relationship}`}
              action={<Link to={`/learners/${c.learner.id}`} className="text-sm font-semibold text-emerald-700 hover:underline">Full profile</Link>}
            />
            <div className="grid grid-cols-3 gap-3 px-5 pb-2">
              <div className="rounded-xl bg-slate-50 p-3 text-center">
                <p className="text-xl font-bold text-slate-900">{c.attendance.rate === null || c.attendance.rate === undefined ? '—' : `${c.attendance.rate}%`}</p>
                <p className="text-xs text-slate-500">Attendance</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 text-center">
                <p className="text-xl font-bold text-slate-900">{(c.competency_records || []).length}</p>
                <p className="text-xs text-slate-500">Competencies</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 text-center">
                <p className="text-xl font-bold text-slate-900">{(c.observations || []).length}</p>
                <p className="text-xs text-slate-500">Observations</p>
              </div>
            </div>
            <div className="space-y-1.5 px-5 pb-5">
              {(c.observations || []).slice(0, 2).map((o: any) => (
                <p key={o.id} className="truncate text-sm text-slate-600"><span className="font-semibold text-slate-800">{o.core_values?.name || 'Note'}:</span> {o.observation}</p>
              ))}
            </div>
          </Card>
        ))}
        {!(data.children || []).length && <p className="text-sm text-slate-500">No children linked yet. Please contact the school office.</p>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { roleName, can } = useAuth();
  if (['Teacher', 'Class Teacher'].includes(roleName)) return <TeacherDashboard />;
  if (roleName === 'Learner') return <LearnerDashboard />;
  if (roleName === 'Parent/Guardian') return <ParentDashboard />;
  if (roleName === 'Finance Officer' && !can('dashboard.admin')) return <FinanceOfficerDashboard />;
  return <AdminDashboard />;
}

function FinanceOfficerDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    get('/api/phase3-dashboard?view=finance').then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);
  if (loading) return <Spinner label="Loading finance dashboard..." />;
  if (error) return <ErrorState message={error} />;
  const fmt = (n: number) => 'KES ' + Number(n || 0).toLocaleString();
  return (
    <div>
      <PageHeader title="Finance overview" subtitle="Collections, invoices and recent payments" actions={<Link to="/finance"><span className="text-sm font-semibold text-emerald-700 hover:underline">Open finance →</span></Link>} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Today's collections", value: fmt(data.today_collections), sub: `${data.today_count} payment(s)` },
          { label: 'Term collections', value: fmt(data.term_collections), sub: 'Current term' },
          { label: 'Outstanding', value: fmt(data.outstanding), sub: `${data.unpaid_invoices + data.partial_invoices} open invoice(s)` },
          { label: 'Invoices', value: `${data.paid_invoices}/${data.partial_invoices}/${data.unpaid_invoices}`, sub: 'Paid / Partial / Unpaid' },
        ].map((c) => (
          <Card key={c.label} className="p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-700"><Wallet className="h-5 w-5 text-white" /></div>
            <p className="mt-3 text-2xl font-bold text-slate-900">{c.value}</p>
            <p className="text-sm font-medium text-slate-700">{c.label}</p>
            <p className="text-xs text-slate-500">{c.sub}</p>
          </Card>
        ))}
      </div>
      <Card className="mt-4">
        <CardHeader title="Recent payments" action={<Link to="/finance?tab=payments" className="text-sm font-semibold text-emerald-700 hover:underline">All payments</Link>} />
        <div className="divide-y divide-slate-100">
          {(data.recent_payments || []).map((p: any) => (
            <div key={p.id} className="flex items-center justify-between px-5 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800">{p.learners ? `${p.learners.first_name} ${p.learners.last_name}` : p.payment_no}</p>
                <p className="text-xs text-slate-500">{p.payment_no} · {p.payment_method} · {p.payment_date}</p>
              </div>
              <p className="text-sm font-bold">{fmt(p.amount)}</p>
            </div>
          ))}
          {!(data.recent_payments || []).length && <p className="px-5 py-4 text-sm text-slate-500">No payments yet.</p>}
        </div>
      </Card>
    </div>
  );
}
