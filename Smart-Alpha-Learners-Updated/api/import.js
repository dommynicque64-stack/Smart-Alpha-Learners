import supabase from './db-client.js';
import { preflight, getSession, can, audit } from './_auth.js';

const GENDERS = ['Male', 'Female'];

async function lookups() {
  const [grades, streams, years] = await Promise.all([
    supabase.from('grades').select('id,code,name,level_id'),
    supabase.from('streams').select('id,name,grade_id,academic_year_id'),
    supabase.from('academic_years').select('id,name,is_current'),
  ]);
  return { grades: grades.data || [], streams: streams.data || [], years: years.data || [] };
}

function validateLearners(rows, lk) {
  const errors = [];
  const valid = [];
  const seenAdm = new Set();
  const gradeByCode = {};
  lk.grades.forEach((g) => { if (g.code) gradeByCode[g.code.toLowerCase()] = g; gradeByCode[g.name.toLowerCase()] = g; });
  const streamByKey = {};
  lk.streams.forEach((s) => { streamByKey[`${s.grade_id}|${s.name.toLowerCase()}`] = s; });
  const currentYear = lk.years.find((y) => y.is_current) || lk.years[0];
  rows.forEach((r, i) => {
    const line = i + 2;
    const rowErr = [];
    const adm = (r.admission_no || '').trim();
    if (!adm) rowErr.push('admission_no is required');
    if (adm && seenAdm.has(adm.toLowerCase())) rowErr.push(`duplicate admission_no '${adm}' in file`);
    if (adm) seenAdm.add(adm.toLowerCase());
    if (!r.first_name?.trim()) rowErr.push('first_name is required');
    if (!r.last_name?.trim()) rowErr.push('last_name is required');
    const gKey = (r.grade || '').trim().toLowerCase();
    const grade = gradeByCode[gKey];
    if (!grade) rowErr.push(`unknown grade '${r.grade}' (use grade code e.g. G7)`);
    const streamName = (r.stream || '').trim().toLowerCase();
    const stream = grade && streamByKey[`${grade.id}|${streamName}`];
    if (grade && !stream) rowErr.push(`stream '${r.stream}' does not exist for grade ${r.grade} in the current year`);
    if (r.gender && !GENDERS.includes(r.gender.trim())) rowErr.push('gender must be Male or Female');
    if (r.dob && isNaN(Date.parse(r.dob))) rowErr.push('dob must be a valid date (YYYY-MM-DD)');
    if (rowErr.length) errors.push({ line, admission_no: adm || '', errors: rowErr });
    else valid.push({ idx: i, admission_no: adm, first_name: r.first_name.trim(), middle_name: r.middle_name?.trim() || null, last_name: r.last_name.trim(), dob: r.dob || null, gender: r.gender?.trim() || null, grade_id: grade.id, stream_id: stream.id, academic_year_id: stream.academic_year_id || currentYear?.id, admission_date: r.admission_date || null, previous_school: r.previous_school?.trim() || null, status: 'Active', emergency_contact_name: r.emergency_contact_name?.trim() || null, emergency_contact_phone: r.emergency_contact_phone?.trim() || null });
  });
  return { valid, errors };
}

function validateParents(rows) {
  const errors = [];
  const valid = [];
  rows.forEach((r, i) => {
    const line = i + 2;
    const rowErr = [];
    if (!r.first_name?.trim()) rowErr.push('first_name is required');
    if (!r.last_name?.trim()) rowErr.push('last_name is required');
    if (!r.phone?.trim()) rowErr.push('phone is required');
    if (r.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email.trim())) rowErr.push('email is invalid');
    if (rowErr.length) errors.push({ line, errors: rowErr });
    else valid.push({ idx: i, first_name: r.first_name.trim(), last_name: r.last_name.trim(), national_id: r.national_id?.trim() || null, phone: r.phone.trim(), alt_phone: r.alt_phone?.trim() || null, email: r.email?.trim() || null, address: r.address?.trim() || null, county: r.county?.trim() || null, occupation: r.occupation?.trim() || null, guardian_type: r.guardian_type?.trim() || 'Parent' });
  });
  return { valid, errors };
}

function validateTeachers(rows) {
  const errors = [];
  const valid = [];
  const seen = new Set();
  rows.forEach((r, i) => {
    const line = i + 2;
    const rowErr = [];
    const staff = (r.staff_no || '').trim();
    if (!staff) rowErr.push('staff_no is required');
    if (staff && seen.has(staff.toLowerCase())) rowErr.push(`duplicate staff_no '${staff}' in file`);
    if (staff) seen.add(staff.toLowerCase());
    if (!r.first_name?.trim()) rowErr.push('first_name is required');
    if (!r.last_name?.trim()) rowErr.push('last_name is required');
    if (r.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email.trim())) rowErr.push('email is invalid');
    if (rowErr.length) errors.push({ line, staff_no: staff || '', errors: rowErr });
    else valid.push({ idx: i, staff_no: staff, tsc_no: r.tsc_no?.trim() || null, first_name: r.first_name.trim(), last_name: r.last_name.trim(), phone: r.phone?.trim() || null, email: r.email?.trim() || null, qualification: r.qualification?.trim() || null, specialization: r.specialization?.trim() || null, employment_type: r.employment_type?.trim() || 'Full-time', status: 'Active', date_joined: r.date_joined || null });
  });
  return { valid, errors };
}

