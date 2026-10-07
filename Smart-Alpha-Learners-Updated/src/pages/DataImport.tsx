import { useState, useEffect } from 'react';
import { Upload, Download, AlertTriangle, CheckCircle2, FileSpreadsheet } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { post, get } from '../lib/api';
import { Card, Button, Select, Field, Badge, PageHeader, Tabs, useToast, Toast } from '../components/ui';

const ENTITIES = [
  { key: 'learners', label: 'Learners', headers: 'admission_no,first_name,middle_name,last_name,gender,dob,grade,stream,admission_date,previous_school,emergency_contact_name,emergency_contact_phone', sample: 'ELM/2026/001,Brian,,Otieno,Male,2015-03-12,G7,East,2026-01-06,,Mary Otieno,+254700000000' },
  { key: 'parents', label: 'Parents', headers: 'first_name,last_name,national_id,phone,alt_phone,email,address,county,occupation,guardian_type', sample: 'Mary,Otieno,12345678,+254700000000,,mary@example.com,,Kisumu,Teacher,Mother' },
  { key: 'teachers', label: 'Teachers', headers: 'staff_no,tsc_no,first_name,last_name,phone,email,qualification,specialization,employment_type,date_joined', sample: 'T001,123456,Jane,Wanjiru,+254711000000,jane@school.ac.ke,B.Ed,Mathematics,Full-time,2024-01-15' },
  { key: 'streams', label: 'Streams/Classes', headers: 'grade,stream,academic_year,capacity', sample: 'G7,East,2026,45' },
];

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return { headers: [], rows: [] };
  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === ',' && !inQ) { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const headers = splitLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const rows = lines.slice(1).map((line) => {
    const cells = splitLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (cells[i] || '').trim(); });
    return row;
  });
  return { headers, rows };
}

export default function DataImport() {
  const { can } = useAuth();
  const [entity, setEntity] = useState('learners');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [result, setResult] = useState<any>(null);
  const [validating, setValidating] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [gradeHint, setGradeHint] = useState('');
  const { showSuccess, showError, toast } = useToast();

  useEffect(() => {
    if (entity === 'learners' || entity === 'streams') {
      get('/api/academic?resource=grades').then((g: any[]) => setGradeHint(g.map((x) => x.code || x.name).join(', '))).catch(() => {});
    }
  }, [entity]);

  const meta = ENTITIES.find((e) => e.key === entity)!;

  const downloadTemplate = () => {
    const blob = new Blob([`${meta.headers}\n${meta.sample}\n`], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${entity}_template.csv`;
    a.click();
  };

  const onFile = async (file: File) => {
    setFileName(file.name);
    setResult(null);
    const text = await file.text();
    const { rows } = parseCSV(text);
    setRows(rows);
  };

  const validate = async () => {
    if (!rows.length) { showError('Load a CSV file first'); return; }
    setValidating(true);
    try {
      const res = await post('/api/import', { entity, rows, commit: false });
      setResult(res);
      if (res.error_count === 0) showSuccess(`${res.valid_count} row(s) valid — ready to import`);
      else showError(`${res.error_count} row(s) have errors — fix them before importing`);
    } catch (e: any) { showError(e.message); } finally { setValidating(false); }
  };

  const commit = async () => {
    if (!rows.length) return;
    setCommitting(true);
    try {
      const res = await post('/api/import', { entity, rows, commit: true });
      setResult(null);
      setRows([]);
      setFileName('');
      showSuccess(`Imported ${res.inserted} record(s)${res.skipped ? `, ${res.skipped} skipped` : ''}`);
    } catch (e: any) { showError(e.message); } finally { setCommitting(false); }
  };

  if (!can('import.run')) return <PageHeader title="Data Import" subtitle="You do not have permission to run imports." />;

  return (
    <div>
      <Toast toast={toast} />
      <PageHeader title="Data Import" subtitle="Bulk-load learners, parents, teachers and streams from CSV with server-side validation" />
      <Tabs tabs={ENTITIES.map((e) => ({ key: e.key, label: e.label }))} active={entity} onChange={(k) => { setEntity(k); setRows([]); setResult(null); setFileName(''); }} />
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500"><FileSpreadsheet className="h-4 w-4" /> Step 1 — Template</h3>
          <p className="text-sm text-slate-600">Download the CSV template with the exact required columns.</p>
          <div className="mt-3 rounded-xl bg-slate-50 p-3 font-mono text-[11px] text-slate-600 break-all">{meta.headers}</div>
          {(entity === 'learners' || entity === 'streams') && gradeHint && <p className="mt-2 text-xs text-slate-500">Valid grade codes: <span className="font-mono font-semibold">{gradeHint}</span>. Streams must already exist (import Streams first).</p>}
          <Button variant="outline" className="mt-3" onClick={downloadTemplate}><Download className="h-4 w-4" /> Download template</Button>
        </Card>
        <Card className="p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500"><Upload className="h-4 w-4" /> Step 2 — Upload & validate</h3>
          <label className="block cursor-pointer rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center transition hover:border-emerald-500 hover:bg-emerald-50/50">
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
            <p className="text-sm font-semibold text-slate-700">{fileName || 'Choose a CSV file'}</p>
            <p className="mt-1 text-xs text-slate-500">{rows.length ? `${rows.length} row(s) loaded` : 'Max 2000 rows per import'}</p>
          </label>
          <Button className="mt-3 w-full" variant="secondary" disabled={!rows.length} loading={validating} onClick={validate}>Validate {rows.length ? `${rows.length} rows` : ''}</Button>
        </Card>
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">Step 3 — Import</h3>
          {!result ? <p className="text-sm text-slate-500">Validation results will appear here. Only valid rows are imported; invalid rows are skipped with reasons.</p> : (
            <div>
              <div className="flex gap-2">
                <Badge tone="green"><CheckCircle2 className="mr-1 h-3 w-3" />{result.valid_count} valid</Badge>
                <Badge tone={result.error_count ? 'red' : 'slate'}><AlertTriangle className="mr-1 h-3 w-3" />{result.error_count} errors</Badge>
              </div>
              <Button className="mt-3 w-full" disabled={result.valid_count === 0} loading={committing} onClick={commit}>Import {result.valid_count} valid row(s)</Button>
            </div>
          )}
        </Card>
      </div>
      {result?.errors?.length > 0 && (
        <Card className="mt-4">
          <div className="border-b border-slate-200 px-5 py-3"><p className="text-sm font-bold text-rose-700">Validation errors ({result.error_count}) — showing first {result.errors.length}</p></div>
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="bg-slate-50 text-xs uppercase text-slate-500"><th className="px-4 py-2">Row</th><th className="px-4 py-2">Ref</th><th className="px-4 py-2">Errors</th></tr></thead>
              <tbody>
                {result.errors.map((e: any, i: number) => (
                  <tr key={i} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-2 font-mono text-xs">{e.line}</td>
                    <td className="px-4 py-2 font-mono text-xs">{e.admission_no || e.staff_no || '—'}</td>
                    <td className="px-4 py-2 text-xs text-rose-700">{e.errors.join('; ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <Card className="mt-4 hidden p-5"><Field label="hidden"><Select value="x" onChange={() => {}}><option>x</option></Select></Field></Card>
    </div>
  );
}
