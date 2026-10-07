import supabase from './db-client.js';
import { preflight, getSession, can, audit, roleName, serverError, scopedLearnerIds, nextDocNumber, notifyUsers, learnerPortalUserIds } from './_auth.js';

const CATS = 'fee-categories,fee-structures,fee-items,invoices,invoice-items,payments,receipts,adjustments,scholarships,discounts,sequences,payment-methods,statement,reports';

function resourceOf(q) {
  const r = (q || '').trim();
  return CATS.split(',').includes(r) ? r : null;
}

function kenyas(d) { return d ? Number(d) : 0; }

async function recalcInvoice(invoiceId) {
  const { data: inv } = await supabase.from('invoices').select('*').eq('id', invoiceId).single();
  if (!inv || inv.status === 'Cancelled') return inv;
  const { data: items } = await supabase.from('invoice_items').select('*').eq('invoice_id', invoiceId);
  const subtotal = (items || []).reduce((s, i) => s + kenyas(i.amount), 0);
  const discountTotal = kenyas(inv.discount_total);
  const { data: pays } = await supabase.from('payments').select('amount').eq('invoice_id', invoiceId).eq('status', 'Completed');
  const paid = (pays || []).reduce((s, p) => s + kenyas(p.amount), 0);
  const total = Math.max(0, subtotal - discountTotal);
  const balance = Math.max(0, total - paid);
  const status = total === 0 ? 'Paid' : paid <= 0 ? 'Unpaid' : balance <= 0.005 ? 'Paid' : 'Partial';
  await supabase.from('invoices').update({
    subtotal, discount_total: discountTotal, total_amount: total, paid_amount: paid, balance, status, updated_at: new Date().toISOString(),
  }).eq('id', invoiceId);
  return { ...inv, subtotal, discount_total: discountTotal, total_amount: total, paid_amount: paid, balance, status };
}

