import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Plus, Search, Eye, Printer, Download, XCircle, Ban, Wallet, FileText, Receipt } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { get, post, put, del } from '../lib/api';
import { Card, Button, Input, Select, Field, Badge, Spinner, ErrorState, EmptyState, PageHeader, Modal, Tabs, Textarea, useToast, Toast } from '../components/ui';
import { formatDate, fullName, todayISO } from '../lib/constants';
import { formatKES, downloadCSV, printHTML, schoolHeadHTML, learnerMetaHTML } from '../lib/finance';

function statusTone(s: string) {
  if (s === 'Paid') return 'green';
  if (s === 'Partial') return 'amber';
  if (s === 'Cancelled') return 'slate';
  return 'red';
}

export default function Finance() {
  const { can, roleName } = useAuth();
  const [params] = useSearchParams();
  const isParentLike = ['Parent/Guardian', 'Learner'].includes(roleName);
  const canStruct = can('finance.structures');
  const canInv = can('finance.invoices');
  const canPay = can('finance.payments');
  const canRep = can('finance.reports', 'dashboard.finance', 'dashboard.admin');
  const [tab, setTab] = useState(params.get('tab') || (isParentLike ? 'portal' : 'dashboard'));

  const tabs: { key: string; label: string }[] = [];
  if (!isParentLike) {
    tabs.push({ key: 'dashboard', label: 'Overview' });
    if (canInv || canStruct) tabs.push({ key: 'structures', label: 'Fee Structures' });
    if (canInv) tabs.push({ key: 'invoices', label: 'Invoices' });
    if (canPay) tabs.push({ key: 'payments', label: 'Payments' });
    tabs.push({ key: 'receipts', label: 'Receipts' });
    if (canRep) tabs.push({ key: 'reports', label: 'Reports' });
    if (canStruct) tabs.push({ key: 'settings', label: 'Settings' });
  } else {
    tabs.push({ key: 'portal', label: 'My Fees' });
  }
  useEffect(() => {
    if (!tabs.some((t) => t.key === tab)) setTab(tabs[0]?.key || 'dashboard');
    // eslint-disable-next-line
  }, []);

  return (
    <div>
      <PageHeader title="Finance" subtitle={isParentLike ? 'Invoices, payments, receipts and statements' : 'Fees, invoices, payments, receipts and reports'} />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      <div className="mt-4">
        {tab === 'dashboard' && <FinanceDashboard />}
        {tab === 'structures' && <StructuresTab canStruct={canStruct} canInv={canInv} />}
        {tab === 'invoices' && <InvoicesTab canInv={canInv} canPay={canPay} />}
        {tab === 'payments' && <PaymentsTab canPay={canPay} />}
        {tab === 'receipts' && <ReceiptsTab canPay={canPay} />}
        {tab === 'reports' && <ReportsTab />}
        {tab === 'settings' && <SettingsTab />}
        {tab === 'portal' && <ParentPortalTab />}
      </div>
    </div>
  );
}

