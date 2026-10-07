import supabase from './db-client.js';
import { preflight, getSession, can, roleName } from './_auth.js';

const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

async function adminMetrics() {
  const [learners, teachers, parents, users, streams, areas, versions] = await Promise.all([
    supabase.from('learners').select('id,gender,grade_id,status', { count: 'exact' }),
    supabase.from('teachers').select('id', { count: 'exact', head: true }),
    supabase.from('parents').select('id', { count: 'exact', head: true }),
    supabase.from('app_users').select('id', { count: 'exact', head: true }),
    supabase.from('streams').select('id', { count: 'exact', head: true }),
    supabase.from('learning_areas').select('id', { count: 'exact', head: true }),
    supabase.from('curriculum_versions').select('id,name,is_active').order('id', { ascending: false }),
  ]);
  const all = learners.data || [];
  const active = all.filter((l) => l.status === 'Active');
  const boys = active.filter((l) => l.gender === 'Male').length;
  const girls = active.filter((l) => l.gender === 'Female').length;
  const byGrade = {};
  active.forEach((l) => { byGrade[l.grade_id] = (byGrade[l.grade_id] || 0) + 1; });
  const { data: grades } = await supabase.from('grades').select('id,name,code,order_index,level_id').order('order_index');
  const { data: levels } = await supabase.from('levels').select('id,name');
  const lmap = Object.fromEntries((levels || []).map((l) => [l.id, l.name]));
  const gradeDist = (grades || []).map((g) => ({ grade_id: g.id, grade: g.code || g.name, level: lmap[g.level_id] || '', count: byGrade[g.id] || 0 }));
  const today = todayISO();
  const { data: todayAtt } = await supabase.from('attendance_records').select('status').eq('date', today);
  const tRows = todayAtt || [];
  const tPresent = tRows.filter((r) => ['Present', 'Late'].includes(r.status)).length;
  const from = new Date(Date.now() - 13 * 864e5).toISOString().slice(0, 10);
  const { data: trend } = await supabase.from('attendance_records').select('date,status').gte('date', from).lte('date', today).order('date');
  const byDay = {};
  (trend || []).forEach((r) => {
    byDay[r.date] = byDay[r.date] || { date: r.date, total: 0, present: 0 };
    byDay[r.date].total++;
    if (['Present', 'Late'].includes(r.status)) byDay[r.date].present++;
  });
  const attendanceTrend = Object.values(byDay).map((d) => ({ ...d, rate: d.total ? Math.round((d.present / d.total) * 100) : 0 }));
  const { data: recentAudit } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(8);
  const { data: year } = await supabase.from('academic_years').select('*, terms(*)').eq('is_current', true).maybeSingle();
  return {
    learners_total: learners.count || all.length, learners_active: active.length, boys, girls,
    teachers: teachers.count || 0, parents: parents.count || 0, users: users.count || 0,
    streams: streams.count || 0, learning_areas: areas.count || 0,
    active_version: (versions.data || []).find((v) => v.is_active) || null,
    attendance_today: { total: tRows.length, present: tPresent, rate: tRows.length ? Math.round((tPresent / tRows.length) * 100) : null },
    attendance_trend: attendanceTrend, grade_distribution: gradeDist, recent_audit: recentAudit || [], current_year: year || null,
  };
}

async function teacherMetrics(me) {
  const { data: teacher } = await supabase.from('teachers').select('*').eq('app_user_id', me.id).maybeSingle();
  if (!teacher) return { teacher: null };
  const { data: asg } = await supabase.from('teacher_assignments').select('*').eq('teacher_id', teacher.id);
  const { data: home } = await supabase.from('streams').select('*, grades(name,code)').eq('class_teacher_id', teacher.id);
  const streamIds = [...new Set([...(asg || []).map((a) => a.stream_id), ...(home || []).map((h) => h.id)])];
  let streams = [];
  if (streamIds.length) {
    const { data: s } = await supabase.from('streams').select('*, grades(name,code)').in('id', streamIds);
    const { data: learners } = await supabase.from('learners').select('id,stream_id').in('stream_id', streamIds).eq('status', 'Active');
    const counts = {};
    (learners || []).forEach((l) => { counts[l.stream_id] = (counts[l.stream_id] || 0) + 1; });
    streams = (s || []).map((x) => ({ ...x, learner_count: counts[x.id] || 0 }));
  }
  const today = todayISO();
  const dow = new Date().getDay();
  const { data: terms } = await supabase.from('terms').select('id').eq('is_current', true).limit(1).maybeSingle();
  let todaySlots = [];
  if (terms) {
    const { data } = await supabase.from('timetable_slots').select('*, learning_areas(name), streams(name)').eq('teacher_id', teacher.id).eq('term_id', terms.id).eq('day_of_week', dow).order('start_time');
    todaySlots = data || [];
  }
  let attendanceToday = [];
  if (streamIds.length) {
    const { data } = await supabase.from('attendance_records').select('stream_id,status').eq('date', today).in('stream_id', streamIds);
    const byStream = {};
    (data || []).forEach((r) => { byStream[r.stream_id] = byStream[r.stream_id] || { marked: 0, present: 0 }; byStream[r.stream_id].marked++; if (['Present', 'Late'].includes(r.status)) byStream[r.stream_id].present++; });
    attendanceToday = streams.map((s) => ({ stream_id: s.id, stream: `${s.grades?.code || s.grades?.name || ''} ${s.name}`, marked: byStream[s.id]?.marked || 0, present: byStream[s.id]?.present || 0, total: s.learner_count }));
  }
  return { teacher, streams, today_slots: todaySlots, attendance_today: attendanceToday, assignments: asg || [], homeroom: home || [] };
}

