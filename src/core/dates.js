// Date helpers. All calendar dates are local to the device.
// Dates are stored as "YYYY-MM-DD" strings. Never use `new Date('YYYY-MM-DD')`:
// it is parsed as UTC midnight and can land on the previous day in some timezones.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** "YYYY-MM-DD" -> local Date at 00:00, or null if invalid. */
export function parseDate(value) {
  const m = DATE_RE.exec(String(value ?? '').trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  // Reject overflow such as 2026-02-31.
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

/** Date -> "YYYY-MM-DD" in local time. */
export function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Today's local date as "YYYY-MM-DD". `now` is injectable for tests. */
export function today(now = new Date()) {
  return formatDate(now);
}

/** Returns a new local Date `days` days after `date` (calendar days, DST-safe). */
export function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Whole calendar days from `a` to `b` (positive when b is later). DST-safe. */
export function daysBetween(a, b) {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / MS_PER_DAY);
}

/** Monday 00:00 (local) of the week containing `date`. Weeks run Monday–Sunday. */
export function startOfWeek(date) {
  const offset = (date.getDay() + 6) % 7; // Monday = 0 ... Sunday = 6
  return addDays(date, -offset);
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const MONTHS_LONG = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

/** "2026-11-13" -> "13 November 2026" (for formal messages). "" for invalid input. */
export function formatDateLong(value) {
  const date = value instanceof Date ? value : parseDate(value);
  if (!date) return '';
  return `${date.getDate()} ${MONTHS_LONG[date.getMonth()]} ${date.getFullYear()}`;
}

/** ISO datetime -> local "YYYY-MM-DD", or "" when invalid. */
export function isoToLocalDate(iso) {
  const d = new Date(String(iso ?? ''));
  return Number.isNaN(d.getTime()) || !iso ? '' : formatDate(d);
}

/** "2026-11-13" -> "13 Nov 2026". Returns "" for invalid input. */
export function formatDateHuman(value) {
  const date = value instanceof Date ? value : parseDate(value);
  if (!date) return '';
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}