export function FinanceDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    get('/api/phase3-dashboard?view=finance').then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);
  if (loading) return <Spinner label="Loading finance overview..." />;
  if (error) return <ErrorState message={error} />;
  const cards = [
    { label: "Today's collections", value: formatKES(data.today_collections), sub: `${data.today_count} payment(s) today`, tone: 'bg-emerald-700' },
    { label: 'Term collections', value: formatKES(data.term_collections), sub: 'Current term', tone: 'bg-sky-700' },
    { label: 'Outstanding balances', value: formatKES(data.outstanding), sub: `${data.unpaid_invoices + data.partial_invoices} open invoice(s)`, tone: 'bg-rose-600' },
  ];
  return (
    <div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.label} className="p-5">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${c.tone}`}><Wallet className="h-5 w-5 text-white" /></div>
            <p className="mt-3 text-2xl font-bold text-slate-900">{c.value}</p>
            <p className="text-sm font-medium text-slate-700">{c.label}</p>
            <p className="text-xs text-slate-500">{c.sub}</p>
          </Card>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <div className="border-b border-slate-100 px-5 py-3"><p className="text-sm font-bold">Invoice status</p></div>
          <div className="grid grid-cols-3 gap-3 p-5 text-center">
            <div className="rounded-xl bg-emerald-50 p-4"><p className="text-2xl font-bold text-emerald-800">{data.paid_invoices}</p><p className="text-xs text-emerald-700">Paid</p></div>
            <div className="rounded-xl bg-amber-50 p-4"><p className="text-2xl font-bold text-amber-800">{data.partial_invoices}</p><p className="text-xs text-amber-700">Partial</p></div>
            <div className="rounded-xl bg-rose-50 p-4"><p className="text-2xl font-bold text-rose-800">{data.unpaid_invoices}</p><p className="text-xs text-rose-700">Unpaid</p></div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <p className="text-sm font-bold">Recent payments</p>
            <span className="text-xs text-slate-500">{(data.payment_methods || []).length} active method(s)</span>
          </div>
          <div className="divide-y divide-slate-100">
            {(data.recent_payments || []).map((p: any) => (
              <div key={p.id} className="flex items-center justify-between px-5 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{p.learners ? `${p.learners.first_name} ${p.learners.last_name}` : `Payment ${p.payment_no}`}</p>
                  <p className="text-xs text-slate-500">{p.payment_no} · {p.payment_method} · {formatDate(p.payment_date)}</p>
                </div>
                <p className="text-sm font-bold text-slate-900">{formatKES(p.amount)}</p>
              </div>
            ))}
            {!(data.recent_payments || []).length && <p className="px-5 py-4 text-sm text-slate-500">No payments recorded yet.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ---------- Fee structures ----------

function StructuresTab({ canStruct, canInv }: { canStruct: boolean; canInv: boolean }) {
  const [rows, setRows] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [years, setYears] = useState<any[]>([]);
  const [terms, setTerms] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [streams, setStreams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [itemFor, setItemFor] = useState<any>(null);
  const [generateFor, setGenerateFor] = useState<any>(null);
  const { showSuccess, showError, toast } = useToast();
  const load = async () => {
    setLoading(true);
    try {
      const [s, c, y, t, g, st] = await Promise.all([
        get('/api/finance?resource=fee-structures'), get('/api/finance?resource=fee-categories'),
        get('/api/academic?resource=years'), get('/api/academic?resource=terms'),
        get('/api/academic?resource=grades'), get('/api/academic?resource=streams'),
      ]);
      setRows(s); setCats(c); setYears(y); setTerms(t); setGrades(g); setStreams(st);
    } catch (e: any) { showError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); // eslint-disable-next-line
  }, []);
  return (
    <div>
      <Toast toast={toast} />
      {canStruct && <div className="mb-4"><Button onClick={() => { setEditing(null); setShowForm(true); }}><Plus className="h-4 w-4" /> New fee structure</Button></div>}
      {loading ? <Spinner /> : rows.length === 0 ? <EmptyState title="No fee structures" subtitle="Define a reusable fee structure per year, term, grade or stream — then generate invoices from it." /> : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {rows.map((s) => (
            <Card key={s.id} className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-slate-900">{s.name}</p>
                  <p className="text-xs text-slate-500">{s.year_name} · {s.term_name} · {s.grade_name} · {s.stream_name}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={s.is_active ? 'green' : 'slate'}>{s.is_active ? 'Active' : 'Inactive'}</Badge>
                  {canStruct && <button onClick={() => { setEditing(s); setShowForm(true); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 text-xs font-semibold">Edit</button>}
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                {(s.items || []).map((i: any) => (
                  <div key={i.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-sm">
                    <span className="text-slate-700">{i.name || i.category_name} {!i.is_mandatory && <span className="text-xs text-slate-400">(optional)</span>}</span>
                    <span className="font-semibold">{formatKES(i.amount)}</span>
                  </div>
                ))}
                {!(s.items || []).length && <p className="text-sm text-slate-400">No items yet.</p>}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                <p className="text-sm font-bold">Total: {formatKES(s.total)}</p>
                <div className="flex gap-2">
                  {canStruct && <Button size="sm" variant="outline" onClick={() => setItemFor(s)}>Manage items</Button>}
                  {canInv && <Button size="sm" onClick={() => setGenerateFor(s)}>Generate invoices</Button>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {showForm && <StructureForm initial={editing} years={years} terms={terms} grades={grades} streams={streams} onSaved={() => { setShowForm(false); load(); }} onClose={() => setShowForm(false)} />}
      {itemFor && <ItemsModal structure={itemFor} cats={cats} onDone={() => { setItemFor(null); load(); }} onClose={() => setItemFor(null)} showSuccess={showSuccess} showError={showError} />}
      {generateFor && <GenerateModal structure={generateFor} years={years} terms={terms} onDone={() => { setGenerateFor(null); }} onClose={() => setGenerateFor(null)} />}
    </div>
  );
}

function StructureForm({ initial, years, terms, grades, streams, onSaved, onClose }: any) {
  const [form, setForm] = useState({
    name: initial?.name || '', academic_year_id: initial?.academic_year_id || years.find((y: any) => y.is_current)?.id || '',
    term_id: initial?.term_id || '', grade_id: initial?.grade_id || '', stream_id: initial?.stream_id || '',
    is_active: initial?.is_active !== false, notes: initial?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const { showError, showSuccess, toast } = useToast();
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.academic_year_id) { showError('Name and academic year are required'); return; }
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), academic_year_id: Number(form.academic_year_id), term_id: form.term_id ? Number(form.term_id) : null, grade_id: form.grade_id ? Number(form.grade_id) : null, stream_id: form.stream_id ? Number(form.stream_id) : null, is_active: form.is_active, notes: form.notes || null };
      if (initial?.id) await put('/api/finance?resource=fee-structures', { ...payload, id: initial.id });
      else await post('/api/finance?resource=fee-structures', payload);
      showSuccess('Fee structure saved'); setTimeout(onSaved, 400);
    } catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };
  const fStreams = streams.filter((s: any) => !form.grade_id || String(s.grade_id) === String(form.grade_id));
  return (
    <Modal title={initial ? 'Edit fee structure' : 'New fee structure'} onClose={onClose}>
      <Toast toast={toast} />
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name" required><Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Grade 7 — Term 1 Day" /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Academic year" required><Select value={form.academic_year_id} onChange={(e) => set('academic_year_id', e.target.value)}><option value="">— Select —</option>{years.map((y: any) => <option key={y.id} value={y.id}>{y.name}</option>)}</Select></Field>
          <Field label="Term (blank = all)"><Select value={form.term_id} onChange={(e) => set('term_id', e.target.value)}><option value="">All terms</option>{terms.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Grade (blank = all)"><Select value={form.grade_id} onChange={(e) => { set('grade_id', e.target.value); set('stream_id', ''); }}><option value="">All grades</option>{grades.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select></Field>
          <Field label="Stream (blank = all)"><Select value={form.stream_id} onChange={(e) => set('stream_id', e.target.value)}><option value="">All streams</option>{fStreams.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        </div>
        <Field label="Notes"><Input value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} className="h-4 w-4 accent-emerald-700" /> Active</label>
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Save</Button></div>
      </form>
    </Modal>
  );
}

function ItemsModal({ structure, cats, onDone, onClose, showSuccess, showError }: any) {
  const [items, setItems] = useState<any[]>(structure.items || []);
  const [form, setForm] = useState({ fee_category_id: '', name: '', amount: '', is_mandatory: true });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const add = async () => {
    if (!form.fee_category_id || !form.amount || Number(form.amount) <= 0) { showError('Category and a positive amount are required'); return; }
    setSaving(true);
    try {
      const row = await post('/api/finance?resource=fee-items', { fee_structure_id: structure.id, fee_category_id: Number(form.fee_category_id), name: form.name || null, amount: Number(form.amount), is_mandatory: form.is_mandatory });
      setItems([...items, { ...row, category_name: cats.find((c: any) => String(c.id) === String(form.fee_category_id))?.name || '' }]);
      setForm({ fee_category_id: '', name: '', amount: '', is_mandatory: true });
      showSuccess('Item added');
    } catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };
  const remove = async (id: number) => {
    try {
      await del(`/api/finance?resource=fee-items&id=${id}`);
      setItems(items.filter((i) => i.id !== id));
      showSuccess('Item removed');
    } catch (e: any) { showError(e.message); }
  };
  return (
    <Modal title={`Fee items — ${structure.name}`} subtitle="Charges in this structure" onClose={onClose} wide>
      <div className="space-y-2">
        {items.map((i: any) => (
          <div key={i.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2 text-sm">
            <span>{i.name || i.category_name} <span className="text-xs text-slate-400">· {i.category_name}</span>{!i.is_mandatory && <span className="text-xs text-slate-400"> (optional)</span>}</span>
            <span className="flex items-center gap-3"><span className="font-semibold">{formatKES(i.amount)}</span>
              <button onClick={() => remove(i.id)} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600">✕</button></span>
          </div>
        ))}
        {!items.length && <p className="text-sm text-slate-400">No items yet.</p>}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-4">
        <Field label="Category"><Select value={form.fee_category_id} onChange={(e) => set('fee_category_id', e.target.value)}><option value="">— Select —</option>{cats.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Label (optional)"><Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Overrides category" /></Field>
        <Field label="Amount (KES)"><Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set('amount', e.target.value)} /></Field>
        <div className="flex items-end gap-2">
          <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={form.is_mandatory} onChange={(e) => set('is_mandatory', e.target.checked)} className="h-4 w-4 accent-emerald-700" /> Mandatory</label>
          <Button size="sm" onClick={add} loading={saving}>Add</Button>
        </div>
      </div>
      <div className="mt-4 flex justify-end"><Button variant="secondary" onClick={onDone}>Done</Button></div>
    </Modal>
  );
}

function GenerateModal({ structure, years, terms, onDone, onClose }: any) {
  const [form, setForm] = useState({ academic_year_id: structure.academic_year_id || '', term_id: structure.term_id || terms.find((t: any) => t.is_current)?.id || '', due_date: '' });
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { showError, showSuccess, toast } = useToast();
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const run = async () => {
    if (!form.academic_year_id || !form.term_id) { showError('Year and term are required'); return; }
    setSaving(true);
    try {
      const r = await post('/api/finance?resource=invoices', { action: 'generate', fee_structure_id: structure.id, academic_year_id: Number(form.academic_year_id), term_id: Number(form.term_id), due_date: form.due_date || null });
      setResult(r);
      showSuccess(`Generated ${r.created} invoice(s)${r.skipped ? `, ${r.skipped} skipped (already invoiced)` : ''}`);
    } catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };
  return (
    <Modal title={`Generate invoices — ${structure.name}`} subtitle="Creates one invoice per matching active learner" onClose={onClose}>
      <Toast toast={toast} />
      {result ? (
        <div className="text-center">
          <p className="text-3xl font-bold text-slate-900">{result.created}</p>
          <p className="text-sm text-slate-500">invoice(s) created · {result.skipped} skipped</p>
          <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Close</Button><Button onClick={onDone}>Done</Button></div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Academic year" required><Select value={form.academic_year_id} onChange={(e) => set('academic_year_id', e.target.value)}>{years.map((y: any) => <option key={y.id} value={y.id}>{y.name}</option>)}</Select></Field>
            <Field label="Term" required><Select value={form.term_id} onChange={(e) => set('term_id', e.target.value)}><option value="">— Select —</option>{terms.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
          </div>
          <Field label="Due date"><Input type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} /></Field>
          <p className="text-xs text-slate-500">Learners who already have an invoice for this year+term are skipped automatically. Parents are notified per invoice.</p>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={run} loading={saving}>Generate</Button></div>
        </div>
      )}
    </Modal>
  );
}

// ---------- Invoices ----------

function InvoicesTab({ canInv, canPay }: { canInv: boolean; canPay: boolean }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fQ, setFQ] = useState('');
  const [detail, setDetail] = useState<any>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showPay, setShowPay] = useState<any>(null);
  const [showStatement, setShowStatement] = useState<number | null>(null);
  const { showSuccess, showError, toast } = useToast();
  const load = async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (fStatus) params.set('status', fStatus);
      setRows(await get(`/api/finance?resource=invoices&${params.toString()}`));
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); // eslint-disable-next-line
  }, [fStatus]);
  const openDetail = async (id: number) => {
    try { setDetail(await get(`/api/finance?resource=invoices&id=${id}`)); }
    catch (e: any) { showError(e.message); }
  };
  const cancel = async (inv: any) => {
    if (!confirm(`Cancel invoice ${inv.invoice_no}? Only unpaid invoices can be cancelled.`)) return;
    try { await put('/api/finance?resource=invoices', { id: inv.id, status: 'Cancelled' }); showSuccess('Invoice cancelled'); setDetail(null); load(); }
    catch (e: any) { showError(e.message); }
  };
  const filtered = rows.filter((r) => !fQ.trim() || `${r.invoice_no} ${r.learner_name} ${r.admission_no}`.toLowerCase().includes(fQ.toLowerCase()));
  const totals = filtered.reduce((a, r) => ({ total: a.total + Number(r.total_amount || 0), paid: a.paid + Number(r.paid_amount || 0), bal: a.bal + Number(r.balance || 0) }), { total: 0, paid: 0, bal: 0 });
  return (
    <div>
      <Toast toast={toast} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="pl-9" placeholder="Search invoice, learner..." value={fQ} onChange={(e) => setFQ(e.target.value)} /></div>
        <div className="w-44"><Select value={fStatus} onChange={(e) => setFStatus(e.target.value)}><option value="">All statuses</option>{['Unpaid', 'Partial', 'Paid', 'Cancelled'].map((s) => <option key={s} value={s}>{s}</option>)}</Select></div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => downloadCSV('invoices.csv', ['Invoice', 'Learner', 'Admission', 'Total', 'Paid', 'Balance', 'Status'], filtered.map((r) => [r.invoice_no, r.learner_name, r.admission_no, r.total_amount, r.paid_amount, r.balance, r.status]))}><Download className="h-4 w-4" /> CSV</Button>
          {canInv && <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> New invoice</Button>}
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        <Badge tone="slate">Billed: {formatKES(totals.total)}</Badge>
        <Badge tone="green">Collected: {formatKES(totals.paid)}</Badge>
        <Badge tone="red">Outstanding: {formatKES(totals.bal)}</Badge>
      </div>
      {loading ? <Spinner /> : error ? <ErrorState message={error} onRetry={load} /> : filtered.length === 0 ? <EmptyState title="No invoices" /> : (
        <Card><div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm">
          <thead><tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Learner</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">Paid</th><th className="px-4 py-3 text-right">Balance</th><th className="px-4 py-3">Due</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th>
          </tr></thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-2.5 font-mono text-xs font-bold">{r.invoice_no}</td>
                <td className="px-4 py-2.5"><p className="font-medium">{r.learner_name}</p><p className="font-mono text-xs text-slate-400">{r.admission_no}</p></td>
                <td className="px-4 py-2.5 text-right">{formatKES(r.total_amount)}</td>
                <td className="px-4 py-2.5 text-right text-emerald-700">{formatKES(r.paid_amount)}</td>
                <td className="px-4 py-2.5 text-right font-semibold">{formatKES(r.balance)}</td>
                <td className="px-4 py-2.5 text-xs">{formatDate(r.due_date)}</td>
                <td className="px-4 py-2.5"><Badge tone={statusTone(r.status) as any}>{r.status}</Badge></td>
                <td className="px-4 py-2.5"><div className="flex justify-end gap-1">
                  <button onClick={() => openDetail(r.id)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="View"><Eye className="h-4 w-4" /></button>
                  {canPay && r.status !== 'Paid' && r.status !== 'Cancelled' && <button onClick={() => setShowPay(r)} className="rounded-lg p-1.5 text-emerald-700 hover:bg-emerald-50" title="Record payment"><Wallet className="h-4 w-4" /></button>}
                  {canInv && r.status !== 'Cancelled' && Number(r.paid_amount) === 0 && <button onClick={() => cancel(r)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Cancel"><Ban className="h-4 w-4" /></button>}
                </div></td>
              </tr>
            ))}
          </tbody>
        </table></div></Card>
      )}
      {detail && <InvoiceDetailModal inv={detail} canPay={canPay} onPay={(r: any) => { setDetail(null); setShowPay(r); }} onStatement={(id: number) => setShowStatement(id)} onClose={() => { setDetail(null); load(); }} />}
      {showCreate && <ManualInvoiceModal onSaved={() => { setShowCreate(false); load(); }} onClose={() => setShowCreate(false)} />}
      {showPay && <PaymentModal invoice={showPay} onSaved={() => { setShowPay(null); load(); }} onClose={() => setShowPay(null)} />}
      {showStatement !== null && <StatementModal learnerId={showStatement} onClose={() => setShowStatement(null)} />}
    </div>
  );
}

function InvoiceDetailModal({ inv, canPay, onPay, onStatement, onClose }: any) {
  const print = () => {
    const rows = (inv.items || []).map((i: any, n: number) =>
      `<tr><td>${n + 1}</td><td>${i.description}</td><td class=\"right\">${i.quantity}</td><td class=\"right\">${formatKES(i.unit_amount)}</td><td class=\"right\">${formatKES(i.discount_amount)}</td><td class=\"right\">${formatKES(i.line_total)}</td></tr>`).join('');
    printHTML(`Invoice ${inv.invoice_no}`,
      schoolHeadHTML(inv.school || {}, 'FEE INVOICE', inv.invoice_no) +
      learnerMetaHTML(inv.learner, [['Issue date', inv.issue_date || '—'], ['Due date', inv.due_date || '—'], ['Status', inv.status]]) +
      `<table><thead><tr><th>#</th><th>Description</th><th class=\"right\">Qty</th><th class=\"right\">Unit</th><th class=\"right\">Discount</th><th class=\"right\">Line total</th></tr></thead><tbody>${rows}</tbody></table>` +
      `<div style=\"text-align:right;font-size:14px;\">Subtotal: ${formatKES(inv.subtotal)}<br/>Discount: ${formatKES(inv.discount_total)}<br/><span class=\"total\">Total: ${formatKES(inv.total_amount)}</span><br/>Paid: ${formatKES(inv.paid_amount)}<br/><span class=\"total\">Balance: ${formatKES(inv.balance)}</span></div>` +
      `<div class=\"foot\"><span>Generated by Smart Alpha Learners</span><span class=\"stamp\">${inv.status.toUpperCase()}</span></div>`);
  };
  return (
    <Modal title={`Invoice ${inv.invoice_no}`} subtitle={`${inv.learner ? fullName(inv.learner) + ' · ' + inv.learner.admission_no : ''}`} onClose={onClose} wide>
      <div className="mb-3 flex items-center justify-between">
        <Badge tone={statusTone(inv.status) as any}>{inv.status}</Badge>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => onStatement(inv.learner_id)}><FileText className="h-3.5 w-3.5" /> Statement</Button>
          <Button size="sm" variant="outline" onClick={print}><Printer className="h-3.5 w-3.5" /> Print / PDF</Button>
          {canPay && inv.status !== 'Paid' && inv.status !== 'Cancelled' && <Button size="sm" onClick={() => onPay(inv)}><Wallet className="h-3.5 w-3.5" /> Record payment</Button>}
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full text-left text-sm">
        <thead><tr className="bg-slate-50 text-xs uppercase text-slate-500"><th className="px-3 py-2">Description</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Unit</th><th className="px-3 py-2 text-right">Discount</th><th className="px-3 py-2 text-right">Line total</th></tr></thead>
        <tbody>{(inv.items || []).map((i: any) => <tr key={i.id} className="border-t border-slate-100"><td className="px-3 py-2">{i.description}</td><td className="px-3 py-2 text-right">{i.quantity}</td><td className="px-3 py-2 text-right">{formatKES(i.unit_amount)}</td><td className="px-3 py-2 text-right">{formatKES(i.discount_amount)}</td><td className="px-3 py-2 text-right font-semibold">{formatKES(i.line_total)}</td></tr>)}</tbody>
      </table></div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Subtotal</p><p className="font-bold">{formatKES(inv.subtotal)}</p></div>
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Discount</p><p className="font-bold">{formatKES(inv.discount_total)}</p></div>
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Paid</p><p className="font-bold text-emerald-700">{formatKES(inv.paid_amount)}</p></div>
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Balance</p><p className="font-bold text-rose-700">{formatKES(inv.balance)}</p></div>
      </div>
      {(inv.payments || []).length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-bold uppercase text-slate-400">Payments ({inv.payments.length})</p>
          <div className="space-y-1.5">{inv.payments.map((p: any) => <div key={p.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"><span>{p.payment_no} · {p.payment_method} · {formatDate(p.payment_date)}{p.reference_no ? ` · ${p.reference_no}` : ''}</span><span className="font-semibold">{formatKES(p.amount)}</span></div>)}</div>
        </div>
      )}
    </Modal>
  );
}

