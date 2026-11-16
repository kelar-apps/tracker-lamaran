// Pure logic for the per-application history (sheet Riwayat).
// jenis: 'status' (status changed), 'catatan' (note), 'follow_up' (user followed up).

import { newId } from './lamaran.js';

export const NOTE_MAX = 2000;

export function createRiwayat({ lamaranId, jenis, statusBaru = '', catatan = '' }, { now = new Date(), id = newId() } = {}) {
  return {
    id,
    lamaran_id: lamaranId,
    tanggal: now.toISOString(),
    jenis,
    status_baru: statusBaru,
    catatan,
  };
}

/** Validate a free-text note. */
export function validateNote(text) {
  const value = String(text ?? '').trim();
  if (!value) return { error: 'Catatan belum diisi', value };
  if (value.length > NOTE_MAX) return { error: `Maksimal ${NOTE_MAX} karakter, ya`, value };
  return { error: '', value };
}

/** History rows of one application, newest first. */
export function timelineFor(riwayat, lamaranId) {
  return riwayat
    .filter((r) => r.lamaran_id === lamaranId)
    .sort((a, b) => String(b.tanggal ?? '').localeCompare(String(a.tanggal ?? '')) || String(b.id).localeCompare(String(a.id)));
}

/** Short title of a history row, e.g. "Status diubah ke Interview". */
export function riwayatTitle(r) {
  switch (r.jenis) {
    case 'status':
      return r.status_baru ? `Status diubah ke ${r.status_baru}` : 'Status diubah';
    case 'follow_up':
      return 'Sudah follow-up';
    default:
      return 'Catatan';
  }
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/** ISO datetime -> "13 Nov 2026, 14.05" in local time. "" when invalid. */
export function formatDateTime(iso) {
  const d = new Date(String(iso ?? ''));
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}, ${hh}.${mm}`;
}