async function learnerMetrics(me) {
  const { data: learner } = await supabase.from('learners').select('*, grades(name,code), streams(name)').eq('app_user_id', me.id).maybeSingle();
  if (!learner) return { learner: null };
  const { data: att } = await supabase.from('attendance_records').select('status,date').eq('learner_id', learner.id).order('date', { ascending: false }).limit(200);
  const rows = att || [];
  const present = rows.filter((r) => ['Present', 'Late'].includes(r.status)).length;
  const { data: comp } = await supabase.from('learner_competency_records').select('*, competencies(code,name)').eq('learner_id', learner.id).order('id', { ascending: false }).limit(50);
  const { data: obs } = await supabase.from('learner_observations').select('*, core_values(name)').eq('learner_id', learner.id).order('observation_date', { ascending: false }).limit(20);
  const { data: terms } = await supabase.from('terms').select('id').eq('is_current', true).limit(1).maybeSingle();
  let weekSlots = [];
  if (terms && learner.stream_id) {
    const { data } = await supabase.from('timetable_slots').select('*, learning_areas(name,code)').eq('stream_id', learner.stream_id).eq('term_id', terms.id).order('day_of_week').order('start_time');
    weekSlots = data || [];
  }
  return { learner, attendance: { total: rows.length, present, rate: rows.length ? Math.round((present / rows.length) * 100) : null }, competency_records: comp || [], observations: obs || [], timetable: weekSlots };
}

async function parentMetrics(me) {
  const { data: parent } = await supabase.from('parents').select('*').eq('app_user_id', me.id).maybeSingle();
  if (!parent) return { parent: null, children: [] };
  const { data: links } = await supabase.from('learner_parent_links').select('*, learners(*, grades(name,code), streams(name))').eq('parent_id', parent.id);
  const children = [];
  for (const l of links || []) {
    const learner = l.learners;
    if (!learner) continue;
    const { data: att } = await supabase.from('attendance_records').select('status').eq('learner_id', learner.id);
    const rows = att || [];
    const present = rows.filter((r) => ['Present', 'Late'].includes(r.status)).length;
    const { data: comp } = await supabase.from('learner_competency_records').select('*, competencies(code,name)').eq('learner_id', learner.id).order('id', { ascending: false }).limit(20);
    const { data: obs } = await supabase.from('learner_observations').select('*, core_values(name)').eq('learner_id', learner.id).order('observation_date', { ascending: false }).limit(10);
    children.push({ relationship: l.relationship, learner, attendance: { total: rows.length, present, rate: rows.length ? Math.round((present / rows.length) * 100) : null }, competency_records: comp || [], observations: obs || [] });
  }
  return { parent, children };
}

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const me = session.profile;
    const role = roleName(me);
    const view = req.query.view || 'auto';
    if (view === 'admin' || (view === 'auto' && ['Administrator', 'Academic Administrator', 'Finance Officer'].includes(role))) {
      if (!can(me, ['dashboard.admin', 'dashboard.finance'])) return res.status(403).json({ error: 'Forbidden' });
      return res.status(200).json({ view: 'admin', ...(await adminMetrics()) });
    }
    if (view === 'teacher' || (view === 'auto' && ['Teacher', 'Class Teacher'].includes(role))) {
      if (!can(me, 'dashboard.teacher')) return res.status(403).json({ error: 'Forbidden' });
      return res.status(200).json({ view: 'teacher', ...(await teacherMetrics(me)) });
    }
    if (view === 'learner' || (view === 'auto' && role === 'Learner')) {
      return res.status(200).json({ view: 'learner', ...(await learnerMetrics(me)) });
    }
    if (view === 'parent' || (view === 'auto' && role === 'Parent/Guardian')) {
      return res.status(200).json({ view: 'parent', ...(await parentMetrics(me)) });
    }
    return res.status(200).json({ view: 'admin', ...(await adminMetrics()) });
  } catch (err) {
    console.error('API dashboard error:', err);
    res.status(500).json({ error: err.message });
  }
}