function useLearnerSearch() {
  const [learners, setLearners] = useState<any[]>([]);
  const [q, setQ] = useState('');
  useEffect(() => { get('/api/learners?status=Active&limit=500').then(setLearners).catch(() => {}); }, []);
  const filtered = learners.filter((l) => !q.trim() || `${l.first_name} ${l.last_name} ${l.admission_no}`.toLowerCase().includes(q.toLowerCase()));
  return { q, setQ, filtered };
}

function ManualInvoiceModal({ onSaved, onClose }: any) {
  const { q, setQ, filtered } = useLearnerSearch();
  const [years, setYears] = useState<any[]>([]);
  const [terms, setTerms] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [learnerId, setLearnerId] = useState('');
  const [yearId, setYearId] = useState('');
  const [termId, setTermId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [items, setItems] = useState<any[]>([{ description: '', quantity: 1, unit_amount: '', discount_amount: 0, fee_category_id: '' }]);
  const [saving, setSaving] = useState(false);
  const { showError, showSuccess, toast } = useToast();
  useEffect(() => {
    (async () => {
      try {
        const [y, t, c] = await Promise.all([get('/api/academic?resource=years'), get('/api/academic?resource=terms'), get('/api/finance?resource=fee-categories')]);
        setYears(y); setTerms(t); setCats(c);
        const cy = y.find((x: any) => x.is_current); if (cy) setYearId(String(cy.id));
        const ct = t.find((x: any) => x.is_current); if (ct) setTermId(String(ct.id));
      } catch { /* noop */ }
    })();
  }, []);
  const total = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_amount) || 0) - (Number(i.discount_amount) || 0), 0);
  const submit = async () => {
    if (!learnerId || !yearId || !termId) { showError('Learner, year and term are required'); return; }
    if (!items.length || items.some((i) => !i.description.trim() || !(Number(i.unit_amount) > 0))) { showError('Each item needs a description and a positive amount'); return; }
    setSaving(true);
    try {
      await post('/api/finance?resource=invoices', {
        learner_id: Number(learnerId), academic_year_id: Number(yearId), term_id: Number(termId), due_date: dueDate || null,
        items: items.map((i) => ({ description: i.description.trim(), quantity: Number(i.quantity) || 1, unit_amount: Number(i.unit_amount), discount_amount: Number(i.discount_amount) || 0, fee_category_id: i.fee_category_id ? Number(i.fee_category_id) : null })),
      });
      showSuccess('Invoice created'); setTimeout(onSaved, 400);
    } catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };
  return (
    <Modal title="New invoice" subtitle="Manual one-off invoice" onClose={onClose} wide>
      <Toast toast={toast} />
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Search learner"><Input placeholder="Name or admission no..." value={q} onChange={(e) => setQ(e.target.value)} /></Field>
          <Field label="Learner" required><Select value={learnerId} onChange={(e) => setLearnerId(e.target.value)}><option value="">— Select —</option>{filtered.slice(0, 80).map((l) => <option key={l.id} value={l.id}>{l.first_name} {l.last_name} · {l.admission_no}</option>)}</Select></Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Year" required><Select value={yearId} onChange={(e) => setYearId(e.target.value)}>{years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</Select></Field>
          <Field label="Term" required><Select value={termId} onChange={(e) => setTermId(e.target.value)}><option value="">— Select —</option>{terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
          <Field label="Due date"><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
        </div>
        {items.map((it, idx) => (
          <div key={idx} className="grid grid-cols-12 items-end gap-2 rounded-xl border border-slate-200 p-2">
            <div className="col-span-5"><Field label="Description"><Input value={it.description} onChange={(e) => { const c = [...items]; c[idx].description = e.target.value; setItems(c); }} placeholder="e.g. Tuition" /></Field></div>
            <div className="col-span-3"><Field label="Category"><Select value={it.fee_category_id} onChange={(e) => { const c = [...items]; c[idx].fee_category_id = e.target.value; setItems(c); }}><option value="">—</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field></div>
            <div className="col-span-1"><Field label="Qty"><Input type="number" min="1" value={it.quantity} onChange={(e) => { const c = [...items]; c[idx].quantity = e.target.value; setItems(c); }} /></Field></div>
            <div className="col-span-2"><Field label="Amount"><Input type="number" min="0" value={it.unit_amount} onChange={(e) => { const c = [...items]; c[idx].unit_amount = e.target.value; setItems(c); }} /></Field></div>
            <div className="col-span-1"><button onClick={() => setItems(items.filter((_, i) => i !== idx))} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Remove"><XCircle className="h-4 w-4" /></button></div>
          </div>
        ))}
        <div className="flex items-center justify-between">
          <Button size="sm" variant="outline" onClick={() => setItems([...items, { description: '', quantity: 1, unit_amount: '', discount_amount: 0, fee_category_id: '' }])}><Plus className="h-4 w-4" /> Add item</Button>
          <p className="text-sm font-bold">Total: {formatKES(total)}</p>
        </div>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={saving}>Create invoice</Button></div>
      </div>
    </Modal>
  );
}

