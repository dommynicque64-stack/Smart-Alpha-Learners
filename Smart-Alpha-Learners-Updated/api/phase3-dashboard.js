import supabase from './db-client.js';
import { preflight, getSession, can, roleName, serverError, scopedLearnerIds } from './_auth.js';

const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));

async function financeMetrics() {
  const today = todayISO();
  const { data: cur } = await supabase.from('terms').select('id').eq('is_current', true).limit(1).maybeSingle();
  const termId = cur?.id || null;
  const [todayPays, allPays, invs, recent, methods] = await Promise.all([
    supabase.from('payments').select('amount').eq('status', 'Completed').eq('payment_date', today),
    termId ? supabase.from('payments').select('amount,invoice_id').eq('status', 'Completed') : { data: [] },
    supabase.from('invoices').select('id,status,balance,total_amount,term_id').neq('status', 'Cancelled'),
    supabase.from('payments').select('*, learners(first_name,last_name,admission_no)').eq('status', 'Completed').order('id', { ascending: false }).limit(8),
    supabase.from('payment_methods').select('id,name').eq('is_active', true),
  ]);
  // Term collections: payments whose invoice belongs to current term (plus unallocated this term unknown -> use all-time fallback labelled)
  let termInvoices = new Set();
  if (termId) {
    const { data: tInvs } = await supabase.from('invoices').select('id').eq('term_id', termId);
    termInvoices = new Set((tInvs || []).map((i) => i.id));
  }
  const termTotal = (allPays.data || []).filter((p) => !p.invoice_id || termInvoices.has(p.invoice_id)).reduce((s, p) => s + num(p.amount), 0);
  const todayTotal = (todayPays.data || []).reduce((s, p) => s + num(p.amount), 0);
  const invRows = invs.data || [];
  const paid = invRows.filter((i) => i.status === 'Paid').length;
  const partial = invRows.filter((i) => i.status === 'Partial').length;
  const unpaid = invRows.filter((i) => i.status === 'Unpaid').length;
  const outstanding = invRows.reduce((s, i) => s + num(i.balance), 0);
  const byMethod = {};
  (allPays.data || []).forEach(() => {});
  return {
    today_collections: todayTotal, today_count: (todayPays.data || []).length,
    term_collections: termTotal, outstanding, paid_invoices: paid, partial_invoices: partial, unpaid_invoices: unpaid,
    recent_payments: recent.data || [], payment_methods: methods.data || [], current_term_id: termId,
  };
}

async function parentFinance(me) {
  const scope = await scopedLearnerIds(me);
  if (!scope || !scope.length) return { children: [] };
  const { data: learners } = await supabase.from('learners').select('id,admission_no,first_name,last_name,grade_id,stream_id').in('id', scope);
  const [invoices, pays, receipts] = await Promise.all([
    supabase.from('invoices').select('*').in('learner_id', scope).neq('status', 'Cancelled').order('due_date'),
    supabase.from('payments').select('*').in('learner_id', scope).eq('status', 'Completed').order('payment_date', { ascending: false }),
    supabase.from('receipts').select('*').order('id', { ascending: false }).limit(500),
  ]);
  const payByLearner = {};
  (pays.data || []).forEach((p) => { (payByLearner[p.learner_id] = payByLearner[p.learner_id] || []).push(p); });
  const invByLearner = {};
  (invoices.data || []).forEach((i) => { (invByLearner[i.learner_id] = invByLearner[i.learner_id] || []).push(i); });
  const payIds = new Set((pays.data || []).map((p) => p.id));
  const myReceipts = (receipts.data || []).filter((r) => payIds.has(r.payment_id));
  return {
    children: (learners || []).map((l) => {
      const invs = invByLearner[l.id] || [];
      const outstanding = invs.reduce((s, i) => s + num(i.balance), 0);
      return { learner: l, invoices: invs, payments: payByLearner[l.id] || [], outstanding };
    }),
    receipts: myReceipts,
  };
}

async function learnerFinance(me) {
  const scope = await scopedLearnerIds(me);
  const id = scope?.[0];
  if (!id) return { learner: null };
  const [learner, invoices, pays] = await Promise.all([
    supabase.from('learners').select('id,admission_no,first_name,last_name').eq('id', id).maybeSingle(),
    supabase.from('invoices').select('*').eq('learner_id', id).neq('status', 'Cancelled').order('due_date'),
    supabase.from('payments').select('*').eq('learner_id', id).eq('status', 'Completed').order('payment_date', { ascending: false }),
  ]);
  return { learner: learner.data, invoices: invoices.data || [], payments: pays.data || [], outstanding: (invoices.data || []).reduce((s, i) => s + num(i.balance), 0) };
}

