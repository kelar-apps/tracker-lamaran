// Pure logic for job applications (Lamaran): validation, normalisation, search,
// filters and labels. No DOM, no network: everything here is unit tested.

import { daysBetween, formatDate, parseDate, today } from '../core/dates.js';
import { SOURCES, STATUSES, WORK_TYPES } from './schema.js';

export const LIMITS = {
  perusahaan: 120,
  posisi: 120,
  lokasi: 120,
  kontak_hr: 200,
  link_lowongan: 2000,
  catatan: 2000,
};

export const SORTS = [
  { value: 'terbaru', label: 'Terbaru' },
  { value: 'terlama', label: 'Terlama' },
  { value: 'perusahaan', label: 'Perusahaan A–Z' },
];

/** Sheets booleans arrive as true/false, but a hand-typed cell may be "TRUE"/"ya". */
export function isTrue(value) {
  if (value === true) return true;
  return /^(true|ya|yes|1)$/i.test(String(value ?? '').trim());
}

/** Google Sheets date serial (days since 1899-12-30) or "YYYY-MM-DD" -> "YYYY-MM-DD" or "". */
export function dateValue(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    const d = new Date(1899, 11, 30 + Math.floor(value));
    return formatDate(d);
  }
  const s = String(value ?? '').trim().slice(0, 10);
  return parseDate(s) ? s : '';
}

/** Return the URL only when it is a valid http(s) link, otherwise null. */
export function safeHttpUrl(value) {
  const s = String(value ?? '').trim();
  if (!s) return null;
  try {
    const url = new URL(s);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/** "Rp 8.000.000", "8.000.000", "8000000" -> 8000000. "" -> null. Invalid -> NaN. */
export function parseRupiah(value) {
  const s = String(value ?? '').trim();
  if (!s) return null;
  const digits = s.replace(/^rp\.?\s*/i, '').replace(/[.\s]/g, '').replace(/,00$/, '');
  if (!/^\d+$/.test(digits)) return NaN;
  return Number(digits);
}

/** 8000000 -> "Rp 8.000.000". Empty / invalid -> "". */
export function formatRupiah(value) {
  if (value === '' || value == null) return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return `Rp ${Math.round(n).toLocaleString('id-ID')}`;
}

/**
 * Validate form input. Returns { errors, value } where `value` holds the cleaned
 * fields (strings trimmed, gaji as number or '').
 * @param {Record<string, string>} input
 */
export function validateLamaran(input, { now = new Date() } = {}) {
  const str = (key) => String(input[key] ?? '').trim();
  const errors = {};

  const value = {
    perusahaan: str('perusahaan'),
    posisi: str('posisi'),
    sumber: SOURCES.includes(str('sumber')) ? str('sumber') : '',
    link_lowongan: str('link_lowongan'),
    lokasi: str('lokasi'),
    tipe_kerja: WORK_TYPES.includes(str('tipe_kerja')) ? str('tipe_kerja') : '',
    gaji_diminta: '',
    tanggal_melamar: str('tanggal_melamar') || today(now),
    status: STATUSES.includes(str('status')) ? str('status') : 'Dikirim',
    kontak_hr: str('kontak_hr'),
    catatan: str('catatan'),
  };

  if (!value.perusahaan) errors.perusahaan = 'Nama perusahaan belum diisi';
  if (!value.posisi) errors.posisi = 'Posisi belum diisi';

  for (const [key, max] of Object.entries(LIMITS)) {
    if (value[key].length > max && !errors[key]) errors[key] = `Maksimal ${max} karakter, ya`;
  }

  if (value.link_lowongan && !safeHttpUrl(value.link_lowongan)) {
    errors.link_lowongan = 'Link harus diawali http:// atau https://';
  }

  const gaji = parseRupiah(input.gaji_diminta);
  if (Number.isNaN(gaji)) errors.gaji_diminta = 'Isi angka saja, contoh 8000000';
  else value.gaji_diminta = gaji ?? '';

  if (!parseDate(value.tanggal_melamar)) errors.tanggal_melamar = 'Tanggal belum valid';
  else if (value.tanggal_melamar > today(now)) errors.tanggal_melamar = 'Tanggal melamar tidak boleh di masa depan';

  return { errors, value };
}

/** UUID v4, with a fallback for browsers without crypto.randomUUID. */
export function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const b = globalThis.crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** A complete new row from validated form values. */
export function createLamaran(value, { now = new Date(), id = newId() } = {}) {
  const iso = now.toISOString();
  return {
    id,
    ...value,
    terakhir_follow_up: '',
    diarsipkan: false,
    dibuat: iso,
    diperbarui: iso,
  };
}

/**
 * Apply edited form values to an existing row. Keeps unknown columns (the user may
 * add their own columns in the Sheet) and fields the form does not edit.
 */
export function updateLamaran(existing, changes, { now = new Date() } = {}) {
  return { ...existing, ...changes, id: existing.id, diperbarui: now.toISOString() };
}

/**
 * Search, filter and sort the list.
 * @param {object[]} list
 * @param {{ q?: string, statuses?: string[], sumber?: string, sort?: string, showArchived?: boolean }} f
 */
export function filterLamaran(list, { q = '', statuses = [], sumber = '', sort = 'terbaru', showArchived = false } = {}) {
  const needle = q.trim().toLocaleLowerCase('id');
  const wanted = new Set(statuses);
  const result = list.filter((l) => {
    if (!showArchived && isTrue(l.diarsipkan)) return false;
    if (wanted.size && !wanted.has(l.status)) return false;
    if (sumber && l.sumber !== sumber) return false;
    if (needle) {
      const hay = `${l.perusahaan ?? ''}\n${l.posisi ?? ''}`.toLocaleLowerCase('id');
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
  return sortLamaran(result, sort);
}

export function sortLamaran(list, sort = 'terbaru') {
  const byDate = (a, b) =>
    dateValue(a.tanggal_melamar).localeCompare(dateValue(b.tanggal_melamar)) ||
    String(a.dibuat ?? '').localeCompare(String(b.dibuat ?? ''));
  const copy = [...list];
  if (sort === 'perusahaan') {
    return copy.sort(
      (a, b) =>
        String(a.perusahaan ?? '').localeCompare(String(b.perusahaan ?? ''), 'id', { sensitivity: 'base' }) ||
        String(a.posisi ?? '').localeCompare(String(b.posisi ?? ''), 'id', { sensitivity: 'base' }),
    );
  }
  if (sort === 'terlama') return copy.sort(byDate);
  return copy.sort((a, b) => byDate(b, a));
}

/** "Dikirim hari ini" / "Dikirim kemarin" / "Dikirim 12 hari lalu". */
export function sentLabel(tanggalMelamar, now = new Date()) {
  const date = parseDate(dateValue(tanggalMelamar));
  if (!date) return '';
  const days = daysBetween(date, now);
  if (days < 0) return 'Dikirim nanti';
  if (days === 0) return 'Dikirim hari ini';
  if (days === 1) return 'Dikirim kemarin';
  return `Dikirim ${days} hari lalu`;
}

/** Normalise the `status` filter from a URL query, e.g. "?status=Tes,Interview". */
export function parseStatusParam(value) {
  return String(value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => STATUSES.includes(s));
}