export function PaymentModal({ invoice, learnerId, onSaved, onClose }: any) {
  const [methods, setMethods] = useState<any[]>([]);
  const [form, setForm] = useState({ amount: invoice ? String(invoice.balance) : '', payment_method: '', payment_date: todayISO(), reference_no: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState<any>(null);
  const { showError, showSuccess, toast } = useToast();
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  useEffect(() => { get('/api/finance?resource=payment-methods').then((m: any[]) => { setMethods(m.filter((x) => x.is_active)); }).catch(() => {}); }, []);
  const submit = async () => {
    if (!(Number(form.amount) > 0) || !form.payment_method) { showError('Amount and payment method are required'); return; }
    if (invoice && Number(form.amount) - Number(invoice.balance) > 0.005) { showError(`Amount exceeds balance of ${formatKES(invoice.balance)}`); return; }
    setSaving(true);
    try {
      const r = await post('/api/finance?resource=payments', {
        learner_id: invoice ? invoice.learner_id : learnerId, invoice_id: invoice?.id || null,
        amount: Number(form.amount), payment_method: form.payment_method, payment_date: form.payment_date,
        reference_no: form.reference_no || null, notes: form.notes || null,
      });
      setReceipt(r.receipt);
      showSuccess(`Payment recorded — receipt ${r.receipt?.receipt_no}`);
    } catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };
  const methodNeedsRef = methods.find((m) => m.name === form.payment_method)?.requires_reference;
  return (
    <Modal title={receipt ? 'Payment complete' : `Record payment${invoice ? ` — ${invoice.invoice_no}` : ''}`} subtitle={invoice ? `Balance due: ${formatKES(invoice.balance)}` : undefined} onClose={onClose}>
      <Toast toast={toast} />
      {receipt ? (
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100"><Receipt className="h-7 w-7 text-emerald-700" /></div>
          <p className="mt-3 font-bold text-slate-900">Receipt {receipt.receipt_no}</p>
          <p className="text-sm text-slate-500">{formatKES(receipt.amount)} received</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="outline" onClick={() => { onClose(); }}>Close</Button>
            <Button onClick={onSaved}>Done</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Amount (KES)" required><Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set('amount', e.target.value)} /></Field>
            <Field label="Date" required><Input type="date" value={form.payment_date} max={todayISO()} onChange={(e) => set('payment_date', e.target.value)} /></Field>
          </div>
          <Field label="Payment method" required><Select value={form.payment_method} onChange={(e) => set('payment_method', e.target.value)}><option value="">— Select —</option>{methods.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}</Select></Field>
          <Field label={`Reference${methodNeedsRef ? ' (required)' : ''}`} required={!!methodNeedsRef}><Input value={form.reference_no} onChange={(e) => set('reference_no', e.target.value)} placeholder="M-Pesa code, bank slip no..." /></Field>
          <Field label="Notes"><Input value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={saving}>Record payment</Button></div>
        </div>
      )}
    </Modal>
  );
}

// ---------- Payments ----------

function PaymentsTab({ canPay }: { canPay: boolean }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [fQ, setFQ] = useState('');
  const [voiding, setVoiding] = useState<any>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidLoading, setVoidLoading] = useState(false);
  const { showSuccess, showError, toast } = useToast();
  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      setRows(await get(`/api/finance?resource=payments&${params.toString()}`));
    } catch (e: any) { showError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); // eslint-disable-next-line
  }, []);
  const doVoid = async () => {
    if (!voidReason.trim()) { showError('A void reason is required'); return; }
    setVoidLoading(true);
    try { await put('/api/finance?resource=payments', { id: voiding.id, status: 'Voided', void_reason: voidReason.trim() }); showSuccess('Payment voided'); setVoiding(null); setVoidReason(''); load(); }
    catch (e: any) { showError(e.message); } finally { setVoidLoading(false); }
  };
  const filtered = rows.filter((r) => !fQ.trim() || `${r.payment_no} ${r.learner_name} ${r.admission_no} ${r.reference_no || ''}`.toLowerCase().includes(fQ.toLowerCase()));
  const total = filtered.filter((r) => r.status === 'Completed').reduce((s, r) => s + Number(r.amount || 0), 0);
  return (
    <div>
      <Toast toast={toast} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="pl-9" placeholder="Search payments..." value={fQ} onChange={(e) => setFQ(e.target.value)} /></div>
        <Input type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} />
        <Button size="sm" variant="outline" onClick={load}>Filter</Button>
        <Button size="sm" variant="outline" onClick={() => downloadCSV('payments.csv', ['Payment', 'Date', 'Learner', 'Admission', 'Invoice', 'Method', 'Reference', 'Amount', 'Status'], filtered.map((r) => [r.payment_no, r.payment_date, r.learner_name, r.admission_no, r.invoice_no, r.payment_method, r.reference_no || '', r.amount, r.status]))}><Download className="h-4 w-4" /> CSV</Button>
        <span className="ml-auto text-sm font-bold">Total: {formatKES(total)}</span>
      </div>
      {loading ? <Spinner /> : filtered.length === 0 ? <EmptyState title="No payments" subtitle="Record payments from an invoice." /> : (
        <Card><div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm">
          <thead><tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3">Payment</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Learner</th><th className="px-4 py-3">Method</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Status</th>{canPay && <th className="px-4 py-3 text-right">Actions</th>}
          </tr></thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-2.5"><p className="font-mono text-xs font-bold">{r.payment_no}</p><p className="text-xs text-slate-400">{r.invoice_no || 'Unallocated'}{r.reference_no ? ` · ${r.reference_no}` : ''}</p></td>
                <td className="px-4 py-2.5 text-xs">{formatDate(r.payment_date)}</td>
                <td className="px-4 py-2.5"><p className="font-medium">{r.learner_name}</p><p className="font-mono text-xs text-slate-400">{r.admission_no}</p></td>
                <td className="px-4 py-2.5">{r.payment_method}</td>
                <td className="px-4 py-2.5 text-right font-semibold">{formatKES(r.amount)}</td>
                <td className="px-4 py-2.5"><Badge tone={r.status === 'Completed' ? 'green' : 'slate'}>{r.status}</Badge></td>
                {canPay && <td className="px-4 py-2.5 text-right">{r.status === 'Completed' && <button onClick={() => setVoiding(r)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Void payment"><Ban className="h-4 w-4" /></button>}</td>}
              </tr>
            ))}
          </tbody>
        </table></div></Card>
      )}
      {voiding && (
        <Modal title={`Void payment ${voiding.payment_no}`} subtitle="The invoice balance will be restored. This is audit-logged." onClose={() => setVoiding(null)}>
          <Field label="Void reason" required><Textarea rows={2} value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="e.g. Duplicate M-Pesa entry, wrong learner..." /></Field>
          <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={() => setVoiding(null)}>Cancel</Button><Button variant="danger" onClick={doVoid} loading={voidLoading}>Void payment</Button></div>
        </Modal>
      )}
    </div>
  );
}

