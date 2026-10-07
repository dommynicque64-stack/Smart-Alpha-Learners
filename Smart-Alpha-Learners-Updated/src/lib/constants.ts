export const KENYA_COUNTIES = [
  'Mombasa', 'Kwale', 'Kilifi', 'Tana River', 'Lamu', 'Taita-Taveta', 'Garissa', 'Wajir', 'Mandera',
  'Marsabit', 'Isiolo', 'Meru', 'Tharaka-Nithi', 'Embu', 'Kitui', 'Machakos', 'Makueni', 'Nyandarua',
  'Nyeri', 'Kirinyaga', "Murang'a", 'Kiambu', 'Turkana', 'West Pokot', 'Samburu', 'Trans-Nzoia',
  'Uasin Gishu', 'Elgeyo-Marakwet', 'Nandi', 'Baringo', 'Laikipia', 'Nakuru', 'Narok', 'Kajiado',
  'Kericho', 'Bomet', 'Kakamega', 'Vihiga', 'Bungoma', 'Busia', 'Siaya', 'Kisumu', 'Homa Bay',
  'Migori', 'Kisii', 'Nyamira', 'Nairobi',
];

export const SCHOOL_TYPES = ['Public', 'Private', 'Faith-based', 'Special Needs', 'International'];

export const ATTENDANCE_STATUSES = ['Present', 'Absent', 'Late', 'Excused', 'Half-day'] as const;

export const CBC_RATINGS = [
  { code: 'EE1', label: 'Exceeding Expectation 1' },
  { code: 'EE2', label: 'Exceeding Expectation 2' },
  { code: 'ME1', label: 'Meeting Expectation 1' },
  { code: 'ME2', label: 'Meeting Expectation 2' },
  { code: 'AE1', label: 'Approaching Expectation 1' },
  { code: 'AE2', label: 'Approaching Expectation 2' },
  { code: 'BE1', label: 'Below Expectation 1' },
  { code: 'BE2', label: 'Below Expectation 2' },
];

export const RATING_COLORS: Record<string, string> = {
  EE1: 'bg-emerald-600', EE2: 'bg-emerald-500',
  ME1: 'bg-sky-600', ME2: 'bg-sky-500',
  AE1: 'bg-amber-500', AE2: 'bg-amber-600',
  BE1: 'bg-rose-500', BE2: 'bg-rose-700',
};

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const SCHOOL_DAYS = [1, 2, 3, 4, 5];

export const GENDER_OPTIONS = ['Male', 'Female'];
export const LEARNER_STATUSES = ['Active', 'Inactive', 'Transferred', 'Graduated', 'Suspended', 'Withdrawn'];
export const USER_STATUSES = ['Active', 'Inactive'];
export const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Volunteer', 'Intern'];
export const GUARDIAN_TYPES = ['Father', 'Mother', 'Guardian', 'Sponsor', 'Other'];
export const RELATIONSHIPS = ['Father', 'Mother', 'Guardian', 'Uncle', 'Aunt', 'Grandparent', 'Sibling', 'Sponsor', 'Other'];

export function fullName(p: { first_name?: string; middle_name?: string; last_name?: string } | null | undefined) {
  if (!p) return '—';
  return [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(' ') || '—';
}

export function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
}

export function formatDate(d?: string | null) {
  if (!d) return '—';
  try { return new Date(d.includes('T') ? d : `${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return d; }
}

export function formatDateTime(d?: string | null) {
  if (!d) return '—';
  try { return new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return d; }
}

export function todayISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function ageFromDob(dob?: string | null) {
  if (!dob) return null;
  const b = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

export function ratingLabel(code?: string | null) {
  if (!code) return '—';
  const r = CBC_RATINGS.find((x) => x.code === code);
  return r ? `${code} — ${r.label}` : code;
}