function validateStreams(rows, lk) {
  const errors = [];
  const valid = [];
  const gradeByCode = {};
  lk.grades.forEach((g) => { if (g.code) gradeByCode[g.code.toLowerCase()] = g; gradeByCode[g.name.toLowerCase()] = g; });
  const currentYear = lk.years.find((y) => y.is_current) || lk.years[0];
  const existing = new Set(lk.streams.map((s) => `${s.grade_id}|${s.name.toLowerCase()}|${s.academic_year_id}`));
  rows.forEach((r, i) => {
    const line = i + 2;
    const rowErr = [];
    const grade = gradeByCode[(r.grade || '').trim().toLowerCase()];
    if (!grade) rowErr.push(`unknown grade '${r.grade}'`);
    if (!r.stream?.trim()) rowErr.push('stream name is required');
    const yearName = (r.academic_year || '').trim();
    const year = yearName ? lk.years.find((y) => y.name.toLowerCase() === yearName.toLowerCase()) : currentYear;
    if (yearName && !year) rowErr.push(`unknown academic_year '${r.academic_year}'`);
    if (grade && r.stream?.trim() && year && existing.has(`${grade.id}|${r.stream.trim().toLowerCase()}|${year.id}`)) rowErr.push('this stream already exists');
    if (rowErr.length) errors.push({ line, errors: rowErr });
    else valid.push({ idx: i, grade_id: grade.id, academic_year_id: year.id, name: r.stream.trim(), capacity: r.capacity ? Number(r.capacity) : null });
  });
  return { valid, errors };
}

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    const me = session.profile;
    if (!can(me, 'import.run')) return res.status(403).json({ error: 'Forbidden' });
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { entity, rows, commit } = req.body || {};
    if (!entity || !Array.isArray(rows)) return res.status(400).json({ error: 'Entity and rows are required' });
    if (rows.length > 2000) return res.status(400).json({ error: 'Maximum 2000 rows per import' });
    const lk = await lookups();
    let result;
    if (entity === 'learners') result = validateLearners(rows, lk);
    else if (entity === 'parents') result = validateParents(rows);
    else if (entity === 'teachers') result = validateTeachers(rows);
    else if (entity === 'streams') result = validateStreams(rows, lk);
    else return res.status(400).json({ error: 'Unknown entity' });
    if (entity === 'learners' && result.valid.length) {
      const adms = result.valid.map((v) => v.admission_no);
      const { data: dups } = await supabase.from('learners').select('admission_no').in('admission_no', adms);
      const dupSet = new Set((dups || []).map((d) => d.admission_no.toLowerCase()));
      const stillValid = [];
      result.valid.forEach((v) => {
        if (dupSet.has(v.admission_no.toLowerCase())) result.errors.push({ line: v.idx + 2, admission_no: v.admission_no, errors: ['admission_no already exists in the database'] });
        else stillValid.push(v);
      });
      result.valid = stillValid;
    }
    if (entity === 'teachers' && result.valid.length) {
      const staffs = result.valid.map((v) => v.staff_no);
      const { data: dups } = await supabase.from('teachers').select('staff_no').in('staff_no', staffs);
      const dupSet = new Set((dups || []).map((d) => String(d.staff_no).toLowerCase()));
      const stillValid = [];
      result.valid.forEach((v) => {
        if (dupSet.has(String(v.staff_no).toLowerCase())) result.errors.push({ line: v.idx + 2, staff_no: v.staff_no, errors: ['staff_no already exists in the database'] });
        else stillValid.push(v);
      });
      result.valid = stillValid;
    }
    if (!commit) return res.status(200).json({ valid_count: result.valid.length, error_count: result.errors.length, errors: result.errors.slice(0, 100), valid_preview: result.valid.slice(0, 10) });
    let inserted = 0;
    if (result.valid.length) {
      const table = { learners: 'learners', parents: 'parents', teachers: 'teachers', streams: 'streams' }[entity];
      const payload = result.valid.map((v) => { const { idx, ...rest } = v; return { ...rest, ...(table !== 'streams' ? { school_id: me.school_id } : {}) }; });
      for (let i = 0; i < payload.length; i += 200) {
        const { data, error } = await supabase.from(table).insert(payload.slice(i, i + 200)).select('id');
        if (error) throw error;
        inserted += (data || []).length;
      }
      await audit({ userId: me.id, userEmail: me.email, schoolId: me.school_id, action: 'import.commit', entityType: table, recordId: null, details: { entity, inserted, skipped: result.errors.length } });
    }
    return res.status(200).json({ inserted, skipped: result.errors.length, errors: result.errors.slice(0, 100) });
  } catch (err) {
    console.error('API import error:', err);
    res.status(500).json({ error: err.message });
  }
}
