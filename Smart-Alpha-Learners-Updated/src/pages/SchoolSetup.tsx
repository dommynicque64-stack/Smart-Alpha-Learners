import { useState, useEffect } from 'react';
import { Upload, Building2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { get, post, put } from '../lib/api';
import { Card, Button, Input, Select, Field, Spinner, ErrorState, PageHeader, useToast, Toast } from '../components/ui';
import { KENYA_COUNTIES, SCHOOL_TYPES } from '../lib/constants';

export default function SchoolSetup() {
  const { can } = useAuth();
  const canManage = can('school.manage');
  const [school, setSchool] = useState<any>(null);
  const [levels, setLevels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState<any>({});
  const { showSuccess, showError, toast } = useToast();
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [s, l] = await Promise.all([get('/api/schools'), get('/api/academic?resource=levels')]);
      setSchool(s); setLevels(l);
      setForm(s || { name: '', school_type: 'Public' });
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); // eslint-disable-next-line
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name?.trim()) { showError('School name is required'); return; }
    setSaving(true);
    try {
      const payload = { ...form };
      if (school?.id) setSchool(await put('/api/schools', { ...payload, id: school.id }));
      else setSchool(await post('/api/schools', payload));
      showSuccess('School profile saved');
    } catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };

  const toggleLevel = async (level: any) => {
    try {
      await put('/api/academic?resource=levels', { id: level.id, is_enabled: !level.is_enabled });
      setLevels(levels.map((l) => l.id === level.id ? { ...l, is_enabled: !l.is_enabled } : l));
      showSuccess(`${level.name} ${level.is_enabled ? 'disabled' : 'enabled'}`);
    } catch (e: any) { showError(e.message); }
  };

  const uploadLogo = async (file: File) => {
    setUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await post('/api/upload', { fileName: file.name, fileBase64: base64, contentType: file.type, folder: 'logos' });
      set('logo_url', res.url);
      showSuccess('Logo uploaded — remember to save');
    } catch (e: any) { showError(e.message); } finally { setUploading(false); }
  };

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <Toast toast={toast} />
      <PageHeader title="School Setup" subtitle="Identity, location, contact and enabled school levels" />
      <form onSubmit={save}>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card className="p-5">
            <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Identity</h3>
            <div className="mb-4 flex items-center gap-4">
              {form.logo_url ? <img src={form.logo_url} alt="School logo" className="h-20 w-20 rounded-2xl border border-slate-200 object-contain p-1" />
                : <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-100"><Building2 className="h-8 w-8 text-slate-300" /></div>}
              {canManage && (
                <label className="cursor-pointer">
                  <span className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    <Upload className="h-4 w-4" /> {uploading ? 'Uploading...' : 'Upload logo'}
                  </span>
                  <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ''; }} />
                </label>
              )}
            </div>
            <div className="space-y-4">
              <Field label="School name" required><Input value={form.name || ''} disabled={!canManage} onChange={(e) => set('name', e.target.value)} /></Field>
              <Field label="Motto"><Input value={form.motto || ''} disabled={!canManage} onChange={(e) => set('motto', e.target.value)} placeholder="e.g. Knowledge is Light" /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="School type"><Select value={form.school_type || ''} disabled={!canManage} onChange={(e) => set('school_type', e.target.value)}><option value="">—</option>{SCHOOL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</Select></Field>
                <Field label="Registration no."><Input value={form.registration_no || ''} disabled={!canManage} onChange={(e) => set('registration_no', e.target.value)} /></Field>
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Location</h3>
            <div className="space-y-4">
              <Field label="Address"><Input value={form.address || ''} disabled={!canManage} onChange={(e) => set('address', e.target.value)} placeholder="P.O. Box ..." /></Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="County"><Select value={form.county || ''} disabled={!canManage} onChange={(e) => set('county', e.target.value)}><option value="">— Select —</option>{KENYA_COUNTIES.map((c) => <option key={c} value={c}>{c}</option>)}</Select></Field>
                <Field label="Sub-county"><Input value={form.sub_county || ''} disabled={!canManage} onChange={(e) => set('sub_county', e.target.value)} /></Field>
              </div>
            </div>
            <h3 className="mb-4 mt-6 text-sm font-bold uppercase tracking-wide text-slate-500">Contact</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Phone"><Input value={form.phone || ''} disabled={!canManage} onChange={(e) => set('phone', e.target.value)} /></Field>
                <Field label="Email"><Input type="email" value={form.email || ''} disabled={!canManage} onChange={(e) => set('email', e.target.value)} /></Field>
              </div>
              <Field label="Website"><Input value={form.website || ''} disabled={!canManage} onChange={(e) => set('website', e.target.value)} placeholder="https://..." /></Field>
            </div>
          </Card>
          <Card className="p-5">
            <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">Enabled school levels</h3>
            <p className="mb-4 text-xs text-slate-500">Toggle which CBC levels this school offers. Manage levels & grades under Academic Structure.</p>
            <div className="space-y-2">
              {levels.map((l) => (
                <div key={l.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3.5 py-2.5">
                  <div><p className="text-sm font-semibold text-slate-800">{l.name}</p><p className="font-mono text-xs text-slate-400">{l.code || '—'}</p></div>
                  <button
                    type="button"
                    disabled={!canManage}
                    onClick={() => toggleLevel(l)}
                    className={`relative h-6 w-11 rounded-full transition disabled:opacity-50 ${l.is_enabled ? 'bg-emerald-600' : 'bg-slate-300'}`}
                    aria-label={`Toggle ${l.name}`}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${l.is_enabled ? 'left-[22px]' : 'left-0.5'}`} />
                  </button>
                </div>
              ))}
              {!levels.length && <p className="text-sm text-slate-500">No levels configured yet.</p>}
            </div>
          </Card>
        </div>
        {canManage && <div className="mt-4 flex justify-end"><Button type="submit" loading={saving} size="lg">Save school profile</Button></div>}
      </form>
    </div>
  );
}