// ---------- Receipts ----------

function ReceiptsTab({ canPay }: { canPay: boolean }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fQ, setFQ] = useState('');
  const { showError, toast } = useToast();
  useEffect(() => {
    get('/api/finance?resource=receipts').then(setRows).catch((e) => showError(e.message)).finally(() => setLoading(false));
    // eslint-disable-next-line
  }, []);
  const openReceipt = async (id: number) => {
    try {
      const r = await get(`/api/finance?resource=receipts&id=${id}`);
      const p = r.payment || {};
      printHTML(`Receipt ${r.receipt_no}`,
        schoolHeadHTML(r.school || {}, 'PAYMENT RECEIPT', r.receipt_no) +
        learnerMetaHTML(r.learner, [['Receipt date', formatDate(p.payment_date)], ['Method', p.payment_method || '—'], ['Invoice', r.invoice?.invoice_no || '—']]) +
        `<table><tbody>` +
        `<tr><th style=\"width:40%\">Amount received</th><td class=\"total\">${formatKES(r.amount)}</td></tr>` +
        `<tr><th>Reference</th><td>${p.reference_no || '—'}</td></tr>` +
        `<tr><th>Notes</th><td>${p.notes || '—'}</td></tr>` +
        `</tbody></table>` +
        `<div class=\"foot\"><span>Received by: ______________________</span><span class=\"stamp\">PAID</span></div>`);
    } catch (e: any) { showError(e.message); }
  };
  const filtered = rows.filter((r) => !fQ.trim() || r.receipt_no.toLowerCase().includes(fQ.toLowerCase()));
  return (
    <div>
      <Toast toast={toast} />
      <div className="mb-4 max-w-xs"><Input placeholder="Search receipt no..." value={fQ} onChange={(e) => setFQ(e.target.value)} /></div>
      {loading ? <Spinner /> : filtered.length === 0 ? <EmptyState title="No receipts" subtitle="Receipts are generated automatically with every payment." /> : (
        <Card><div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm">
          <thead><tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3">Receipt</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Issued</th><th className="px-4 py-3 text-right">Actions</th>
          </tr></thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-2.5 font-mono text-xs font-bold">{r.receipt_no}</td>
                <td className="px-4 py-2.5 text-right font-semibold">{formatKES(r.amount)}</td>
                <td className="px-4 py-2.5 text-xs">{formatDate(r.created_at)}</td>
                <td className="px-4 py-2.5 text-right"><Button size="sm" variant="outline" onClick={() => openReceipt(r.id)}><Printer className="h-3.5 w-3.5" /> Print / PDF</Button></td>
              </tr>
            ))}
          </tbody>
        </table></div></Card>
      )}
      {canPay === false && <p className="mt-2 text-xs text-slate-400">Read-only access.</p>}
    </div>
  );
}

