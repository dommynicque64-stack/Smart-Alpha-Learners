import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { get } from '../lib/api';
import { Card, Input, Select, Spinner, ErrorState, EmptyState, PageHeader, Badge, Button } from '../components/ui';
import { formatDateTime } from '../lib/constants';

const ENTITY_TYPES = ['app_users', 'schools', 'academic_years', 'terms', 'levels', 'grades', 'streams', 'learners', 'parents', 'teachers', 'attendance_records', 'curriculum_versions', 'learning_areas', 'strands', 'learning_outcomes', 'competencies', 'core_values', 'pertinent_contemporary_issues', 'timetable_slots', 'roles', 'storage', 'fee_categories', 'fee_structures', 'fee_items', 'invoices', 'invoice_items', 'payments', 'receipts', 'financial_adjustments', 'scholarships', 'discounts', 'announcements', 'messages', 'notifications', 'school_events', 'discipline_records', 'staff_records', 'leave_records', 'library_books', 'library_transactions', 'inventory_items', 'vehicles', 'drivers', 'transport_routes', 'transport_assignments', 'transport_attendance'];

function toneFor(action: string) {
  if (action.includes('delete') || action.includes('void') || action.includes('cancel')) return 'red';
  if (action.includes('create') || action.includes('bootstrap') || action.includes('payment_record')) return 'green';
  if (action.includes('login') || action.includes('logout')) return 'blue';
  if (action.includes('password') || action.includes('activate') || action.includes('adjustment')) return 'amber';
  return 'slate';
}

export default function AuditLog() {
  const [rows, setRows] = useState<any[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fAction, setFAction] = useState('');
  const [fEntity, setFEntity] = useState('');
  const [fUser, setFUser] = useState('');
  const pageSize = 50;

  const load = async (p = page) => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: String(p), page_size: String(pageSize) });
      if (fAction.trim()) params.set('action', fAction.trim());
      if (fEntity) params.set('entity_type', fEntity);
      if (fUser.trim()) params.set('user_email', fUser.trim());
      const res = await get(`/api/audit?${params.toString()}`);
      setRows(res.rows); setCount(res.count); setPage(res.page);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  useEffect(() => { load(1); // eslint-disable-next-line
  }, []);

  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  return (
    <div>
      <PageHeader title="Audit Log" subtitle={`${count} recorded action(s) — who did what, when`} />
      <Card className="mb-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input className="pl-9" placeholder="Filter by action..." value={fAction} onChange={(e) => setFAction(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(1)} />
          </div>
          <Select value={fEntity} onChange={(e) => setFEntity(e.target.value)}><option value="">All entity types</option>{ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</Select>
          <Input placeholder="Filter by user email..." value={fUser} onChange={(e) => setFUser(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(1)} />
          <div className="flex gap-2">
            <Button onClick={() => load(1)}>Apply</Button>
            <Button variant="secondary" onClick={() => { setFAction(''); setFEntity(''); setFUser(''); setTimeout(() => load(1), 50); }}>Clear</Button>
          </div>
        </div>
      </Card>
      {loading ? <Spinner /> : error ? <ErrorState message={error} onRetry={() => load(page)} /> : rows.length === 0 ? (
        <EmptyState title="No audit records" subtitle="Actions across the system will appear here." />
      ) : (
        <>
          <Card><div className="overflow-x-auto"><table className="w-full min-w-[860px] text-left text-sm">
            <thead><tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Timestamp</th><th className="px-4 py-3">User</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Entity</th><th className="px-4 py-3">Record</th><th className="px-4 py-3">Prev → New</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500">{formatDateTime(r.created_at)}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-700">{r.user_email || '—'}</td>
                  <td className="px-4 py-2.5"><Badge tone={toneFor(r.action) as any}>{r.action}</Badge></td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{r.entity_type || '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{r.record_id || '—'}</td>
                  <td className="max-w-64 truncate px-4 py-2.5 font-mono text-[11px] text-slate-500" title={r.details ? JSON.stringify(r.details, null, 1) : ''}>
                    {r.details && (r.details.previous !== undefined || r.details.new !== undefined)
                      ? `${JSON.stringify(r.details.previous ?? '∅').slice(0, 60)} → ${JSON.stringify(r.details.new ?? '∅').slice(0, 60)}`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div></Card>
          <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
            <span>Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => load(page - 1)}>Previous</Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => load(page + 1)}>Next</Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
