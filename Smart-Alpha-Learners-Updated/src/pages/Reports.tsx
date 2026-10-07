import { todayISO } from '../lib/constants';
import { useState, useEffect } from 'react';
import { BarChart3, Download, Printer } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { get } from '../lib/api';
import { Card, Button, Spinner, ErrorState, EmptyState, PageHeader, Toast, useToast } from '../components/ui';
import { downloadCSV, printHTML } from '../lib/finance';

export default function Reports() {
  const { roleName } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { showError, toast } = useToast();
  const load = async () => {
    setLoading(true); setError('');
    try { setData(await get('/api/phase3-dashboard?view=reports')); }
    catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); // eslint-disable-next-line
  }, []);
  const exportAll = () => {
    if (!data) return;
    const rows: any[][] = [];
    data.cards.forEach((c: any) => c.rows.forEach((r: any) => rows.push([c.title, r[0], r[1]])));
    downloadCSV('role_report.csv', ['Section', 'Metric', 'Value'], rows);
  };
  const printAll = () => {
    if (!data) return;
    const body = `<h2>Role report — ${roleName} (${todayISO()})</h2>` +
      data.cards.map((c: any) => `<h3>${c.title}</h3><table><tbody>` + c.rows.map((r: any) => `<tr><th style="width:50%">${r[0]}</th><td>${r[1]}</td></tr>`).join('') + `</tbody></table>`).join('');
    printHTML('Role report', body);
  };
  return (
    <div>
      <Toast toast={toast} />
      <PageHeader
        title="Reports Hub"
        subtitle={`Role-specific summaries for ${roleName} — finance detail stays restricted to authorised roles`}
        actions={data && data.cards.length > 0 && (<><Button size="sm" variant="outline" onClick={exportAll}><Download className="h-4 w-4" /> CSV</Button><Button size="sm" variant="outline" onClick={printAll}><Printer className="h-4 w-4" /> Print / PDF</Button></>)}
      />
      {loading ? <Spinner /> : error ? <ErrorState message={error} onRetry={load} /> : !data.cards.length ? (
        <EmptyState title="No reports available" subtitle="Your role has no report cards assigned." icon={<BarChart3 className="h-8 w-8 text-slate-300" />} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {data.cards.map((c: any) => (
            <Card key={c.key} className="p-5">
              <p className="mb-3 text-sm font-bold text-slate-900">{c.title}</p>
              <div className="space-y-1.5">
                {c.rows.map(([k, v]: any, i: number) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <span className="text-slate-500">{k}</span>
                    <span className="font-semibold text-slate-900">{v}</span>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
