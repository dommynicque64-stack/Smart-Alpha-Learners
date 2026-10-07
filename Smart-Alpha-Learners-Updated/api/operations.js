import supabase from './db-client.js';
import { preflight, getSession, can, audit, serverError } from './_auth.js';

const RESOURCES = [
  'discipline', 'staff', 'staff-leave', 'staff-pd',
  'books', 'book-txns', 'inventory', 'vehicles', 'drivers', 'routes', 'transport-assign', 'transport-attendance',
];

const PERM_FOR = {
  discipline: ['discipline.manage', 'discipline.view'],
  staff: ['staff.manage', 'staff.view'],
  'staff-leave': ['staff.manage', 'staff.view'],
  'staff-pd': ['staff.manage', 'staff.view'],
  books: ['library.manage', 'library.borrow', 'library.view'],
  'book-txns': ['library.manage', 'library.borrow', 'library.view'],
  inventory: ['inventory.manage', 'inventory.view'],
  vehicles: ['transport.manage', 'transport.view'],
  drivers: ['transport.manage', 'transport.view'],
  routes: ['transport.manage', 'transport.view'],
  'transport-assign': ['transport.manage', 'transport.view'],
  'transport-attendance': ['transport.manage', 'transport.view'],
};

const TABLE_FOR = {
  discipline: 'discipline_records', staff: 'staff_records', 'staff-leave': 'leave_records', 'staff-pd': 'staff_pd_records',
  books: 'library_books', 'book-txns': 'library_transactions', inventory: 'inventory_items',
  vehicles: 'vehicles', drivers: 'drivers', routes: 'transport_routes',
  'transport-assign': 'transport_assignments', 'transport-attendance': 'transport_attendance',
};

