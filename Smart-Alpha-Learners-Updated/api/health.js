import supabase from './db-client.js';
import { preflight, envMissing, ENV_ERROR_MESSAGE } from './_auth.js';

// Public diagnostics endpoint (no secrets leaked — presence only).
// GET /api/health -> { ok, env: {...}, db: {...}, tables: {...}, counts: {...} }
export default async function handler(req, res) {
  if (preflight(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const report = {
    ok: true,
    ts: new Date().toISOString(),
    env: {
      supabase_url_set: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      service_role_set: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      anon_key_set: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    },
    db: { reachable: false, latency_ms: null, error: null },
    tables: {},
    counts: {},
    issues: [],
  };

  if (envMissing()) {
    report.ok = false;
    report.issues.push(ENV_ERROR_MESSAGE);
    return res.status(500).json(report);
  }

  const started = Date.now();
  try {
    const { error } = await supabase.from('roles').select('id', { head: true, count: 'exact' });
    report.db.latency_ms = Date.now() - started;
    if (error) {
      report.db.error = error.message;
      report.ok = false;
      report.issues.push(`roles probe failed: ${error.message}`);
    } else {
      report.db.reachable = true;
    }
  } catch (err) {
    report.db.latency_ms = Date.now() - started;
    report.db.error = err.message;
    report.ok = false;
    report.issues.push(`DB unreachable: ${err.message}`);
    return res.status(503).json(report);
  }

  const tables = [
    'schools', 'roles', 'app_users', 'academic_years', 'terms', 'levels', 'grades',
    'streams', 'learners', 'parents', 'learner_parent_links', 'teachers',
    'teacher_assignments', 'attendance_records', 'curriculum_versions', 'learning_areas',
    'strands', 'learning_outcomes', 'competencies', 'core_values',
    'pertinent_contemporary_issues', 'learner_competency_records', 'learner_observations',
    'timetable_slots', 'audit_logs',
    // Phase 3 extensions
    'fee_categories', 'fee_structures', 'fee_items', 'invoices', 'invoice_items',
    'payments', 'receipts', 'payment_methods', 'invoice_sequences', 'financial_adjustments',
    'scholarships', 'discounts', 'announcements', 'messages', 'notifications',
    'communication_providers', 'school_events', 'discipline_records', 'staff_records',
    'staff_leave', 'staff_pd', 'library_books', 'library_transactions',
    'inventory_items', 'vehicles', 'drivers', 'transport_routes', 'transport_assignments',
    'transport_attendance',
  ];
  for (const t of tables) {
    try {
      const { count, error } = await supabase.from(t).select('id', { head: true, count: 'exact' });
      if (error) {
        report.tables[t] = `MISSING/ERROR: ${error.message}`;
        report.ok = false;
      } else {
        report.tables[t] = 'ok';
        if (['roles', 'app_users', 'learners', 'teachers'].includes(t)) report.counts[t] = count ?? 0;
      }
    } catch (err) {
      report.tables[t] = `ERROR: ${err.message}`;
      report.ok = false;
    }
  }

  const missing = Object.entries(report.tables).filter(([, v]) => v !== 'ok');
  if (missing.length) {
    report.issues.push(`${missing.length} table(s) missing or unreadable — run the Phase-1 schema migration.`);
    return res.status(503).json(report);
  }
  if ((report.counts.roles ?? 0) === 0) {
    report.ok = false;
    report.issues.push('roles table is empty — seed the 7 Phase-1 roles before login/setup.');
    return res.status(503).json(report);
  }
  return res.status(200).json(report);
}
