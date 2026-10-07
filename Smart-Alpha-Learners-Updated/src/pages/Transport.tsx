import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Bus, UserCheck, Route as RouteIcon, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { get, post, put, del } from '../lib/api';
import { Card, Button, Input, Select, Field, Badge, Spinner, ErrorState, EmptyState, PageHeader, Modal, ConfirmDialog, Tabs, useToast, Toast } from '../components/ui';
import { formatDate, todayISO } from '../lib/constants';
import { formatKES } from '../lib/finance';
import { useLearnerLookup } from './Operations';

export default function Transport() {
  const { can } = useAuth();
  const canManage = can('transport.manage');
  const [tab, setTab] = useState('routes');
  const [routes, setRoutes] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRoute, setShowRoute] = useState(false);
  const [editingRoute, setEditingRoute] = useState<any>(null);
  const [deletingRoute, setDeletingRoute] = useState<any>(null);
  const [delLoading, setDelLoading] = useState(false);
  const [assignFor, setAssignFor] = useState<any>(null);
  const [attFor, setAttFor] = useState<any>(null);
  const { showSuccess, showError, toast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const [r, v, d] = await Promise.all([
        get('/api/operations?resource=routes'), get('/api/operations?resource=vehicles'), get('/api/operations?resource=drivers'),
      ]);
      setRoutes(r); setVehicles(v); setDrivers(d);
    } catch (e: any) { showError(e.message); } finally { setLoading(false); }
  };
  useEffect(() => { load(); // eslint-disable-next-line
  }, []);

  const doDeleteRoute = async () => {
    setDelLoading(true);
    try { await del(`/api/operations?resource=routes&id=${deletingRoute.id}`); showSuccess('Route deleted'); setDeletingRoute(null); load(); }
    catch (e: any) { showError(e.message); } finally { setDelLoading(false); }
  };

  return (
    <div>
      <Toast toast={toast} />
      <PageHeader title="Transport" subtitle={`${routes.length} route(s) · ${vehicles.length} vehicle(s) · ${drivers.length} driver(s)`} />
      <Tabs tabs={[{ key: 'routes', label: 'Routes & Riders' }, { key: 'fleet', label: 'Vehicles & Drivers' }]} active={tab} onChange={setTab} />
      <div className="mt-4">
        {tab === 'routes' && (<>
          {canManage && <div className="mb-4"><Button onClick={() => { setEditingRoute(null); setShowRoute(true); }}><Plus className="h-4 w-4" /> New route</Button></div>}
          {loading ? <Spinner /> : routes.length === 0 ? <EmptyState title="No routes" icon={<Bus className="h-8 w-8 text-slate-300" />} /> : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {routes.map((r) => (
                <Card key={r.id} className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100"><RouteIcon className="h-5 w-5 text-orange-700" /></div>
                      <div><p className="font-bold">{r.name}</p><p className="text-xs text-slate-500">{r.code || '—'} · {r.vehicle_reg || 'No vehicle'} · {r.driver_name || 'No driver'}</p></div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge tone={r.is_active ? 'green' : 'slate'}>{r.learner_count} rider(s)</Badge>
                      {canManage && <>
                        <button onClick={() => { setEditingRoute(r); setShowRoute(true); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => setDeletingRoute(r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                      </>}
                    </div>
                  </div>
                  {r.stops && <p className="mt-2 text-xs text-slate-500"><span className="font-semibold">Stops:</span> {r.stops}</p>}
                  {r.fee_amount ? <p className="mt-1 text-xs text-slate-500">Transport fee: <span className="font-semibold">{formatKES(r.fee_amount)}</span></p> : null}
                  {canManage && (
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setAssignFor(r)}><UserCheck className="h-3.5 w-3.5" /> Manage riders</Button>
                      <Button size="sm" variant="outline" onClick={() => setAttFor(r)}><Check className="h-3.5 w-3.5" /> Trip attendance</Button>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </>)}
        {tab === 'fleet' && <FleetTab vehicles={vehicles} drivers={drivers} canManage={canManage} onChanged={load} />}
      </div>
      {showRoute && <RouteForm initial={editingRoute} vehicles={vehicles} drivers={drivers} onSaved={() => { setShowRoute(false); load(); }} onClose={() => setShowRoute(false)} />}
      {deletingRoute && <ConfirmDialog title="Delete route" message={`Delete route \"${deletingRoute.name}\"?`} onConfirm={doDeleteRoute} onCancel={() => setDeletingRoute(null)} loading={delLoading} />}
      {assignFor && <RidersModal route={assignFor} onDone={() => { setAssignFor(null); load(); }} onClose={() => setAssignFor(null)} />}
      {attFor && <TripAttendanceModal route={attFor} onClose={() => setAttFor(null)} />}
    </div>
  );
}

function RouteForm({ initial, vehicles, drivers, onSaved, onClose }: any) {
  const [form, setForm] = useState({
    name: initial?.name || '', code: initial?.code || '', stops: initial?.stops || '',
    vehicle_id: initial?.vehicle_id || '', driver_id: initial?.driver_id || '',
    fee_amount: initial?.fee_amount || '', is_active: initial?.is_active !== false, notes: initial?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const { showError, showSuccess, toast } = useToast();
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { showError('Route name is required'); return; }
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), code: form.code || null, stops: form.stops || null, vehicle_id: form.vehicle_id ? Number(form.vehicle_id) : null, driver_id: form.driver_id ? Number(form.driver_id) : null, fee_amount: form.fee_amount ? Number(form.fee_amount) : null, is_active: form.is_active, notes: form.notes || null };
      if (initial?.id) await put('/api/operations?resource=routes', { ...payload, id: initial.id });
      else await post('/api/operations?resource=routes', payload);
      showSuccess('Route saved'); setTimeout(onSaved, 400);
    } catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };
  return (
    <Modal title={initial ? 'Edit route' : 'New route'} onClose={onClose}>
      <Toast toast={toast} />
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Route name" required><Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Ngong Rd Loop" /></Field>
          <Field label="Code"><Input value={form.code} onChange={(e) => set('code', e.target.value)} /></Field>
        </div>
        <Field label="Stops (comma-separated)"><Input value={form.stops} onChange={(e) => set('stops', e.target.value)} placeholder="Stage A, Stage B, Stage C" /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Vehicle"><Select value={form.vehicle_id} onChange={(e) => set('vehicle_id', e.target.value)}><option value="">— None —</option>{vehicles.map((v: any) => <option key={v.id} value={v.id}>{v.registration_no} ({v.capacity || '?'} seats)</option>)}</Select></Field>
          <Field label="Driver"><Select value={form.driver_id} onChange={(e) => set('driver_id', e.target.value)}><option value="">— None —</option>{drivers.map((d: any) => <option key={d.id} value={d.id}>{d.first_name} {d.last_name}</option>)}</Select></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Fee (KES)"><Input type="number" value={form.fee_amount} onChange={(e) => set('fee_amount', e.target.value)} /></Field>
          <Field label="Status"><Select value={form.is_active ? '1' : '0'} onChange={(e) => set('is_active', e.target.value === '1')}><option value="1">Active</option><option value="0">Inactive</option></Select></Field>
        </div>
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Save</Button></div>
      </form>
    </Modal>
  );
}

function FleetTab({ vehicles, drivers, canManage, onChanged }: any) {
  const [showVehicle, setShowVehicle] = useState(false);
  const [showDriver, setShowDriver] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<any>(null);
  const [editingDriver, setEditingDriver] = useState<any>(null);
  const { showSuccess, showError, toast } = useToast();
  const remove = async (resource: string, id: number, label: string) => {
    if (!confirm(`Delete ${label}?`)) return;
    try { await del(`/api/operations?resource=${resource}&id=${id}`); showSuccess('Deleted'); onChanged(); }
    catch (e: any) { showError(e.message); }
  };
  return (
    <div>
      <Toast toast={toast} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-bold">Vehicles ({vehicles.length})</p>
            {canManage && <Button size="sm" variant="outline" onClick={() => { setEditingVehicle(null); setShowVehicle(true); }}><Plus className="h-3.5 w-3.5" /> Add</Button>}
          </div>
          <div className="space-y-2">
            {vehicles.map((v: any) => (
              <div key={v.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5">
                <div><p className="text-sm font-bold">{v.registration_no}</p><p className="text-xs text-slate-500">{[v.make, v.model].filter(Boolean).join(' ') || '—'} · {v.capacity || '?'} seats{v.insurance_expiry ? ` · Ins: ${formatDate(v.insurance_expiry)}` : ''}</p></div>
                <div className="flex items-center gap-1.5">
                  <Badge tone={v.status === 'Active' ? 'green' : 'slate'}>{v.status}</Badge>
                  {canManage && <><button onClick={() => { setEditingVehicle(v); setShowVehicle(true); }} className="rounded p-1 text-slate-400 hover:bg-slate-200"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => remove('vehicles', v.id, v.registration_no)} className="rounded p-1 text-slate-400 hover:bg-rose-100 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button></>}
                </div>
              </div>
            ))}
            {!vehicles.length && <p className="text-sm text-slate-400">No vehicles.</p>}
          </div>
        </Card>
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-bold">Drivers ({drivers.length})</p>
            {canManage && <Button size="sm" variant="outline" onClick={() => { setEditingDriver(null); setShowDriver(true); }}><Plus className="h-3.5 w-3.5" /> Add</Button>}
          </div>
          <div className="space-y-2">
            {drivers.map((d: any) => (
              <div key={d.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5">
                <div><p className="text-sm font-bold">{d.first_name} {d.last_name}</p><p className="text-xs text-slate-500">{d.phone || '—'}{d.license_no ? ` · DL ${d.license_no}` : ''}{d.license_expiry ? ` (exp ${formatDate(d.license_expiry)})` : ''}</p></div>
                <div className="flex items-center gap-1.5">
                  <Badge tone={d.status === 'Active' ? 'green' : 'slate'}>{d.status}</Badge>
                  {canManage && <><button onClick={() => { setEditingDriver(d); setShowDriver(true); }} className="rounded p-1 text-slate-400 hover:bg-slate-200"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => remove('drivers', d.id, `${d.first_name} ${d.last_name}`)} className="rounded p-1 text-slate-400 hover:bg-rose-100 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button></>}
                </div>
              </div>
            ))}
            {!drivers.length && <p className="text-sm text-slate-400">No drivers.</p>}
          </div>
        </Card>
      </div>
      {showVehicle && <VehicleForm initial={editingVehicle} onSaved={() => { setShowVehicle(false); onChanged(); }} onClose={() => setShowVehicle(false)} />}
      {showDriver && <DriverForm initial={editingDriver} onSaved={() => { setShowDriver(false); onChanged(); }} onClose={() => setShowDriver(false)} />}
    </div>
  );
}

function VehicleForm({ initial, onSaved, onClose }: any) {
  const [form, setForm] = useState({ registration_no: initial?.registration_no || '', make: initial?.make || '', model: initial?.model || '', capacity: initial?.capacity || '', status: initial?.status || 'Active', insurance_expiry: initial?.insurance_expiry || '', notes: initial?.notes || '' });
  const [saving, setSaving] = useState(false);
  const { showError, showSuccess, toast } = useToast();
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.registration_no.trim()) { showError('Registration number is required'); return; }
    setSaving(true);
    try {
      const payload = { ...form, capacity: form.capacity ? Number(form.capacity) : null, insurance_expiry: form.insurance_expiry || null };
      if (initial?.id) await put('/api/operations?resource=vehicles', { ...payload, id: initial.id });
      else await post('/api/operations?resource=vehicles', payload);
      showSuccess('Vehicle saved'); setTimeout(onSaved, 400);
    } catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };
  return (
    <Modal title={initial ? 'Edit vehicle' : 'Add vehicle'} onClose={onClose}>
      <Toast toast={toast} />
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Registration" required><Input value={form.registration_no} onChange={(e) => set('registration_no', e.target.value)} placeholder="e.g. KDB 123A" /></Field>
          <Field label="Capacity"><Input type="number" value={form.capacity} onChange={(e) => set('capacity', e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Make"><Input value={form.make} onChange={(e) => set('make', e.target.value)} /></Field>
          <Field label="Model"><Input value={form.model} onChange={(e) => set('model', e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Status"><Select value={form.status} onChange={(e) => set('status', e.target.value)}><option>Active</option><option>Maintenance</option><option>Retired</option></Select></Field>
          <Field label="Insurance expiry"><Input type="date" value={form.insurance_expiry} onChange={(e) => set('insurance_expiry', e.target.value)} /></Field>
        </div>
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Save</Button></div>
      </form>
    </Modal>
  );
}

function DriverForm({ initial, onSaved, onClose }: any) {
  const [form, setForm] = useState({ first_name: initial?.first_name || '', last_name: initial?.last_name || '', phone: initial?.phone || '', license_no: initial?.license_no || '', license_expiry: initial?.license_expiry || '', status: initial?.status || 'Active' });
  const [saving, setSaving] = useState(false);
  const { showError, showSuccess, toast } = useToast();
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim()) { showError('Driver name is required'); return; }
    setSaving(true);
    try {
      if (initial?.id) await put('/api/operations?resource=drivers', { ...form, id: initial.id });
      else await post('/api/operations?resource=drivers', form);
      showSuccess('Driver saved'); setTimeout(onSaved, 400);
    } catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };
  return (
    <Modal title={initial ? 'Edit driver' : 'Add driver'} onClose={onClose}>
      <Toast toast={toast} />
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="First name" required><Input value={form.first_name} onChange={(e) => set('first_name', e.target.value)} /></Field>
          <Field label="Last name" required><Input value={form.last_name} onChange={(e) => set('last_name', e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Phone"><Input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Status"><Select value={form.status} onChange={(e) => set('status', e.target.value)}><option>Active</option><option>Inactive</option></Select></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Licence no"><Input value={form.license_no} onChange={(e) => set('license_no', e.target.value)} /></Field>
          <Field label="Licence expiry"><Input type="date" value={form.license_expiry} onChange={(e) => set('license_expiry', e.target.value)} /></Field>
        </div>
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Save</Button></div>
      </form>
    </Modal>
  );
}

function RidersModal({ route, onDone, onClose }: any) {
  const { q, setQ, filtered } = useLearnerLookup();
  const [riders, setRiders] = useState<any[]>([]);
  const [learnerId, setLearnerId] = useState('');
  const [stop, setStop] = useState('');
  const [saving, setSaving] = useState(false);
  const { showSuccess, showError, toast } = useToast();
  const load = async () => {
    try { setRiders(await get(`/api/operations?resource=transport-assign&route_id=${route.id}`)); } catch (e: any) { showError(e.message); }
  };
  useEffect(() => { load(); // eslint-disable-next-line
  }, []);
  const add = async () => {
    if (!learnerId) { showError('Select a learner'); return; }
    setSaving(true);
    try { await post('/api/operations?resource=transport-assign', { route_id: route.id, learner_id: Number(learnerId), stop_name: stop || null }); showSuccess('Rider added'); setLearnerId(''); setStop(''); load(); }
    catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };
  const toggle = async (a: any) => {
    try { await put('/api/operations?resource=transport-assign', { id: a.id, is_active: !a.is_active }); load(); }
    catch (e: any) { showError(e.message); }
  };
  const stops = (route.stops || '').split(',').map((s: string) => s.trim()).filter(Boolean);
  return (
    <Modal title={`Riders — ${route.name}`} subtitle={`${riders.filter((r) => r.is_active).length} active rider(s)`} onClose={onClose} wide>
      <Toast toast={toast} />
      <div className="space-y-2">
        {riders.map((r) => (
          <div key={r.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2 text-sm">
            <span className={!r.is_active ? 'text-slate-400 line-through' : ''}>{r.learner_name} <span className="font-mono text-xs text-slate-400">{r.admission_no}</span>{r.stop_name ? ` · ${r.stop_name}` : ''}</span>
            <Button size="sm" variant={r.is_active ? 'ghost' : 'outline'} onClick={() => toggle(r)}>{r.is_active ? 'Deactivate' : 'Reactivate'}</Button>
          </div>
        ))}
        {!riders.length && <p className="text-sm text-slate-400">No riders yet.</p>}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-4">
        <div className="sm:col-span-2"><Field label="Search learner"><Input placeholder="Name or admission..." value={q} onChange={(e) => setQ(e.target.value)} /></Field></div>
        <Field label="Learner"><Select value={learnerId} onChange={(e) => setLearnerId(e.target.value)}><option value="">— Select —</option>{filtered.slice(0, 60).map((l) => <option key={l.id} value={l.id}>{l.first_name} {l.last_name}</option>)}</Select></Field>
        <Field label="Stop"><Select value={stop} onChange={(e) => setStop(e.target.value)}><option value="">—</option>{stops.map((s: string) => <option key={s} value={s}>{s}</option>)}</Select></Field>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>Done</Button>
        <Button onClick={add} loading={saving}>Add rider</Button>
      </div>
    </Modal>
  );
}

function TripAttendanceModal({ route, onClose }: any) {
  const [date, setDate] = useState(todayISO());
  const [trip, setTrip] = useState('Morning');
  const [riders, setRiders] = useState<any[]>([]);
  const [marks, setMarks] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const { showSuccess, showError, toast } = useToast();
  useEffect(() => {
    (async () => {
      try {
        const [a, prev] = await Promise.all([
          get(`/api/operations?resource=transport-assign&route_id=${route.id}`),
          get(`/api/operations?resource=transport-attendance&route_id=${route.id}&date=${date}`),
        ]);
        const active = a.filter((x: any) => x.is_active);
        setRiders(active);
        const m: Record<number, string> = {};
        active.forEach((r: any) => { m[r.learner_id] = 'Present'; });
        (prev || []).filter((p: any) => p.trip === trip).forEach((p: any) => { m[p.learner_id] = p.status; });
        setMarks(m);
      } catch (e: any) { showError(e.message); }
    })();
    // eslint-disable-next-line
  }, [date, trip]);
  const save = async () => {
    setSaving(true);
    try {
      const records = riders.map((r) => ({ learner_id: r.learner_id, trip, status: marks[r.learner_id] || 'Present' }));
      await post('/api/operations?resource=transport-attendance', { route_id: route.id, date, records });
      showSuccess('Trip attendance saved');
    } catch (e: any) { showError(e.message); } finally { setSaving(false); }
  };
  return (
    <Modal title={`Trip attendance — ${route.name}`} onClose={onClose} wide>
      <Toast toast={toast} />
      <div className="mb-3 grid grid-cols-2 gap-3">
        <Field label="Date"><Input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Trip"><Select value={trip} onChange={(e) => setTrip(e.target.value)}><option>Morning</option><option>Evening</option></Select></Field>
      </div>
      <div className="max-h-80 space-y-1.5 overflow-y-auto">
        {riders.map((r) => (
          <div key={r.learner_id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <span className="truncate">{r.learner_name}{r.stop_name ? ` · ${r.stop_name}` : ''}</span>
            <div className="flex gap-1">
              {['Present', 'Absent'].map((s) => (
                <button key={s} onClick={() => setMarks({ ...marks, [r.learner_id]: s })} className={`rounded-lg px-2.5 py-1 text-xs font-bold ${marks[r.learner_id] === s ? (s === 'Present' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white') : 'bg-white text-slate-600 border'}`}>{s[0]}</button>
              ))}
            </div>
          </div>
        ))}
        {!riders.length && <p className="text-sm text-slate-400">No active riders on this route.</p>}
      </div>
      <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Close</Button><Button onClick={save} loading={saving}>Save attendance</Button></div>
    </Modal>
  );
}