async function ensureFinanceAccess(me, learnerIds) {
  // Staff with finance perms: full; parents/learners: own scope only (read-only enforced per-method)
  if (can(me, ['finance.invoices', 'finance.payments', 'finance.reports', 'dashboard.admin', 'dashboard.finance'])) return { scope: null, readonly: false };
  const scoped = await scopedLearnerIds(me);
  if (scoped === null) return { scope: null, readonly: false, forbidden: true };
  if (!can(me, 'finance.view') && !['Parent/Guardian', 'Learner'].includes(roleName(me))) return { forbidden: true };
  const wanted = learnerIds ? (Array.isArray(learnerIds) ? learnerIds : [learnerIds]).map(Number) : null;
  if (wanted && wanted.some((id) => !scoped.includes(id))) return { forbidden: true };
  return { scope: scoped, readonly: true };
}

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    const me = session.profile;
    const resource = resourceOf(req.query.resource);
    if (!resource) return res.status(400).json({ error: 'Unknown resource' });

    const canStruct = can(me, 'finance.structures');
    const canInv = can(me, 'finance.invoices');
    const canPay = can(me, 'finance.payments');
    const canRep = can(me, ['finance.reports', 'dashboard.finance', 'dashboard.admin']);

    // ---------------- GET ----------------
    if (req.method === 'GET') {
      if (resource === 'fee-categories') {
        if (!can(me, ['finance.structures', 'finance.invoices', 'finance.payments', 'finance.reports', 'dashboard.finance', 'dashboard.admin'])) return res.status(403).json({ error: 'Forbidden' });
        const { data, error } = await supabase.from('fee_categories').select('*').order('name');
        if (error) throw error;
        return res.status(200).json(data);
      }
      if (resource === 'payment-methods') {
        if (!can(me, ['finance.structures', 'finance.invoices', 'finance.payments', 'finance.reports', 'dashboard.finance', 'dashboard.admin'])) return res.status(403).json({ error: 'Forbidden' });
        const { data, error } = await supabase.from('payment_methods').select('*').order('name');
        if (error) throw error;
        return res.status(200).json(data);
      }
      if (resource === 'sequences') {
        if (!canStruct) return res.status(403).json({ error: 'Forbidden' });
        const { data, error } = await supabase.from('invoice_sequences').select('*').order('kind');
        if (error) throw error;
        return res.status(200).json(data);
      }
      if (resource === 'fee-structures') {
        if (!can(me, ['finance.structures', 'finance.invoices', 'finance.reports', 'dashboard.finance', 'dashboard.admin'])) return res.status(403).json({ error: 'Forbidden' });
        let q = supabase.from('fee_structures').select('*').order('id', { ascending: false });
        if (req.query.academic_year_id) q = q.eq('academic_year_id', req.query.academic_year_id);
        if (req.query.term_id) q = q.eq('term_id', req.query.term_id);
        if (req.query.grade_id) q = q.eq('grade_id', req.query.grade_id);
        if (req.query.stream_id) q = q.eq('stream_id', req.query.stream_id);
        const { data, error } = await q;
        if (error) throw error;
        if (!data.length) return res.status(200).json([]);
        const ids = data.map((s) => s.id);
        const { data: items } = await supabase.from('fee_items').select('*, fee_categories(name)').in('fee_structure_id', ids);
        const byStruct = {};
        (items || []).forEach((i) => { (byStruct[i.fee_structure_id] = byStruct[i.fee_structure_id] || []).push({ ...i, category_name: i.fee_categories?.name || '' }); });
        const [years, terms, grades, streams] = await Promise.all([
          supabase.from('academic_years').select('id,name'), supabase.from('terms').select('id,name'),
          supabase.from('grades').select('id,name,code'), supabase.from('streams').select('id,name'),
        ]);
        const y = Object.fromEntries((years.data || []).map((x) => [x.id, x.name]));
        const t = Object.fromEntries((terms.data || []).map((x) => [x.id, x.name]));
        const g = Object.fromEntries((grades.data || []).map((x) => [x.id, x.code || x.name]));
        const s = Object.fromEntries((streams.data || []).map((x) => [x.id, x.name]));
        return res.status(200).json(data.map((row) => ({
          ...row, items: byStruct[row.id] || [], total: (byStruct[row.id] || []).reduce((a, i) => a + kenyas(i.amount), 0),
          year_name: y[row.academic_year_id] || '', term_name: row.term_id ? (t[row.term_id] || '') : 'All terms',
          grade_name: row.grade_id ? (g[row.grade_id] || '') : 'All grades', stream_name: row.stream_id ? (s[row.stream_id] || '') : 'All streams',
        })));
      }
      if (resource === 'fee-items') {
        if (!can(me, ['finance.structures', 'finance.invoices', 'dashboard.finance', 'dashboard.admin'])) return res.status(403).json({ error: 'Forbidden' });
        let q = supabase.from('fee_items').select('*, fee_categories(name)').order('id');
        if (req.query.fee_structure_id) q = q.eq('fee_structure_id', req.query.fee_structure_id);
        const { data, error } = await q;
        if (error) throw error;
        return res.status(200).json((data || []).map((i) => ({ ...i, category_name: i.fee_categories?.name || '' })));
      }
      if (resource === 'invoices') {
        const gate = await ensureFinanceAccess(me, req.query.learner_id || null);
        if (gate.forbidden) return res.status(403).json({ error: 'Forbidden' });
        if (req.query.id) {
          const { data: inv, error } = await supabase.from('invoices').select('*').eq('id', req.query.id).single();
          if (error) throw error;
          if (gate.scope && !gate.scope.includes(inv.learner_id)) return res.status(403).json({ error: 'Forbidden' });
          const [items, pays, learner, receipts] = await Promise.all([
            supabase.from('invoice_items').select('*').eq('invoice_id', inv.id),
            supabase.from('payments').select('*').eq('invoice_id', inv.id).order('payment_date', { ascending: false }),
            supabase.from('learners').select('id,admission_no,first_name,last_name,grade_id,stream_id').eq('id', inv.learner_id).maybeSingle(),
            supabase.from('receipts').select('*').eq('invoice_id', inv.id).order('id', { ascending: false }),
          ]);
          const normalizedItems = (items.data || []).map((i) => ({
            ...i,
            description: i.description ?? i.name ?? '',
            unit_amount: i.unit_amount ?? (Number(i.quantity || 1) ? Number(i.amount || 0) / Number(i.quantity || 1) : 0),
            discount_amount: i.discount_amount ?? 0,
            line_total: i.line_total ?? i.total ?? i.amount ?? 0,
          }));
          return res.status(200).json({ ...inv, items: normalizedItems, payments: pays.data || [], learner: learner.data, receipts: receipts.data || [] });
        }
        let q = supabase.from('invoices').select('*').order('id', { ascending: false }).limit(Math.min(Number(req.query.limit) || 200, 1000));
        if (gate.scope) q = q.in('learner_id', gate.scope.length ? gate.scope : [-1]);
        if (req.query.learner_id) q = q.eq('learner_id', req.query.learner_id);
        if (req.query.status) q = q.eq('status', req.query.status);
        if (req.query.term_id) q = q.eq('term_id', req.query.term_id);
        if (req.query.academic_year_id) q = q.eq('academic_year_id', req.query.academic_year_id);
        const { data, error } = await q;
        if (error) throw error;
        if (!data.length) return res.status(200).json([]);
        const lids = [...new Set(data.map((i) => i.learner_id))];
        const { data: learners } = await supabase.from('learners').select('id,admission_no,first_name,last_name').in('id', lids);
        const lm = Object.fromEntries((learners || []).map((l) => [l.id, l]));
        return res.status(200).json(data.map((i) => ({ ...i, learner_name: lm[i.learner_id] ? `${lm[i.learner_id].first_name} ${lm[i.learner_id].last_name}` : '', admission_no: lm[i.learner_id]?.admission_no || '' })));
      }
      if (resource === 'payments') {
        const gate = await ensureFinanceAccess(me, req.query.learner_id || null);
        if (gate.forbidden) return res.status(403).json({ error: 'Forbidden' });
        let q = supabase.from('payments').select('*').order('payment_date', { ascending: false }).order('id', { ascending: false }).limit(Math.min(Number(req.query.limit) || 200, 1000));
        if (gate.scope) q = q.in('learner_id', gate.scope.length ? gate.scope : [-1]);
        if (req.query.learner_id) q = q.eq('learner_id', req.query.learner_id);
        if (req.query.invoice_id) q = q.eq('invoice_id', req.query.invoice_id);
        if (req.query.from) q = q.gte('payment_date', req.query.from);
        if (req.query.to) q = q.lte('payment_date', req.query.to);
        const { data, error } = await q;
        if (error) throw error;
        if (!data.length) return res.status(200).json([]);
        const lids = [...new Set(data.map((p) => p.learner_id))];
        const iids = [...new Set(data.map((p) => p.invoice_id).filter(Boolean))];
        const [learners, invoices] = await Promise.all([
          supabase.from('learners').select('id,admission_no,first_name,last_name').in('id', lids),
          iids.length ? supabase.from('invoices').select('id,invoice_no').in('id', iids) : { data: [] },
        ]);
        const lm = Object.fromEntries((learners.data || []).map((l) => [l.id, l]));
        const im = Object.fromEntries((invoices.data || []).map((i) => [i.id, i.invoice_no]));
        return res.status(200).json(data.map((p) => ({ ...p, learner_name: lm[p.learner_id] ? `${lm[p.learner_id].first_name} ${lm[p.learner_id].last_name}` : '', admission_no: lm[p.learner_id]?.admission_no || '', invoice_no: im[p.invoice_id] || '' })));
      }
      if (resource === 'receipts') {
        const gate = await ensureFinanceAccess(me, req.query.learner_id || null);
        if (gate.forbidden) return res.status(403).json({ error: 'Forbidden' });
        if (req.query.id) {
          const { data: rc, error } = await supabase.from('receipts').select('*').eq('id', req.query.id).single();
          if (error) throw error;
          const { data: pay } = await supabase.from('payments').select('*').eq('id', rc.payment_id).maybeSingle();
          if (gate.scope && pay && !gate.scope.includes(pay.learner_id)) return res.status(403).json({ error: 'Forbidden' });
          const [learner, inv, school] = await Promise.all([
            pay ? supabase.from('learners').select('id,admission_no,first_name,middle_name,last_name').eq('id', pay.learner_id).maybeSingle() : { data: null },
            pay?.invoice_id ? supabase.from('invoices').select('id,invoice_no').eq('id', pay.invoice_id).maybeSingle() : { data: null },
            supabase.from('schools').select('*').order('id').limit(1).maybeSingle(),
          ]);
          return res.status(200).json({ ...rc, payment: pay, learner: learner.data, invoice: inv.data, school: school.data });
        }
        let q = supabase.from('receipts').select('*').order('id', { ascending: false }).limit(Math.min(Number(req.query.limit) || 200, 1000));
        if (req.query.invoice_id) q = q.eq('invoice_id', req.query.invoice_id);
        const { data, error } = await q;
        if (error) throw error;
        if (gate.scope) {
          const pids = [...new Set((data || []).map((r) => r.payment_id))];
          if (!pids.length) return res.status(200).json([]);
          const { data: pays } = await supabase.from('payments').select('id,learner_id').in('id', pids);
          const ok = new Set((pays || []).filter((p) => gate.scope.includes(p.learner_id)).map((p) => p.id));
          return res.status(200).json((data || []).filter((r) => ok.has(r.payment_id)));
        }
        return res.status(200).json(data);
      }
      if (resource === 'adjustments' || resource === 'scholarships' || resource === 'discounts') {
        const table = resource === 'adjustments' ? 'financial_adjustments' : resource;
        const gate = await ensureFinanceAccess(me, req.query.learner_id || null);
        if (gate.forbidden) return res.status(403).json({ error: 'Forbidden' });
        if (gate.scope && resource === 'adjustments') return res.status(200).json([]); // adjustments stay internal
        let q = supabase.from(table).select('*').order('id', { ascending: false }).limit(500);
        if (gate.scope) q = q.in('learner_id', gate.scope.length ? gate.scope : [-1]);
        if (req.query.learner_id) q = q.eq('learner_id', req.query.learner_id);
        if (req.query.term_id) q = q.eq('term_id', req.query.term_id);
        const { data, error } = await q;
        if (error) throw error;
        return res.status(200).json(data);
      }
      if (resource === 'statement') {
        const learnerId = Number(req.query.learner_id);
        if (!learnerId) return res.status(400).json({ error: 'learner_id is required' });
        const gate = await ensureFinanceAccess(me, learnerId);
        if (gate.forbidden) return res.status(403).json({ error: 'Forbidden' });
        const termId = req.query.term_id ? Number(req.query.term_id) : null;
        const yearId = req.query.academic_year_id ? Number(req.query.academic_year_id) : null;
        let iq = supabase.from('invoices').select('*').eq('learner_id', learnerId).neq('status', 'Cancelled').order('issue_date');
        if (termId) iq = iq.eq('term_id', termId);
        if (yearId) iq = iq.eq('academic_year_id', yearId);
        const [{ data: invoices }, { data: pays }, { data: adjs }, { data: learner }] = await Promise.all([
          iq,
          supabase.from('payments').select('*').eq('learner_id', learnerId).eq('status', 'Completed').order('payment_date'),
          supabase.from('financial_adjustments').select('*').eq('learner_id', learnerId).order('adjustment_date'),
          supabase.from('learners').select('id,admission_no,first_name,middle_name,last_name').eq('id', learnerId).maybeSingle(),
        ]);
        const charges = (invoices || []).reduce((s, i) => s + kenyas(i.total_amount), 0);
        const discounts = (invoices || []).reduce((s, i) => s + kenyas(i.discount_total), 0);
        const paid = (pays || []).reduce((s, p) => s + kenyas(p.amount), 0);
        const adjNet = (adjs || []).reduce((s, a) => s + (a.adjustment_type === 'Credit' ? -kenyas(a.amount) : kenyas(a.amount)), 0);
        const lines = [
          ...(invoices || []).map((i) => ({ date: i.issue_date, type: 'Charge', ref: i.invoice_no, description: `Invoice ${i.invoice_no}`, debit: kenyas(i.total_amount), credit: 0 })),
          ...(pays || []).map((p) => ({ date: p.payment_date, type: 'Payment', ref: p.payment_no, description: `Payment ${p.payment_no} (${p.payment_method})`, debit: 0, credit: kenyas(p.amount) })),
          ...(adjs || []).map((a) => ({ date: a.adjustment_date, type: a.adjustment_type, ref: `ADJ-${a.id}`, description: a.reason || a.adjustment_type, debit: a.adjustment_type === 'Debit' ? kenyas(a.amount) : 0, credit: a.adjustment_type === 'Credit' ? kenyas(a.amount) : 0 })),
        ].sort((a, b) => String(a.date).localeCompare(String(b.date)));
        return res.status(200).json({
          learner, invoices: invoices || [], payments: pays || [], adjustments: adjs || [], lines,
          summary: { charges, discounts, payments: paid, adjustments_net: adjNet, balance: Math.max(0, charges + adjNet - paid) },
        });
      }
      if (resource === 'reports') {
        if (!canRep) return res.status(403).json({ error: 'Forbidden' });
        const kind = req.query.kind || 'daily';
        if (kind === 'daily' || kind === 'term') {
          const from = req.query.from || (kind === 'daily' ? new Date().toISOString().slice(0, 10) : '2000-01-01');
          const to = req.query.to || new Date().toISOString().slice(0, 10);
          const { data: pays } = await supabase.from('payments').select('*').eq('status', 'Completed').gte('payment_date', from).lte('payment_date', to).order('payment_date');
          const rows = pays || [];
          const byMethod = {};
          rows.forEach((p) => { byMethod[p.payment_method] = (byMethod[p.payment_method] || 0) + kenyas(p.amount); });
          return res.status(200).json({ kind, from, to, total: rows.reduce((s, p) => s + kenyas(p.amount), 0), count: rows.length, by_method: byMethod, payments: rows });
        }
        if (kind === 'outstanding' || kind === 'arrears') {
          const { data: invs } = await supabase.from('invoices').select('*').in('status', ['Unpaid', 'Partial']).order('due_date');
          const rows = (invs || []).filter((i) => kenyas(i.balance) > 0.005);
          const lids = [...new Set(rows.map((i) => i.learner_id))];
          const { data: learners } = lids.length ? await supabase.from('learners').select('id,admission_no,first_name,last_name,grade_id,stream_id').in('id', lids) : { data: [] };
          const lm = Object.fromEntries((learners || []).map((l) => [l.id, l]));
          return res.status(200).json({ kind, total: rows.reduce((s, i) => s + kenyas(i.balance), 0), count: rows.length, rows: rows.map((i) => ({ ...i, learner: lm[i.learner_id] || null })) });
        }
        if (kind === 'discounts') {
          let q = supabase.from('invoices').select('id,invoice_no,learner_id,discount_total,issue_date').gt('discount_total', 0).order('issue_date', { ascending: false }).limit(500);
          if (req.query.from) q = q.gte('issue_date', req.query.from);
          if (req.query.to) q = q.lte('issue_date', req.query.to);
          const { data } = await q;
          const { data: sch } = await supabase.from('scholarships').select('*').order('id', { ascending: false }).limit(500);
          const { data: dis } = await supabase.from('discounts').select('*').order('id', { ascending: false }).limit(500);
          return res.status(200).json({ kind, invoice_discounts: data || [], scholarships: sch || [], discounts: dis || [] });
        }
        return res.status(400).json({ error: 'Unknown report kind' });
      }
    }

    // ---------------- POST ----------------
    if (req.method === 'POST') {
      const b = req.body || {};
      if (resource === 'fee-categories') {
        if (!canStruct) return res.status(403).json({ error: 'Forbidden' });
        if (!b.name) return res.status(400).json({ error: 'Category name is required' });
        const { data, error } = await supabase.from('fee_categories').insert({ name: b.name, code: b.code || null, description: b.description || null, is_active: b.is_active !== false }).select('*').single();
        if (error) throw error;
        await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'finance.category_create', entityType: 'fee_categories', recordId: data.id, details: { name: b.name } });
        return res.status(201).json(data);
      }
      if (resource === 'payment-methods') {
        if (!canStruct) return res.status(403).json({ error: 'Forbidden' });
        if (!b.name) return res.status(400).json({ error: 'Method name is required' });
        const { data, error } = await supabase.from('payment_methods').insert({ name: b.name, code: b.code || null, requires_reference: !!b.requires_reference, is_active: b.is_active !== false }).select('*').single();
        if (error) throw error;
        await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'finance.method_create', entityType: 'payment_methods', recordId: data.id, details: { name: b.name } });
        return res.status(201).json(data);
      }
      if (resource === 'sequences') {
        if (!canStruct) return res.status(403).json({ error: 'Forbidden' });
        if (!b.kind || !b.prefix) return res.status(400).json({ error: 'Kind and prefix are required' });
        if (b.is_default) await supabase.from('invoice_sequences').update({ is_default: false }).eq('kind', b.kind);
        const { data, error } = await supabase.from('invoice_sequences').insert({ kind: b.kind, name: b.name || b.kind, prefix: b.prefix, suffix: b.suffix || null, next_number: b.next_number || 1, padding: b.padding ?? 4, is_default: !!b.is_default }).select('*').single();
        if (error) throw error;
        await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'finance.sequence_create', entityType: 'invoice_sequences', recordId: data.id, details: { kind: b.kind } });
        return res.status(201).json(data);
      }
      if (resource === 'fee-structures') {
        if (!canStruct) return res.status(403).json({ error: 'Forbidden' });
        if (!b.name || !b.academic_year_id) return res.status(400).json({ error: 'Name and academic year are required' });
        const { data, error } = await supabase.from('fee_structures').insert({
          school_id: me.school_id, name: b.name, academic_year_id: b.academic_year_id, term_id: b.term_id || null,
          grade_id: b.grade_id || null, stream_id: b.stream_id || null, is_active: b.is_active !== false, notes: b.notes || null,
        }).select('*').single();
        if (error) throw error;
        await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'finance.structure_create', entityType: 'fee_structures', recordId: data.id, details: { name: b.name } });
        return res.status(201).json(data);
      }
      if (resource === 'fee-items') {
        if (!canStruct) return res.status(403).json({ error: 'Forbidden' });
        if (!b.fee_structure_id || !b.fee_category_id || b.amount === undefined) return res.status(400).json({ error: 'Structure, category and amount are required' });
        const { data, error } = await supabase.from('fee_items').insert({
          fee_structure_id: b.fee_structure_id, fee_category_id: b.fee_category_id, name: b.name || null,
          amount: Number(b.amount), is_mandatory: b.is_mandatory !== false, learner_id: b.learner_id || null, notes: b.notes || null,
        }).select('*').single();
        if (error) throw error;
        await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'finance.item_create', entityType: 'fee_items', recordId: data.id, details: { structure_id: b.fee_structure_id } });
        return res.status(201).json(data);
      }
      if (resource === 'invoices') {
        if (!canInv) return res.status(403).json({ error: 'Forbidden' });
        const { action } = b;
        if (action === 'generate') {
          // Bulk-generate invoices from a fee structure for matching learners
          const { fee_structure_id, academic_year_id, term_id, due_date } = b;
          if (!fee_structure_id || !academic_year_id || !term_id) return res.status(400).json({ error: 'Fee structure, academic year and term are required' });
          const { data: struct } = await supabase.from('fee_structures').select('*').eq('id', fee_structure_id).single();
          if (!struct) return res.status(400).json({ error: 'Fee structure not found' });
          const { data: items } = await supabase.from('fee_items').select('*, fee_categories(name)').eq('fee_structure_id', fee_structure_id);
          if (!items?.length) return res.status(400).json({ error: 'Fee structure has no items' });
          let lq = supabase.from('learners').select('id,grade_id,stream_id').eq('status', 'Active');
          if (struct.grade_id) lq = lq.eq('grade_id', struct.grade_id);
          if (struct.stream_id) lq = lq.eq('stream_id', struct.stream_id);
          const { data: learners } = await lq;
          if (!learners?.length) return res.status(400).json({ error: 'No matching active learners' });
          const { data: existing } = await supabase.from('invoices').select('learner_id').eq('academic_year_id', academic_year_id).eq('term_id', term_id).neq('status', 'Cancelled');
          const have = new Set((existing || []).map((e) => e.learner_id));
          let created = 0, skipped = 0;
          for (const l of learners) {
            if (have.has(l.id)) { skipped++; continue; }
            const applicable = items.filter((i) => !i.learner_id || i.learner_id === l.id);
            const subtotal = applicable.reduce((s, i) => s + kenyas(i.amount), 0);
            const invoice_no = await nextDocNumber('invoice', 'INV');
            const { data: inv, error: invErr } = await supabase.from('invoices').insert({
              school_id: me.school_id, invoice_no, learner_id: l.id, academic_year_id, term_id,
              fee_structure_id, issue_date: new Date().toISOString().slice(0, 10), due_date: due_date || null,
              subtotal, discount_total: 0, total_amount: subtotal, paid_amount: 0, balance: subtotal, status: 'Unpaid', created_by: me.id,
            }).select('*').single();
            if (invErr) throw invErr;
            await supabase.from('invoice_items').insert(applicable.map((i) => ({
              invoice_id: inv.id, fee_category_id: i.fee_category_id, name: i.name || i.fee_categories?.name || 'Fee',
              amount: kenyas(i.amount), quantity: 1, total: kenyas(i.amount),
            })));
            created++;
          }
          await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'finance.invoices_generate', entityType: 'invoices', recordId: null, details: { structure_id: fee_structure_id, created, skipped } });
          // Notify finance-relevant users is noisy in bulk; skip fan-out here.
          return res.status(201).json({ created, skipped });
        }
        // Single manual invoice
        const { learner_id, academic_year_id, term_id, due_date, items, discount_total, notes } = b;
        if (!learner_id || !academic_year_id || !term_id || !Array.isArray(items) || !items.length) {
          return res.status(400).json({ error: 'Learner, academic year, term and at least one item are required' });
        }
        const invoice_no = b.invoice_no || await nextDocNumber('invoice', 'INV');
        if (b.invoice_no) {
          const { data: dup } = await supabase.from('invoices').select('id').eq('invoice_no', b.invoice_no).maybeSingle();
          if (dup) return res.status(400).json({ error: 'Invoice number already exists' });
        }
        const subtotal = items.reduce((s, i) => s + kenyas(i.quantity || 1) * kenyas(i.unit_amount), 0);
        const disc = kenyas(discount_total) + items.reduce((s, i) => s + kenyas(i.discount_amount), 0);
        const total = Math.max(0, subtotal - disc);
        const { data: inv, error } = await supabase.from('invoices').insert({
          school_id: me.school_id, invoice_no, learner_id, academic_year_id, term_id, issue_date: new Date().toISOString().slice(0, 10),
          due_date: due_date || null, subtotal, discount_total: disc, total_amount: total, paid_amount: 0, balance: total,
          status: 'Unpaid', notes: notes || null, created_by: me.id,
        }).select('*').single();
        if (error) throw error;
        await supabase.from('invoice_items').insert(items.map((i) => {
          const quantity = Number(i.quantity || 1);
          const unitAmount = kenyas(i.unit_amount);
          const discount = kenyas(i.discount_amount);
          const totalLine = Math.max(0, quantity * unitAmount - discount);
          return {
            invoice_id: inv.id,
            fee_category_id: i.fee_category_id || null,
            name: i.description || 'Fee item',
            amount: quantity * unitAmount,
            quantity,
            total: totalLine,
          };
        }));
        await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'finance.invoice_create', entityType: 'invoices', recordId: inv.id, details: { previous: null, new: { invoice_no, total } } });
        await notifyUsers(await learnerPortalUserIds(learner_id), { type: 'fee', title: `New fee invoice ${invoice_no}`, body: `Amount due: KES ${total.toLocaleString()}`, link: `/finance?tab=invoices` });
        return res.status(201).json(inv);
      }
      if (resource === 'payments') {
        if (!canPay) return res.status(403).json({ error: 'Forbidden' });
        const { learner_id, invoice_id, amount, payment_method, payment_date, reference_no, notes } = b;
        if (!learner_id || !amount || Number(amount) <= 0 || !payment_method) {
          return res.status(400).json({ error: 'Learner, positive amount and payment method are required' });
        }
        if (reference_no) {
          const { data: dup } = await supabase.from('payments').select('id').eq('reference_no', reference_no).maybeSingle();
          if (dup) return res.status(400).json({ error: 'This transaction reference has already been used' });
        }
        let invoice = null;
        if (invoice_id) {
          const { data } = await supabase.from('invoices').select('*').eq('id', invoice_id).single();
          invoice = data;
          if (!invoice) return res.status(400).json({ error: 'Invoice not found' });
          if (invoice.status === 'Cancelled') return res.status(400).json({ error: 'Cannot pay a cancelled invoice' });
          if (Number(amount) - kenyas(invoice.balance) > 0.005) return res.status(400).json({ error: `Amount exceeds invoice balance of KES ${kenyas(invoice.balance).toLocaleString()}` });
        }
        const payment_no = await nextDocNumber('payment', 'PAY');
        const { data: pay, error } = await supabase.from('payments').insert({
          school_id: me.school_id, payment_no, learner_id, invoice_id: invoice_id || null, amount: Number(amount),
          payment_method, payment_date: payment_date || new Date().toISOString().slice(0, 10),
          reference_no: reference_no || null, received_by: me.id, notes: notes || null, status: 'Completed',
        }).select('*').single();
        if (error) throw error;
        const receipt_no = await nextDocNumber('receipt', 'RCP');
        const { data: receipt } = await supabase.from('receipts').insert({
          school_id: me.school_id, receipt_no, payment_id: pay.id, invoice_id: invoice_id || null,
          amount: Number(amount), issued_by: me.id,
        }).select('*').single();
        let updated = null;
        if (invoice_id) updated = await recalcInvoice(invoice_id);
        await audit({
          userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'finance.payment_record', entityType: 'payments', recordId: pay.id,
          details: { previous: invoice ? { invoice_id, balance: invoice.balance, status: invoice.status } : null, new: { payment_no, amount: Number(amount), receipt_no, invoice_status: updated?.status, invoice_balance: updated?.balance } },
        });
        await notifyUsers(await learnerPortalUserIds(learner_id), { type: 'fee', title: `Payment received — ${receipt_no}`, body: `KES ${Number(amount).toLocaleString()} via ${payment_method}. Receipt ${receipt_no}.`, link: `/finance?tab=receipts` });
        return res.status(201).json({ ...pay, receipt });
      }
      if (resource === 'adjustments') {
        if (!canPay) return res.status(403).json({ error: 'Forbidden' });
        const { learner_id, invoice_id, adjustment_type, amount, reason } = b;
        if (!learner_id || !adjustment_type || !amount || Number(amount) <= 0 || !reason) {
          return res.status(400).json({ error: 'Learner, type (Credit/Debit), positive amount and reason are required' });
        }
        const { data, error } = await supabase.from('financial_adjustments').insert({
          school_id: me.school_id, learner_id, invoice_id: invoice_id || null, adjustment_type,
          amount: Number(amount), reason, adjustment_date: b.adjustment_date || new Date().toISOString().slice(0, 10), created_by: me.id,
        }).select('*').single();
        if (error) throw error;
        await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'finance.adjustment_create', entityType: 'financial_adjustments', recordId: data.id, details: { previous: null, new: data } });
        return res.status(201).json(data);
      }
      if (resource === 'scholarships' || resource === 'discounts') {
        if (!canStruct) return res.status(403).json({ error: 'Forbidden' });
        const table = resource === 'scholarships' ? 'scholarships' : 'discounts';
        if (!b.name || b.value === undefined) return res.status(400).json({ error: 'Name and value are required' });
        const { data, error } = await supabase.from(table).insert({
          school_id: me.school_id, name: b.name, description: b.description || null,
          value_type: b.value_type || 'Fixed', value: Number(b.value),
          learner_id: b.learner_id || null, academic_year_id: b.academic_year_id || null, term_id: b.term_id || null,
          is_active: b.is_active !== false,
        }).select('*').single();
        if (error) throw error;
        await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: `finance.${resource}_create`, entityType: table, recordId: data.id, details: { name: b.name } });
        return res.status(201).json(data);
      }
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // ---------------- PUT ----------------
    if (req.method === 'PUT') {
      const b = req.body || {};
      if (!b.id) return res.status(400).json({ error: 'Missing id' });
      const simpleTables = {
        'fee-categories': ['fee_categories', 'finance.structures'],
        'payment-methods': ['payment_methods', 'finance.structures'],
        sequences: ['invoice_sequences', 'finance.structures'],
        'fee-structures': ['fee_structures', 'finance.structures'],
        'fee-items': ['fee_items', 'finance.structures'],
        scholarships: ['scholarships', 'finance.structures'],
        discounts: ['discounts', 'finance.structures'],
      };
      if (simpleTables[resource]) {
        const [table, perm] = simpleTables[resource];
        if (!can(me, perm)) return res.status(403).json({ error: 'Forbidden' });
        if (resource === 'sequences' && b.is_default) await supabase.from(table).update({ is_default: false }).eq('kind', b.kind || '').neq('id', b.id);
        const patch = { ...b };
        delete patch.id;
        const { data, error } = await supabase.from(table).update(patch).eq('id', b.id).select('*').single();
        if (error) throw error;
        await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: `finance.${resource}_update`, entityType: table, recordId: b.id, details: { new: patch } });
        return res.status(200).json(data);
      }
      if (resource === 'invoices') {
        if (!canInv) return res.status(403).json({ error: 'Forbidden' });
        const { data: prev } = await supabase.from('invoices').select('*').eq('id', b.id).single();
        if (!prev) return res.status(404).json({ error: 'Invoice not found' });
        const patch = {};
        if (b.due_date !== undefined) patch.due_date = b.due_date || null;
        if (b.notes !== undefined) patch.notes = b.notes || null;
        if (b.status === 'Cancelled') {
          if (kenyas(prev.paid_amount) > 0) return res.status(400).json({ error: 'Cannot cancel an invoice that has payments. Reverse the payments first.' });
          patch.status = 'Cancelled';
          patch.balance = 0;
        } else if (b.status && b.status !== prev.status) {
          return res.status(400).json({ error: 'Invoice status is system-managed. You may only cancel unpaid invoices.' });
        }
        patch.updated_at = new Date().toISOString();
        const { data, error } = await supabase.from('invoices').update(patch).eq('id', b.id).select('*').single();
        if (error) throw error;
        await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'finance.invoice_update', entityType: 'invoices', recordId: b.id, details: { previous: prev, new: data } });
        return res.status(200).json(data);
      }
      if (resource === 'payments') {
        // Only voiding (reversal) + notes edits; amounts/dates immutable for integrity
        if (!canPay) return res.status(403).json({ error: 'Forbidden' });
        const { data: prev } = await supabase.from('payments').select('*').eq('id', b.id).single();
        if (!prev) return res.status(404).json({ error: 'Payment not found' });
        if (b.status === 'Voided' && prev.status !== 'Voided') {
          if (!b.void_reason) return res.status(400).json({ error: 'A void reason is required' });
          const { data, error } = await supabase.from('payments').update({ status: 'Voided', notes: `${prev.notes || ''}\n[VOIDED ${new Date().toISOString().slice(0, 10)}] ${b.void_reason}`.trim() }).eq('id', b.id).select('*').single();
          if (error) throw error;
          if (prev.invoice_id) await recalcInvoice(prev.invoice_id);
          await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'finance.payment_void', entityType: 'payments', recordId: b.id, details: { previous: { status: prev.status, amount: prev.amount }, new: { status: 'Voided', void_reason: b.void_reason } } });
          return res.status(200).json(data);
        }
        if (b.notes !== undefined && Object.keys(b).every((k) => ['id', 'notes'].includes(k))) {
          const { data, error } = await supabase.from('payments').update({ notes: b.notes }).eq('id', b.id).select('*').single();
          if (error) throw error;
          await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'finance.payment_note', entityType: 'payments', recordId: b.id });
          return res.status(200).json(data);
        }
        return res.status(400).json({ error: 'Payments are immutable. You may only void (with reason) or edit notes.' });
      }
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // ---------------- DELETE ----------------
    if (req.method === 'DELETE') {
      const id = req.query.id || req.body?.id;
      if (!id) return res.status(400).json({ error: 'Missing id' });
      if (resource === 'fee-structures') {
        if (!canStruct) return res.status(403).json({ error: 'Forbidden' });
        const { count } = await supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('fee_structure_id', id);
        if (count > 0) return res.status(400).json({ error: `Cannot delete: ${count} invoice(s) were generated from this structure` });
        await supabase.from('fee_items').delete().eq('fee_structure_id', id);
        const { error } = await supabase.from('fee_structures').delete().eq('id', id);
        if (error) throw error;
        await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'finance.structure_delete', entityType: 'fee_structures', recordId: id });
        return res.status(200).json({ ok: true });
      }
      if (resource === 'fee-items') {
        if (!canStruct) return res.status(403).json({ error: 'Forbidden' });
        const { error } = await supabase.from('fee_items').delete().eq('id', id);
        if (error) throw error;
        await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'finance.item_delete', entityType: 'fee_items', recordId: id });
        return res.status(200).json({ ok: true });
      }
      if (resource === 'fee-categories' || resource === 'payment-methods') {
        if (!canStruct) return res.status(403).json({ error: 'Forbidden' });
        const table = resource === 'fee-categories' ? 'fee_categories' : 'payment_methods';
        const { error } = await supabase.from(table).delete().eq('id', id);
        if (error) throw error;
        await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: `finance.${resource}_delete`, entityType: table, recordId: id });
        return res.status(200).json({ ok: true });
      }
      if (resource === 'adjustments') {
        if (!canPay) return res.status(403).json({ error: 'Forbidden' });
        const { error } = await supabase.from('financial_adjustments').delete().eq('id', id);
        if (error) throw error;
        await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'finance.adjustment_delete', entityType: 'financial_adjustments', recordId: id });
        return res.status(200).json({ ok: true });
      }
      // Invoices/payments/receipts: never hard-deleted (cancel/void only)
      return res.status(400).json({ error: 'This record cannot be deleted. Use cancel/void to preserve the audit trail.' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return serverError(res, err);
  }
}
