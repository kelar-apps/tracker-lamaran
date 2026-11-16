// Pure logic for interview & test schedules (sheet Jadwal): validation, grouping
// for the Jadwal tab and the "Tambah ke Google Calendar" link.

import { addDays, formatDate, parseDate, startOfWeek, today } from '../core/dates.js';
import { SCHEDULE_MODES, SCHEDULE_TYPES } from './schema.js';
import { dateValue, isTrue, newId } from './lamaran.js';

export const JADWAL_LIMITS = { lokasi_atau_link: 500, catatan: 2000 };

const TIME_RE = /^(\d{1,2})[:.](\d{2})$/;

/**
 * "9:00", "09.00" or a Sheets time fraction (0.375) -> "09:00". "" when invalid.
 */
export function timeValue(value) {
  if (typeof value === 'number' && value >= 0 && value < 1) {
    const minutes = Math.round(value * 24 * 60);
    return `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }
  const m = TIME_RE.exec(String(value ?? '').trim());
  if (!m) return '';
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return '';
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

/** "09:00" -> "09.00" (Indonesian style). */
export function formatTime(value) {
  return timeValue(value).replace(':', '.');
}

/** "09.00–10.00", "09.00", or "" for a schedule without a time. */
export function timeRangeLabel(j) {
  const start = formatTime(j.jam_mulai);
  const end = formatTime(j.jam_selesai);
  if (!start) return '';
  return end ? `${start}–${end}` : start;
}

/**
 * Validate the schedule form. Returns { errors, value }.
 * @param {Record<string, string>} input
 */
export function validateJadwal(input) {
  const str = (k) => String(input[k] ?? '').trim();
  const errors = {};
  const value = {
    jenis: SCHEDULE_TYPES.includes(str('jenis')) ? str('jenis') : '',
    tanggal: str('tanggal'),
    jam_mulai: str('jam_mulai'),
    jam_selesai: str('jam_selesai'),
    mode: SCHEDULE_MODES.includes(str('mode')) ? str('mode') : '',
    lokasi_atau_link: str('lokasi_atau_link'),
    catatan: str('catatan'),
  };

  if (!value.jenis) errors.jenis = 'Pilih jenis jadwal';
  if (!value.tanggal) errors.tanggal = 'Tanggal belum diisi';
  else if (!parseDate(value.tanggal)) errors.tanggal = 'Tanggal belum valid';

  if (value.jam_mulai) {
    if (!timeValue(value.jam_mulai)) errors.jam_mulai = 'Jam belum valid';
    else value.jam_mulai = timeValue(value.jam_mulai);
  }
  if (value.jam_selesai) {
    if (!timeValue(value.jam_selesai)) errors.jam_selesai = 'Jam belum valid';
    else if (!value.jam_mulai) errors.jam_selesai = 'Isi jam mulai dulu';
    else if (timeValue(value.jam_selesai) <= value.jam_mulai) errors.jam_selesai = 'Jam selesai harus setelah jam mulai';
    else value.jam_selesai = timeValue(value.jam_selesai);
  }

  for (const [key, max] of Object.entries(JADWAL_LIMITS)) {
    if (value[key].length > max) errors[key] = `Maksimal ${max} karakter, ya`;
  }
  return { errors, value };
}

export function createJadwal(lamaranId, value, { id = newId() } = {}) {
  return { id, lamaran_id: lamaranId, ...value, selesai: false };
}

/** Sort key "YYYY-MM-DD HH:MM" (no time sorts first within a day). */
function sortKey(j) {
  return `${dateValue(j.tanggal)} ${timeValue(j.jam_mulai) || '00:00'}`;
}

export const GROUPS = [
  { key: 'today', title: 'Hari ini' },
  { key: 'week', title: 'Minggu ini' },
  { key: 'later', title: 'Nanti' },
  { key: 'past', title: 'Sudah lewat' },
];

/** Which group a schedule belongs to, by calendar date. Weeks run Monday–Sunday. */
export function groupKey(j, now = new Date()) {
  const date = dateValue(j.tanggal);
  const t = today(now);
  if (!date || date < t) return 'past';
  if (date === t) return 'today';
  const endOfWeek = formatDate(addDays(startOfWeek(now), 6));
  return date <= endOfWeek ? 'week' : 'later';
}

/**
 * Non-empty groups in display order. Upcoming groups are sorted soonest first,
 * "Sudah lewat" most recent first.
 */
export function groupJadwal(list, now = new Date()) {
  const buckets = Object.fromEntries(GROUPS.map((g) => [g.key, []]));
  for (const j of list) buckets[groupKey(j, now)].push(j);
  return GROUPS.filter((g) => buckets[g.key].length).map((g) => ({
    ...g,
    items: buckets[g.key].sort((a, b) =>
      g.key === 'past' ? sortKey(b).localeCompare(sortKey(a)) : sortKey(a).localeCompare(sortKey(b)),
    ),
  }));
}

/** Schedules of one application, soonest first. */
export function jadwalFor(list, lamaranId) {
  return list.filter((j) => j.lamaran_id === lamaranId).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

/**
 * Schedules of one application for the Detail screen: upcoming ones first (soonest
 * first), then the ones that already passed (most recent first).
 */
export function jadwalForDetail(list, lamaranId, now = new Date()) {
  const t = today(now);
  const mine = list.filter((j) => j.lamaran_id === lamaranId);
  const upcoming = mine.filter((j) => dateValue(j.tanggal) >= t).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const past = mine.filter((j) => !(dateValue(j.tanggal) >= t)).sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
  return [...upcoming, ...past];
}

const DAYS_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/**
 * Friendly day: "Hari ini", "Besok", "Kemarin", "Kam, 20 Nov", or with the year
 * when it is not this year ("Sen, 4 Jan 2027").
 */
export function relativeDayLabel(value, now = new Date()) {
  const date = parseDate(dateValue(value));
  if (!date) return 'Tanggal belum diisi';
  const diff = Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  if (diff === 0) return 'Hari ini';
  if (diff === 1) return 'Besok';
  if (diff === -1) return 'Kemarin';
  const base = `${DAYS_SHORT[date.getDay()]}, ${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear() ? base : `${base} ${date.getFullYear()}`;
}

/** Google Maps search link for an address. */
export function mapsUrl(place) {
  const q = String(place ?? '').trim();
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}

/** true when the schedule's day is before today. */
export function isPast(j, now = new Date()) {
  const d = dateValue(j.tanggal);
  return !d || d < today(now);
}

/** Not-done schedules from today up to `days` days ahead, soonest first. */
export function upcomingJadwal(list, now = new Date(), days = 7) {
  const from = today(now);
  const to = formatDate(addDays(parseDate(from), days));
  return list
    .filter((j) => !isDone(j))
    .filter((j) => {
      const d = dateValue(j.tanggal);
      return d && d >= from && d <= to;
    })
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

export function isDone(j) {
  return isTrue(j.selesai);
}

function stamp(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}T${p(date.getHours())}${p(date.getMinutes())}00`;
}

/**
 * Google Calendar "create event" link. Times are local (no timezone suffix), so
 * Calendar uses the user's own timezone. Default duration is 1 hour; a schedule
 * without a start time becomes an all-day event.
 */
export function calendarUrl(j, lamaran = {}) {
  const day = parseDate(dateValue(j.tanggal));
  if (!day) return null;

  let dates;
  const start = timeValue(j.jam_mulai);
  if (start) {
    const [sh, sm] = start.split(':').map(Number);
    const begin = new Date(day.getFullYear(), day.getMonth(), day.getDate(), sh, sm);
    const endTime = timeValue(j.jam_selesai);
    let finish;
    if (endTime && endTime > start) {
      const [eh, em] = endTime.split(':').map(Number);
      finish = new Date(day.getFullYear(), day.getMonth(), day.getDate(), eh, em);
    } else {
      finish = new Date(begin.getTime() + 60 * 60 * 1000);
    }
    dates = `${stamp(begin)}/${stamp(finish)}`;
  } else {
    dates = `${stamp(day).slice(0, 8)}/${stamp(addDays(day, 1)).slice(0, 8)}`;
  }

  const perusahaan = String(lamaran.perusahaan ?? '').trim();
  const text = perusahaan ? `${j.jenis} – ${perusahaan}` : String(j.jenis ?? 'Jadwal');
  const details = [lamaran.posisi, j.catatan].map((s) => String(s ?? '').trim()).filter(Boolean).join('\n\n');
  const params = [
    ['action', 'TEMPLATE'],
    ['text', text],
    ['dates', dates],
    ['details', details],
    ['location', String(j.lokasi_atau_link ?? '').trim()],
  ];
  const query = params
    .filter(([, v]) => v !== '')
    .map(([k, v]) => `${k}=${k === 'dates' ? v : encodeURIComponent(v)}`)
    .join('&');
  return `https://calendar.google.com/calendar/render?${query}`;
}