// ---------- Reports ----------

function ReportsTab() {
  const [kind, setKind] = useState('daily');
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { showError, toast } = useToast();
  const run = async () => {
    setLoading(true);
    try { setData(await get(`/api/finance?resource=reports&kind=${kind}&from=${from}&to=${to}`)); }
    catch (e: any) { showError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => {
    if (kind === 'term') { setFrom(''); setTo(todayISO()); }
    if (kind === 'daily') { setFrom(todayISO()); setTo(todayISO()); }
    // eslint-disable-next-line
  }, [kind]);
  const printReport = () => {
    if (!data) return;
    let body = '';
    if (kind === 'daily' || kind === 'term') {
      body = `<h2>${kind === 'daily' ? 'Daily' : 'Term'} collection report (${data.from} → ${data.to})</h2>` +
        `<p>Total: <strong>${formatKES(data.total)}</strong> from ${data.count} payment(s)</p>` +
        `<table><thead><tr><th>Payment</th><th>Date</th><th>Method</th><th class=\"right\">Amount</th></tr></thead><tbody>` +
        (data.payments || []).map((p: any) => `<tr><td>${p.payment_no}</td><td>${p.payment_date}</td><td>${p.payment_method}</td><td class=\"right\">${formatKES(p.amount)}</td></tr>`).join('') + `</tbody></table>`;
    } else if (kind === 'outstanding' || kind === 'arrears') {
      body = `<h2>Outstanding balances / arrears</h2><p>Total: <strong>${formatKES(data.total)}</strong> across ${data.count} invoice(s)</p>` +
        `<table><thead><tr><th>Invoice</th><th>Learner</th><th>Due</th><th class=\"right\">Balance</th></tr></thead><tbody>` +
        (data.rows || []).map((r: any) => `<tr><td>${r.invoice_no}</td><td>${r.learner ? r.learner.first_name + ' ' + r.learner.last_name + ' (' + r.learner.admission_no + ')' : ''}</td><td>${r.due_date || '—'}</td><td class=\"right\">${formatKES(r.balance)}</td></tr>`).join('') + `</tbody></table>`;
    } else {
      body = `<h2>Discounts & scholarships</h2><p>${(data.invoice_discounts || []).length} discounted invoice(s) · ${(data.scholarships || []).length} scholarship(s) · ${(data.discounts || []).length} discount rule(s)</p>`;
    }
    printHTML(`Finance report — ${kind}`, body);
  };
  const exportCSV = () => {
    if (!data) return;
    if (kind === 'daily' || kind === 'term') downloadCSV(`${kind}_collections.csv`, ['Payment', 'Date', 'Method', 'Amount'], (data.payments || []).map((p: any) => [p.payment_no, p.payment_date, p.payment_method, p.amount]));
    else if (kind === 'outstanding' || kind === 'arrears') downloadCSV('outstanding.csv', ['Invoice', 'Learner', 'Admission', 'Due', 'Balance'], (data.rows || []).map((r: any) => [r.invoice_no, r.learner ? `${r.learner.first_name} ${r.learner.last_name}` : '', r.learner?.admission_no || '', r.due_date || '', r.balance]));
  };
  return (
    <div>
      <Toast toast={toast} />
      <Card className="mb-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Report"><Select value={kind} onChange={(e) => setKind(e.target.value)}><option value="daily">Daily collections</option><option value="term">Term collections</option><option value="outstanding">Outstanding balances</option><option value="arrears">Fee arrears</option><option value="discounts">Discounts & scholarships</option></Select></Field>
          {(kind === 'daily' || kind === 'term' || kind === 'discounts') && (<>
            <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          </>)}
          <div className="flex items-end gap-2"><Button onClick={run} loading={loading}>Run report</Button></div>
        </div>
      </Card>
      {!data ? <EmptyState title="No report yet" subtitle="Choose a report and run it." /> : (
        <Card className="p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="font-bold">
              {(kind === 'daily' || kind === 'term') && <>Total: {formatKES(data.total)} · {data.count} payment(s)</>}
              {(kind === 'outstanding' || kind === 'arrears') && <>Outstanding: {formatKES(data.total)} · {data.count} invoice(s)</>}
              {kind === 'discounts' && <>{(data.invoice_discounts || []).length} discounted invoice(s)</>}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={exportCSV}><Download className="h-4 w-4" /> CSV</Button>
              <Button size="sm" variant="outline" onClick={printReport}><Printer className="h-4 w-4" /> Print / PDF</Button>
            </div>
          </div>
          {(kind === 'daily' || kind === 'term') && (
            <div className="mb-3 flex flex-wrap gap-2">{Object.entries(data.by_method || {}).map(([m, v]: any) => <Badge key={m} tone="blue">{m}: {formatKES(v)}</Badge>)}</div>
          )}
          {(kind === 'daily' || kind === 'term') && (
            <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-200"><table className="w-full text-left text-sm">
              <thead><tr className="bg-slate-50 text-xs uppercase text-slate-500"><th className="px-3 py-2">Payment</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Method</th><th className="px-3 py-2 text-right">Amount</th></tr></thead>
              <tbody>{(data.payments || []).map((p: any) => <tr key={p.id} className="border-t border-slate-100"><td className="px-3 py-2 font-mono text-xs">{p.payment_no}</td><td className="px-3 py-2">{p.payment_date}</td><td className="px-3 py-2">{p.payment_method}</td><td className="px-3 py-2 text-right font-semibold">{formatKES(p.amount)}</td></tr>)}</tbody>
            </table></div>
          )}
          {(kind === 'outstanding' || kind === 'arrears') && (
            <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-200"><table className="w-full text-left text-sm">
              <thead><tr className="bg-slate-50 text-xs uppercase text-slate-500"><th className="px-3 py-2">Invoice</th><th className="px-3 py-2">Learner</th><th className="px-3 py-2">Due</th><th className="px-3 py-2 text-right">Balance</th></tr></thead>
              <tbody>{(data.rows || []).map((r: any) => <tr key={r.id} className="border-t border-slate-100"><td className="px-3 py-2 font-mono text-xs">{r.invoice_no}</td><td className="px-3 py-2">{r.learner ? `${r.learner.first_name} ${r.learner.last_name}` : ''}</td><td className="px-3 py-2">{r.due_date || '—'}</td><td className="px-3 py-2 text-right font-semibold">{formatKES(r.balance)}</td></tr>)}</tbody>
            </table></div>
          )}
          {kind === 'discounts' && (
            <div className="space-y-3">
              <p className="text-sm font-semibold">Invoice discounts ({(data.invoice_discounts || []).length})</p>
              <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200"><table className="w-full text-left text-sm">
                <thead><tr className="bg-slate-50 text-xs uppercase text-slate-500"><th className="px-3 py-2">Invoice</th><th className="px-3 py-2">Date</th><th className="px-3 py-2 text-right">Discount</th></tr></thead>
                <tbody>{(data.invoice_discounts || []).map((d: any) => <tr key={d.id} className="border-t border-slate-100"><td className="px-3 py-2 font-mono text-xs">{d.invoice_no}</td><td className="px-3 py-2">{d.issue_date}</td><td className="px-3 py-2 text-right">{formatKES(d.discount_total)}</td></tr>)}</tbody>
              </table></div>
              <p className="text-sm font-semibold">Scholarships ({(data.scholarships || []).length})</p>
              {(data.scholarships || []).map((s: any) => <div key={s.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">{s.name} — {s.value_type === 'Percent' ? `${s.value}%` : formatKES(s.value)}</div>)}
              <p className="text-sm font-semibold">Discount rules ({(data.discounts || []).length})</p>
              {(data.discounts || []).map((s: any) => <div key={s.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">{s.name} — {s.value_type === 'Percent' ? `${s.value}%` : formatKES(s.value)}</div>)}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ---------- Settings ----------

function SettingsTab() {
  const [cats, setCats] = useState<any[]>([]);
  const [methods, setMethods] = useState<any[]>([]);
  const [seqs, setSeqs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCat, setShowCat] = useState(false);
  const [showMethod, setShowMethod] = useState(false);
  const [showSeq, setShowSeq] = useState(false);
  const { showSuccess, showError, toast } = useToast();
  const load = async () => {
    setLoading(true);
    try {
      const [c, m, s] = await Promise.all([
        get('/api/finance?resource=fee-categories'), get('/api/finance?resource=payment-methods'), get('/api/finance?resource=sequences'),
      ]);
      setCats(c); setMethods(m); setSeqs(s);
    } catch (e: any) { showError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); // eslint-disable-next-line
  }, []);
  if (loading) return <Spinner />;
  return (
    <div>
      <Toast toast={toast} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between"><p className="text-sm font-bold">Fee categories</p><Button size="sm" variant="outline" onClick={() => setShowCat(true)}><Plus className="h-3.5 w-3.5" /></Button></div>
          <div className="space-y-1.5">{cats.map((c) => <div key={c.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"><span>{c.name} {c.code && <span className="font-mono text-xs text-slate-400">· {c.code}</span>}</span><Badge tone={c.is_active ? 'green' : 'slate'}>{c.is_active ? 'Active' : 'Off'}</Badge></div>)}{!cats.length && <p className="text-sm text-slate-400">None yet.</p>}</div>
        </Card>
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between"><p className="text-sm font-bold">Payment methods</p><Button size="sm" variant="outline" onClick={() => setShowMethod(true)}><Plus className="h-3.5 w-3.5" /></Button></div>
          <div className="space-y-1.5">{methods.map((m) => <div key={m.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"><span>{m.name}{m.requires_reference && <span className="text-xs text-slate-400"> · ref required</span>}</span><Badge tone={m.is_active ? 'green' : 'slate'}>{m.is_active ? 'Active' : 'Off'}</Badge></div>)}{!methods.length && <p className="text-sm text-slate-400">None yet.</p>}</div>
        </Card>
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between"><p className="text-sm font-bold">Document numbering</p><Button size="sm" variant="outline" onClick={() => setShowSeq(true)}><Plus className="h-3.5 w-3.5" /></Button></div>
          <div className="space-y-1.5">{seqs.map((s) => <div key={s.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"><span className="font-mono text-xs">{s.kind}: {s.prefix}/…/{String(s.next_number).padStart(s.padding || 4, '0')}</span>{s.is_default && <Badge tone="emerald">Default</Badge>}</div>)}{!seqs.length && <p className="text-sm text-slate-400">Auto-numbering in use.</p>}</div>
        </Card>
      </div>
      {showCat && <SimpleAddModal title="New fee category" fields={[['name', 'Name', 'e.g. Tuition'], ['code', 'Code', 'e.g. TUIT']]} onSave={async (v: any) => { await post('/api/finance?resource=fee-categories', v); showSuccess('Category added'); }} onDone={() => { setShowCat(false); load(); }} onClose={() => setShowCat(false)} />}
      {showMethod && <SimpleAddModal title="New payment method" fields={[['name', 'Name', 'e.g. M-Pesa']]} checkLabel="Requires reference" onSave={async (v: any) => { await post('/api/finance?resource=payment-methods', v); showSuccess('Method added'); }} onDone={() => { setShowMethod(false); load(); }} onClose={() => setShowMethod(false)} />}
      {showSeq && <SequenceModal onDone={() => { setShowSeq(false); load(); }} onClose={() => setShowSeq(false)} />}
    </div>
  );
}

function SimpleAddModal({ title, fields, checkLabel, onSave, onDone, onClose }: any) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const { showError, toast } = useToast();
  const save = async () => {
    if (!vals[fields[0][0]]?.trim()) { showError('Name is required'); return; }
    setSaving(true);
    try { await onSave({ ...vals, ...(checkLabel ? { requires_reference: checked } : {}) }); setTimeout(onDone, 300); }
    catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };
  return (
    <Modal title={title} onClose={onClose}>
      <Toast toast={toast} />
      <div className="space-y-3">
        {fields.map(([k, label, ph]: string[]) => <Field key={k} label={label}><Input value={vals[k] || ''} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} placeholder={ph} /></Field>)}
        {checkLabel && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="h-4 w-4 accent-emerald-700" /> {checkLabel}</label>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={saving}>Save</Button></div>
      </div>
    </Modal>
  );
}

function SequenceModal({ onDone, onClose }: any) {
  const [form, setForm] = useState({ kind: 'invoice', prefix: 'INV', next_number: 1, padding: 4, is_default: true });
  const [saving, setSaving] = useState(false);
  const { showError, showSuccess, toast } = useToast();
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const save = async () => {
    setSaving(true);
    try { await post('/api/finance?resource=sequences', form); showSuccess('Numbering saved'); setTimeout(onDone, 300); }
    catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };
  return (
    <Modal title="Document numbering" subtitle="Configurable invoice / payment / receipt numbers" onClose={onClose}>
      <Toast toast={toast} />
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Document"><Select value={form.kind} onChange={(e) => { set('kind', e.target.value); set('prefix', e.target.value === 'invoice' ? 'INV' : e.target.value === 'payment' ? 'PAY' : 'RCP'); }}><option value="invoice">Invoice</option><option value="payment">Payment</option><option value="receipt">Receipt</option></Select></Field>
          <Field label="Prefix"><Input value={form.prefix} onChange={(e) => set('prefix', e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Next number"><Input type="number" min="1" value={form.next_number} onChange={(e) => set('next_number', Number(e.target.value))} /></Field>
          <Field label="Padding"><Input type="number" min="1" max="8" value={form.padding} onChange={(e) => set('padding', Number(e.target.value))} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_default} onChange={(e) => set('is_default', e.target.checked)} className="h-4 w-4 accent-emerald-700" /> Use as default</label>
        <p className="text-xs text-slate-500">Preview: {form.prefix}/{new Date().getFullYear()}/{String(form.next_number).padStart(form.padding, '0')}</p>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={saving}>Save</Button></div>
      </div>
    </Modal>
  );
}

// ---------- Parent / learner portal ----------

function ParentPortalTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statementFor, setStatementFor] = useState<number | null>(null);
  const { showError, toast } = useToast();
  useEffect(() => {
    get('/api/phase3-dashboard?view=parent-finance').then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);
  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} />;
  const kids = data.mode === 'learner' ? (data.learner ? [{ learner: data.learner, invoices: data.invoices, payments: data.payments, outstanding: data.outstanding }] : []) : (data.children || []);
  const openReceipt = async (id: number) => {
    try {
      const r = await get(`/api/finance?resource=receipts&id=${id}`);
      const p = r.payment || {};
      printHTML(`Receipt ${r.receipt_no}`,
        schoolHeadHTML(r.school || {}, 'PAYMENT RECEIPT', r.receipt_no) +
        learnerMetaHTML(r.learner, [['Receipt date', formatDate(p.payment_date)], ['Method', p.payment_method || '—'], ['Invoice', r.invoice?.invoice_no || '—']]) +
        `<table><tbody><tr><th style=\"width:40%\">Amount received</th><td class=\"total\">${formatKES(r.amount)}</td></tr><tr><th>Reference</th><td>${p.reference_no || '—'}</td></tr></tbody></table>` +
        `<div class=\"foot\"><span>Received by: ______________________</span><span class=\"stamp\">PAID</span></div>`);
    } catch (e: any) { showError(e.message); }
  };
  return (
    <div>
      <Toast toast={toast} />
      {kids.length === 0 && <EmptyState title="No fee records" subtitle="No learners are linked to your account yet." />}
      <div className="space-y-4">
        {kids.map((c: any) => (
          <Card key={c.learner.id}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
              <div>
                <p className="font-bold">{c.learner.first_name} {c.learner.last_name} <span className="font-mono text-xs font-normal text-slate-400">· {c.learner.admission_no}</span></p>
                <p className="text-sm">Outstanding balance: <span className={`font-bold ${c.outstanding > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{formatKES(c.outstanding)}</span></p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setStatementFor(c.learner.id)}><FileText className="h-3.5 w-3.5" /> Full statement</Button>
            </div>
            <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-bold uppercase text-slate-400">Invoices ({c.invoices.length})</p>
                <div className="space-y-1.5">
                  {c.invoices.map((i: any) => (
                    <div key={i.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                      <span className="font-mono text-xs font-bold">{i.invoice_no}<span className="ml-2 font-sans font-normal text-slate-500">due {formatDate(i.due_date)}</span></span>
                      <span className="flex items-center gap-2"><span className="font-semibold">{formatKES(i.balance)}</span><Badge tone={statusTone(i.status) as any}>{i.status}</Badge></span>
                    </div>
                  ))}
                  {!c.invoices.length && <p className="text-sm text-slate-400">No invoices.</p>}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-bold uppercase text-slate-400">Payments ({c.payments.length})</p>
                <div className="space-y-1.5">
                  {c.payments.slice(0, 6).map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                      <span>{p.payment_no} · {p.payment_method} · {formatDate(p.payment_date)}</span>
                      <span className="font-semibold text-emerald-700">{formatKES(p.amount)}</span>
                    </div>
                  ))}
                  {!c.payments.length && <p className="text-sm text-slate-400">No payments yet.</p>}
                </div>
              </div>
            </div>
          </Card>
        ))}
        {(data.receipts || []).length > 0 && (
          <Card className="p-5">
            <p className="mb-2 text-xs font-bold uppercase text-slate-400">Receipts</p>
            <div className="flex flex-wrap gap-2">
              {(data.receipts || []).slice(0, 12).map((r: any) => (
                <button key={r.id} onClick={() => openReceipt(r.id)} className="rounded-xl border border-slate-200 px-3 py-2 text-left text-sm hover:border-emerald-400">
                  <span className="font-mono font-bold">{r.receipt_no}</span> <span className="text-slate-500">· {formatKES(r.amount)}</span>
                </button>
              ))}
            </div>
          </Card>
        )}
      </div>
      {statementFor !== null && <StatementModal learnerId={statementFor} onClose={() => setStatementFor(null)} />}
    </div>
  );
}

export function StatementModal({ learnerId, onClose }: { learnerId: number; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [years, setYears] = useState<any[]>([]);
  const [terms, setTerms] = useState<any[]>([]);
  const [yearId, setYearId] = useState('');
  const [termId, setTermId] = useState('');
  const [loading, setLoading] = useState(true);
  const { showError, toast } = useToast();
  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ learner_id: String(learnerId) });
      if (yearId) params.set('academic_year_id', yearId);
      if (termId) params.set('term_id', termId);
      setData(await get(`/api/finance?resource=statement&${params.toString()}`));
    } catch (e: any) { showError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => {
    get('/api/academic?resource=years').then(setYears).catch(() => {});
    get('/api/academic?resource=terms').then(setTerms).catch(() => {});
    // eslint-disable-next-line
  }, []);
  useEffect(() => { load(); // eslint-disable-next-line
  }, [learnerId, yearId, termId]);
  const print = () => {
    if (!data) return;
    const s = data.summary;
    const rows = data.lines.map((l: any) => `<tr><td>${l.date || '—'}</td><td>${l.type}</td><td>${l.ref}</td><td>${l.description}</td><td class=\"right\">${l.debit ? formatKES(l.debit) : '—'}</td><td class=\"right\">${l.credit ? formatKES(l.credit) : '—'}</td></tr>`).join('');
    printHTML(`Statement ${data.learner?.admission_no}`,
      schoolHeadHTML({}, 'LEARNER FEE STATEMENT', data.learner?.admission_no || '') +
      learnerMetaHTML(data.learner, [['Charges', formatKES(s.charges)], ['Discounts', formatKES(s.discounts)], ['Paid', formatKES(s.payments)]]) +
      `<table><thead><tr><th>Date</th><th>Type</th><th>Ref</th><th>Description</th><th class=\"right\">Debit</th><th class=\"right\">Credit</th></tr></thead><tbody>${rows}</tbody></table>` +
      `<div style=\"text-align:right;font-size:15px;\">Adjustments (net): ${formatKES(s.adjustments_net)}<br/><span class=\"total\">Current balance: ${formatKES(s.balance)}</span></div>`);
  };
  return (
    <Modal title="Learner statement" subtitle={data?.learner ? `${fullName(data.learner)} · ${data.learner.admission_no}` : undefined} onClose={onClose} wide>
      <Toast toast={toast} />
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Year"><Select value={yearId} onChange={(e) => setYearId(e.target.value)}><option value="">All years</option>{years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</Select></Field>
        <Field label="Term"><Select value={termId} onChange={(e) => setTermId(e.target.value)}><option value="">All terms</option>{terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
        <div className="col-span-2 flex items-end justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => data && downloadCSV(`statement_${data.learner?.admission_no}.csv`, ['Date', 'Type', 'Ref', 'Description', 'Debit', 'Credit'], data.lines.map((l: any) => [l.date, l.type, l.ref, l.description, l.debit, l.credit]))}><Download className="h-4 w-4" /> CSV</Button>
          <Button size="sm" variant="outline" onClick={print}><Printer className="h-4 w-4" /> Print / PDF</Button>
        </div>
      </div>
      {loading ? <Spinner /> : !data ? <EmptyState title="No data" /> : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
            <div className="rounded-xl bg-slate-50 p-2.5 text-center"><p className="text-xs text-slate-500">Charges</p><p className="font-bold">{formatKES(data.summary.charges)}</p></div>
            <div className="rounded-xl bg-slate-50 p-2.5 text-center"><p className="text-xs text-slate-500">Discounts</p><p className="font-bold">{formatKES(data.summary.discounts)}</p></div>
            <div className="rounded-xl bg-slate-50 p-2.5 text-center"><p className="text-xs text-slate-500">Payments</p><p className="font-bold text-emerald-700">{formatKES(data.summary.payments)}</p></div>
            <div className="rounded-xl bg-slate-50 p-2.5 text-center"><p className="text-xs text-slate-500">Adjustments</p><p className="font-bold">{formatKES(data.summary.adjustments_net)}</p></div>
            <div className="rounded-xl bg-rose-50 p-2.5 text-center"><p className="text-xs text-slate-500">Balance</p><p className="font-bold text-rose-700">{formatKES(data.summary.balance)}</p></div>
          </div>
          <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-200"><table className="w-full text-left text-sm">
            <thead><tr className="bg-slate-50 text-xs uppercase text-slate-500"><th className="px-3 py-2">Date</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Ref</th><th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th></tr></thead>
            <tbody>{data.lines.map((l: any, i: number) => <tr key={i} className="border-t border-slate-100"><td className="px-3 py-2 text-xs">{l.date || '—'}</td><td className="px-3 py-2"><Badge tone={l.type === 'Payment' ? 'green' : l.type === 'Charge' ? 'blue' : 'amber'}>{l.type}</Badge></td><td className="px-3 py-2 font-mono text-xs">{l.ref}</td><td className="px-3 py-2 text-right">{l.debit ? formatKES(l.debit) : '—'}</td><td className="px-3 py-2 text-right">{l.credit ? formatKES(l.credit) : '—'}</td></tr>)}</tbody>
          </table></div>
        </>
      )}
    </Modal>
  );
}