async function reportsHub(me) {
  const role = roleName(me);
  const out = { role, cards: [] };
  const push = (c) => out.cards.push(c);
  if (can(me, ['dashboard.admin', 'dashboard.finance', 'finance.reports'])) {
    const f = await financeMetrics();
    push({ key: 'collections', title: 'Collections overview', rows: [
      ['Today', `KES ${f.today_collections.toLocaleString()} (${f.today_count})`],
      ['Term (current)', `KES ${f.term_collections.toLocaleString()}`],
      ['Outstanding', `KES ${f.outstanding.toLocaleString()}`],
      ['Invoices paid/partial/unpaid', `${f.paid_invoices}/${f.partial_invoices}/${f.unpaid_invoices}`],
    ]});
  }
  if (can(me, ['dashboard.admin', 'academic.manage', 'attendance.view'])) {
    const { count: learners } = await supabase.from('learners').select('id', { count: 'exact', head: true }).eq('status', 'Active');
    const { data: t } = await supabase.from('attendance_records').select('status').eq('date', todayISO());
    const rows = t || [];
    const pr = rows.filter((r) => ['Present', 'Late'].includes(r.status)).length;
    push({ key: 'attendance', title: 'Attendance today', rows: [['Active learners', learners || 0], ['Marked', rows.length], ['Present rate', rows.length ? `${Math.round((pr / rows.length) * 100)}%` : '—']] });
  }
  if (can(me, ['dashboard.admin', 'library.manage', 'library.view', 'library.borrow'])) {
    const { data: books } = await supabase.from('library_books').select('copies_total,copies_available');
    const tot = (books || []).reduce((s, b) => s + num(b.copies_total), 0);
    const avail = (books || []).reduce((s, b) => s + num(b.copies_available), 0);
    const { count: issued } = await supabase.from('library_transactions').select('id', { count: 'exact', head: true }).eq('status', 'Issued');
    push({ key: 'library', title: 'Library snapshot', rows: [['Titles', (books || []).length], ['Copies', tot], ['Available', avail], ['Issued', issued || 0]] });
  }
  if (can(me, ['dashboard.admin', 'transport.manage', 'transport.view'])) {
    const { count: routes } = await supabase.from('transport_routes').select('id', { count: 'exact', head: true }).eq('is_active', true);
    const { count: riders } = await supabase.from('transport_assignments').select('id', { count: 'exact', head: true }).eq('is_active', true);
    const { count: vehicles } = await supabase.from('vehicles').select('id', { count: 'exact', head: true }).eq('status', 'Active');
    push({ key: 'transport', title: 'Transport snapshot', rows: [['Active routes', routes || 0], ['Riders', riders || 0], ['Active vehicles', vehicles || 0]] });
  }
  if (can(me, ['dashboard.admin', 'discipline.view', 'discipline.manage'])) {
    const { data: disc } = await supabase.from('discipline_records').select('severity,status');
    const open = (disc || []).filter((d) => d.status === 'Open').length;
    push({ key: 'discipline', title: 'Pastoral care', rows: [['Total incidents', (disc || []).length], ['Open', open]] });
  }
  if (['Parent/Guardian', 'Learner'].includes(role)) {
    const pf = role === 'Parent/Guardian' ? await parentFinance(me) : null;
    const lf = role === 'Learner' ? await learnerFinance(me) : null;
    if (pf) pf.children.forEach((c) => push({ key: `child-${c.learner.id}`, title: `${c.learner.first_name} ${c.learner.last_name} — fees`, rows: [['Outstanding', `KES ${c.outstanding.toLocaleString()}`], ['Invoices', c.invoices.length], ['Payments', c.payments.length]] }));
    if (lf?.learner) push({ key: 'mine', title: 'My fees', rows: [['Outstanding', `KES ${lf.outstanding.toLocaleString()}`], ['Invoices', lf.invoices.length], ['Payments', lf.payments.length]] });
  }
  return out;
}

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const me = session.profile;
    const view = req.query.view || 'finance';
    if (view === 'finance') {
      if (!can(me, ['dashboard.finance', 'dashboard.admin', 'finance.reports', 'finance.invoices', 'finance.payments'])) return res.status(403).json({ error: 'Forbidden' });
      return res.status(200).json({ view: 'finance', ...(await financeMetrics()) });
    }
    if (view === 'parent-finance') {
      const role = roleName(me);
      if (!can(me, 'finance.view') && !['Parent/Guardian', 'Learner', 'Administrator'].includes(role) && !can(me, ['dashboard.admin', 'dashboard.finance'])) return res.status(403).json({ error: 'Forbidden' });
      if (role === 'Learner') return res.status(200).json({ view: 'parent-finance', ...(await learnerFinance(me)), mode: 'learner' });
      if (role === 'Parent/Guardian') return res.status(200).json({ view: 'parent-finance', ...(await parentFinance(me)), mode: 'parent' });
      return res.status(200).json({ view: 'parent-finance', ...(await parentFinance(me)), mode: 'staff-preview' });
    }
    if (view === 'reports') {
      if (!can(me, ['reports.view', 'dashboard.admin', 'dashboard.finance', 'finance.reports', 'attendance.view', 'library.view', 'transport.view', 'discipline.view'])) {
        if (!['Parent/Guardian', 'Learner'].includes(roleName(me))) return res.status(403).json({ error: 'Forbidden' });
      }
      return res.status(200).json({ view: 'reports', ...(await reportsHub(me)) });
    }
    return res.status(400).json({ error: 'Unknown view' });
  } catch (err) {
    return serverError(res, err);
  }
}