const WRITE_PERM = {
  discipline: 'discipline.manage', staff: 'staff.manage', 'staff-leave': 'staff.manage', 'staff-pd': 'staff.manage',
  books: 'library.manage', 'book-txns': 'library.borrow', inventory: 'inventory.manage',
  vehicles: 'transport.manage', drivers: 'transport.manage', routes: 'transport.manage',
  'transport-assign': 'transport.manage', 'transport-attendance': 'transport.manage',
};

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    const me = session.profile;
    const resource = req.query.resource;
    if (!RESOURCES.includes(resource)) return res.status(400).json({ error: 'Unknown resource' });
    const table = TABLE_FOR[resource];

    // ---------------- GET ----------------
    if (req.method === 'GET') {
      if (!can(me, PERM_FOR[resource])) return res.status(403).json({ error: 'Forbidden' });

      if (resource === 'discipline') {
        let q = supabase.from(table).select('*').order('incident_date', { ascending: false }).order('id', { ascending: false }).limit(500);
        if (req.query.learner_id) q = q.eq('learner_id', req.query.learner_id);
        if (req.query.severity) q = q.eq('severity', req.query.severity);
        if (req.query.status) q = q.eq('status', req.query.status);
        const { data, error } = await q;
        if (error) throw error;
        if (!data.length) return res.status(200).json([]);
        const lids = [...new Set(data.map((d) => d.learner_id))];
        const { data: learners } = await supabase.from('learners').select('id,admission_no,first_name,last_name').in('id', lids);
        const lm = Object.fromEntries((learners || []).map((l) => [l.id, l]));
        return res.status(200).json(data.map((d) => ({ ...d, learner_name: lm[d.learner_id] ? `${lm[d.learner_id].first_name} ${lm[d.learner_id].last_name}` : '', admission_no: lm[d.learner_id]?.admission_no || '' })));
      }
      if (resource === 'staff') {
        let q = supabase.from(table).select('*').order('last_name').order('first_name');
        if (req.query.q) {
          const s = `%${req.query.q}%`;
          q = q.or(`first_name.ilike.${s},last_name.ilike.${s},staff_no.ilike.${s},job_title.ilike.${s},department.ilike.${s}`);
        }
        if (req.query.employment_status) q = q.eq('employment_status', req.query.employment_status);
        const { data, error } = await q.limit(500);
        if (error) throw error;
        return res.status(200).json(data);
      }
      if (resource === 'staff-leave' || resource === 'staff-pd') {
        let q = supabase.from(table).select('*').order('id', { ascending: false }).limit(500);
        if (req.query.staff_id) q = q.eq('staff_id', req.query.staff_id);
        if (resource === 'staff-leave' && req.query.status) q = q.eq('status', req.query.status);
        const { data, error } = await q;
        if (error) throw error;
        if (!data.length) return res.status(200).json([]);
        const sids = [...new Set(data.map((d) => d.staff_id))];
        const { data: staff } = await supabase.from('staff_records').select('id,first_name,last_name,staff_no').in('id', sids);
        const sm = Object.fromEntries((staff || []).map((s) => [s.id, s]));
        return res.status(200).json(data.map((d) => ({ ...d, staff_name: sm[d.staff_id] ? `${sm[d.staff_id].first_name} ${sm[d.staff_id].last_name}` : '', staff_no: sm[d.staff_id]?.staff_no || '' })));
      }
      if (resource === 'books') {
        let q = supabase.from(table).select('*').order('title');
        if (req.query.q) {
          const s = `%${req.query.q}%`;
          q = q.or(`title.ilike.${s},author.ilike.${s},isbn.ilike.${s},category.ilike.${s}`);
        }
        if (req.query.category) q = q.eq('category', req.query.category);
        const { data, error } = await q.limit(500);
        if (error) throw error;
        return res.status(200).json(data);
      }
      if (resource === 'book-txns') {
        let q = supabase.from(table).select('*').order('id', { ascending: false }).limit(500);
        if (req.query.book_id) q = q.eq('book_id', req.query.book_id);
        if (req.query.learner_id) q = q.eq('learner_id', req.query.learner_id);
        if (req.query.status) q = q.eq('status', req.query.status);
        const { data, error } = await q;
        if (error) throw error;
        if (!data.length) return res.status(200).json([]);
        const bids = [...new Set(data.map((t) => t.book_id))];
        const lids = [...new Set(data.map((t) => t.learner_id).filter(Boolean))];
        const [books, learners] = await Promise.all([
          supabase.from('library_books').select('id,title,author').in('id', bids),
          lids.length ? supabase.from('learners').select('id,admission_no,first_name,last_name').in('id', lids) : { data: [] },
        ]);
        const bm = Object.fromEntries((books.data || []).map((b) => [b.id, b]));
        const lm = Object.fromEntries((learners.data || []).map((l) => [l.id, l]));
        return res.status(200).json(data.map((t) => ({ ...t, book_title: bm[t.book_id]?.title || '', borrower_name: t.learner_id && lm[t.learner_id] ? `${lm[t.learner_id].first_name} ${lm[t.learner_id].last_name}` : (t.borrower_name || '') })));
      }
      if (resource === 'inventory') {
        let q = supabase.from(table).select('*').order('name');
        if (req.query.q) {
          const s = `%${req.query.q}%`;
          q = q.or(`name.ilike.${s},asset_no.ilike.${s},location.ilike.${s},department.ilike.${s}`);
        }
        if (req.query.condition) q = q.eq('condition', req.query.condition);
        if (req.query.department) q = q.eq('department', req.query.department);
        const { data, error } = await q.limit(500);
        if (error) throw error;
        return res.status(200).json(data);
      }
      if (resource === 'vehicles' || resource === 'drivers') {
        const { data, error } = await supabase.from(table).select('*').order('id').limit(200);
        if (error) throw error;
        return res.status(200).json(data);
      }
      if (resource === 'routes') {
        const { data, error } = await supabase.from(table).select('*').order('name').limit(200);
        if (error) throw error;
        if (!data.length) return res.status(200).json([]);
        const vids = [...new Set(data.map((r) => r.vehicle_id).filter(Boolean))];
        const dids = [...new Set(data.map((r) => r.driver_id).filter(Boolean))];
        const [vehicles, drivers, assigns] = await Promise.all([
          vids.length ? supabase.from('vehicles').select('id,registration_no,make').in('id', vids) : { data: [] },
          dids.length ? supabase.from('drivers').select('id,first_name,last_name').in('id', dids) : { data: [] },
          supabase.from('transport_assignments').select('route_id').in('route_id', data.map((r) => r.id)).eq('is_active', true),
        ]);
        const vm = Object.fromEntries((vehicles.data || []).map((v) => [v.id, v]));
        const dm = Object.fromEntries((drivers.data || []).map((d) => [d.id, `${d.first_name} ${d.last_name}`]));
        const counts = {};
        (assigns.data || []).forEach((a) => { counts[a.route_id] = (counts[a.route_id] || 0) + 1; });
        return res.status(200).json(data.map((r) => ({ ...r, vehicle_reg: vm[r.vehicle_id]?.registration_no || '', driver_name: dm[r.driver_id] || '', learner_count: counts[r.id] || 0 })));
      }
      if (resource === 'transport-assign') {
        let q = supabase.from(table).select('*').order('id', { ascending: false }).limit(500);
        if (req.query.route_id) q = q.eq('route_id', req.query.route_id);
        if (req.query.learner_id) q = q.eq('learner_id', req.query.learner_id);
        const { data, error } = await q;
        if (error) throw error;
        if (!data.length) return res.status(200).json([]);
        const lids = [...new Set(data.map((a) => a.learner_id))];
        const rids = [...new Set(data.map((a) => a.route_id))];
        const [learners, routes] = await Promise.all([
          supabase.from('learners').select('id,admission_no,first_name,last_name').in('id', lids),
          supabase.from('transport_routes').select('id,name').in('id', rids),
        ]);
        const lm = Object.fromEntries((learners.data || []).map((l) => [l.id, l]));
        const rm = Object.fromEntries((routes.data || []).map((r) => [r.id, r.name]));
        return res.status(200).json(data.map((a) => ({ ...a, learner_name: lm[a.learner_id] ? `${lm[a.learner_id].first_name} ${lm[a.learner_id].last_name}` : '', admission_no: lm[a.learner_id]?.admission_no || '', route_name: rm[a.route_id] || '' })));
      }
      if (resource === 'transport-attendance') {
        let q = supabase.from(table).select('*').order('date', { ascending: false }).limit(500);
        if (req.query.route_id) q = q.eq('route_id', req.query.route_id);
        if (req.query.date) q = q.eq('date', req.query.date);
        const { data, error } = await q;
        if (error) throw error;
        return res.status(200).json(data);
      }
    }

    // ---------------- POST ----------------
    if (req.method === 'POST') {
      const b = req.body || {};
      const need = WRITE_PERM[resource];
      if (!can(me, need)) return res.status(403).json({ error: 'Forbidden' });
      const insert = async (row) => {
        const { data, error } = await supabase.from(table).insert({ ...row, school_id: row.school_id ?? me.school_id }).select('*').single();
        if (error) throw error;
        await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: `ops.${resource}_create`, entityType: table, recordId: data.id });
        return data;
      };
      if (resource === 'discipline') {
        if (!b.learner_id || !b.incident || !b.incident_date) return res.status(400).json({ error: 'Learner, incident and date are required' });
        // Confidential: only discipline.manage may create
        return res.status(201).json(await insert({
          learner_id: b.learner_id, incident: b.incident, incident_date: b.incident_date, location: b.location || null,
          severity: b.severity || 'Minor', staff_involved: b.staff_involved || null, witnesses: b.witnesses || null,
          action_taken: b.action_taken || null, status: b.status || 'Open', reported_by: me.id, notes: b.notes || null,
        }));
      }
      if (resource === 'staff') {
        if (!b.first_name || !b.last_name || !b.staff_no) return res.status(400).json({ error: 'First name, last name and staff number are required' });
        const { data: dup } = await supabase.from(table).select('id').eq('staff_no', b.staff_no).maybeSingle();
        if (dup) return res.status(400).json({ error: 'Staff number already exists' });
        return res.status(201).json(await insert({
          staff_no: b.staff_no, first_name: b.first_name, last_name: b.last_name, phone: b.phone || null, email: b.email || null,
          department: b.department || null, job_title: b.job_title || null, employment_status: b.employment_status || 'Active',
          employment_type: b.employment_type || 'Full-time', subjects: b.subjects || null, date_joined: b.date_joined || null,
          app_user_id: b.app_user_id || null, teacher_id: b.teacher_id || null,
        }));
      }
      if (resource === 'staff-leave') {
        if (!b.staff_id || !b.leave_type || !b.start_date || !b.end_date) return res.status(400).json({ error: 'Staff, leave type and dates are required' });
        return res.status(201).json(await insert({
          staff_id: b.staff_id, leave_type: b.leave_type, start_date: b.start_date, end_date: b.end_date,
          reason: b.reason || null, status: b.status || 'Pending', approved_by: b.approved_by || null,
        }));
      }
      if (resource === 'staff-pd') {
        if (!b.staff_id || !b.title) return res.status(400).json({ error: 'Staff and title are required' });
        return res.status(201).json(await insert({
          staff_id: b.staff_id, title: b.title, provider: b.provider || null, pd_date: b.pd_date || null,
          duration_hours: b.duration_hours || null, notes: b.notes || null,
        }));
      }
      if (resource === 'books') {
        if (!b.title) return res.status(400).json({ error: 'Book title is required' });
        const copies = Number(b.copies_total ?? 1);
        return res.status(201).json(await insert({
          title: b.title, author: b.author || null, isbn: b.isbn || null, publisher: b.publisher || null,
          category: b.category || null, copies_total: copies, copies_available: copies, shelf: b.shelf || null, notes: b.notes || null,
        }));
      }
      if (resource === 'book-txns') {
        if (b.action === 'issue') {
          if (!b.book_id || (!b.learner_id && !b.borrower_name)) return res.status(400).json({ error: 'Book and borrower (learner or name) are required' });
          const { data: book } = await supabase.from('library_books').select('*').eq('id', b.book_id).single();
          if (!book) return res.status(400).json({ error: 'Book not found' });
          if ((book.copies_available ?? 0) <= 0) return res.status(400).json({ error: 'No copies available' });
          const { data, error } = await supabase.from(table).insert({
            school_id: me.school_id, book_id: b.book_id, learner_id: b.learner_id || null, borrower_name: b.borrower_name || null,
            issue_date: b.issue_date || new Date().toISOString().slice(0, 10), due_date: b.due_date || null, status: 'Issued', issued_by: me.id,
          }).select('*').single();
          if (error) throw error;
          await supabase.from('library_books').update({ copies_available: book.copies_available - 1 }).eq('id', b.book_id);
          await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'ops.book_issue', entityType: table, recordId: data.id });
          return res.status(201).json(data);
        }
        if (b.action === 'return') {
          if (!b.id) return res.status(400).json({ error: 'Missing transaction id' });
          const { data: txn } = await supabase.from(table).select('*').eq('id', b.id).single();
          if (!txn || txn.status === 'Returned') return res.status(400).json({ error: 'Transaction already returned' });
          const { data, error } = await supabase.from(table).update({
            status: 'Returned', return_date: b.return_date || new Date().toISOString().slice(0, 10), notes: b.notes ?? txn.notes,
          }).eq('id', b.id).select('*').single();
          if (error) throw error;
          const { data: book } = await supabase.from('library_books').select('copies_available').eq('id', txn.book_id).single();
          await supabase.from('library_books').update({ copies_available: (book?.copies_available ?? 0) + 1 }).eq('id', txn.book_id);
          await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'ops.book_return', entityType: table, recordId: b.id });
          return res.status(200).json(data);
        }
        return res.status(400).json({ error: 'Unknown action (issue/return)' });
      }
      if (resource === 'inventory') {
        if (!b.name) return res.status(400).json({ error: 'Asset name is required' });
        return res.status(201).json(await insert({
          asset_no: b.asset_no || null, name: b.name, category: b.category || null, quantity: b.quantity ?? 1,
          location: b.location || null, condition: b.condition || 'Good', department: b.department || null,
          supplier: b.supplier || null, purchase_date: b.purchase_date || null, purchase_cost: b.purchase_cost || null, notes: b.notes || null,
        }));
      }
      if (resource === 'vehicles') {
        if (!b.registration_no) return res.status(400).json({ error: 'Registration number is required' });
        return res.status(201).json(await insert({
          registration_no: b.registration_no, make: b.make || null, model: b.model || null, capacity: b.capacity || null,
          status: b.status || 'Active', insurance_expiry: b.insurance_expiry || null, notes: b.notes || null,
        }));
      }
      if (resource === 'drivers') {
        if (!b.first_name || !b.last_name) return res.status(400).json({ error: 'Driver name is required' });
        return res.status(201).json(await insert({
          first_name: b.first_name, last_name: b.last_name, phone: b.phone || null, license_no: b.license_no || null,
          license_expiry: b.license_expiry || null, status: b.status || 'Active', notes: b.notes || null,
        }));
      }
      if (resource === 'routes') {
        if (!b.name) return res.status(400).json({ error: 'Route name is required' });
        return res.status(201).json(await insert({
          name: b.name, code: b.code || null, stops: b.stops || null, vehicle_id: b.vehicle_id || null,
          driver_id: b.driver_id || null, fee_amount: b.fee_amount || null, is_active: b.is_active !== false, notes: b.notes || null,
        }));
      }
      if (resource === 'transport-assign') {
        if (!b.route_id || !b.learner_id) return res.status(400).json({ error: 'Route and learner are required' });
        const { data: dup } = await supabase.from(table).select('id').eq('route_id', b.route_id).eq('learner_id', b.learner_id).eq('is_active', true).maybeSingle();
        if (dup) return res.status(400).json({ error: 'Learner is already assigned to this route' });
        return res.status(201).json(await insert({ route_id: b.route_id, learner_id: b.learner_id, stop_name: b.stop_name || null, is_active: true }));
      }
      if (resource === 'transport-attendance') {
        const { route_id, date, records } = b;
        if (!route_id || !date || !Array.isArray(records)) return res.status(400).json({ error: 'Route, date and records are required' });
        for (const r of records) {
          const { data: ex } = await supabase.from(table).select('id').eq('route_id', route_id).eq('date', date).eq('learner_id', r.learner_id).eq('trip', r.trip || 'Morning').maybeSingle();
          const row = { route_id, date, learner_id: r.learner_id, trip: r.trip || 'Morning', status: r.status || 'Present', marked_by: me.id };
          if (ex) await supabase.from(table).update(row).eq('id', ex.id);
          else await supabase.from(table).insert({ ...row, school_id: me.school_id });
        }
        await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'ops.transport_attendance', entityType: table, recordId: route_id, details: { date, count: records.length } });
        return res.status(200).json({ ok: true, saved: records.length });
      }
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // ---------------- PUT ----------------
    if (req.method === 'PUT') {
      const b = req.body || {};
      if (!b.id) return res.status(400).json({ error: 'Missing id' });
      if (!can(me, WRITE_PERM[resource])) return res.status(403).json({ error: 'Forbidden' });
      const patch = { ...b };
      delete patch.id;
      delete patch.action;
      if (resource === 'books' && patch.copies_total !== undefined) {
        const { data: cur } = await supabase.from(table).select('copies_total,copies_available').eq('id', b.id).single();
        const diff = Number(patch.copies_total) - Number(cur?.copies_total || 0);
        patch.copies_available = Math.max(0, Number(cur?.copies_available || 0) + diff);
      }
      const { data, error } = await supabase.from(table).update(patch).eq('id', b.id).select('*').single();
      if (error) throw error;
      await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: `ops.${resource}_update`, entityType: table, recordId: b.id });
      return res.status(200).json(data);
    }

    // ---------------- DELETE ----------------
    if (req.method === 'DELETE') {
      const id = req.query.id || req.body?.id;
      if (!id) return res.status(400).json({ error: 'Missing id' });
      if (!can(me, WRITE_PERM[resource])) return res.status(403).json({ error: 'Forbidden' });
      if (resource === 'books') {
        const { count } = await supabase.from('library_transactions').select('id', { count: 'exact', head: true }).eq('book_id', id).eq('status', 'Issued');
        if (count > 0) return res.status(400).json({ error: `Cannot delete: ${count} copie(s) are currently issued` });
      }
      if (resource === 'routes') {
        const { count } = await supabase.from('transport_assignments').select('id', { count: 'exact', head: true }).eq('route_id', id).eq('is_active', true);
        if (count > 0) return res.status(400).json({ error: `Cannot delete: ${count} learner(s) assigned to this route` });
      }
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: `ops.${resource}_delete`, entityType: table, recordId: id });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return serverError(res, err);
  }
}
