// Follow-up reminder rules and message templates. Pure functions, unit tested.
//
// Rules (prompt, Fase 4):
// - Dikirim / Diproses: due when >= hari_follow_up days have passed since the latest
//   of: tanggal_melamar, the last status change in Riwayat, and the last follow-up.
// - Tes / Interview with schedules: the latest schedule must be in the past, and
//   >= hari_follow_up days must have passed since the latest of that schedule, the
//   last status change and the last follow-up. Without schedules: as Dikirim.
// - Never for Offering, Diterima, Ditolak, Mundur or archived applications.

import { daysBetween, formatDateLong, isoToLocalDate, parseDate } from '../core/dates.js';
import { dateValue, isTrue } from './lamaran.js';

const WAITING = new Set(['Dikirim', 'Diproses']);
const AFTER_SCHEDULE = new Set(['Tes', 'Interview']);

/** Latest "YYYY-MM-DD" of a list, ignoring empty values. */
function latest(dates) {
  return dates.filter(Boolean).sort().at(-1) || '';
}

/**
 * Reminder for one application, or null when no follow-up is due.
 * @returns {null | { lamaran, days, anchor, anchorKind, jadwal }}
 *   anchor = the date the waiting period counts from;
 *   anchorKind = 'melamar' | 'status' | 'follow_up' | 'jadwal';
 *   jadwal = the schedule the reminder is about (Tes/Interview), else null.
 */
export function followUpFor(lamaran, { riwayat = [], jadwal = [], hariFollowUp = 7, now = new Date() } = {}) {
  const status = lamaran.status || 'Dikirim';
  if (isTrue(lamaran.diarsipkan)) return null;
  if (!WAITING.has(status) && !AFTER_SCHEDULE.has(status)) return null;

  const own = riwayat.filter((r) => r.lamaran_id === lamaran.id);
  const candidates = [
    { kind: 'melamar', date: dateValue(lamaran.tanggal_melamar) },
    { kind: 'status', date: latest(own.filter((r) => r.jenis === 'status').map((r) => isoToLocalDate(r.tanggal))) },
    {
      kind: 'follow_up',
      date: latest([
        dateValue(lamaran.terakhir_follow_up),
        ...own.filter((r) => r.jenis === 'follow_up').map((r) => isoToLocalDate(r.tanggal)),
      ]),
    },
  ];

  let lastJadwal = null;
  if (AFTER_SCHEDULE.has(status)) {
    const mine = jadwal
      .filter((j) => j.lamaran_id === lamaran.id && dateValue(j.tanggal))
      .sort((a, b) => dateValue(a.tanggal).localeCompare(dateValue(b.tanggal)));
    lastJadwal = mine.at(-1) || null;
    if (lastJadwal) {
      const day = parseDate(dateValue(lastJadwal.tanggal));
      if (daysBetween(day, now) < 0) return null; // still waiting for that test/interview
      candidates.push({ kind: 'jadwal', date: dateValue(lastJadwal.tanggal) });
    }
  }

  const valid = candidates.filter((c) => c.date);
  if (!valid.length) return null;
  // Latest date wins; on a tie the most specific event (later in the list) wins.
  const anchor = valid.reduce((best, c) => (c.date >= best.date ? c : best));
  const days = daysBetween(parseDate(anchor.date), now);
  if (days < hariFollowUp) return null;

  return { lamaran, days, anchor: anchor.date, anchorKind: anchor.kind, jadwal: lastJadwal };
}

/** All due reminders, most overdue first. */
export function followUps({ lamaran = [], riwayat = [], jadwal = [], hariFollowUp = 7, now = new Date() }) {
  return lamaran
    .map((l) => followUpFor(l, { riwayat, jadwal, hariFollowUp, now }))
    .filter(Boolean)
    .sort((a, b) => b.days - a.days || String(a.lamaran.perusahaan).localeCompare(String(b.lamaran.perusahaan)));
}

/** "9 hari sejak lamaran dikirim" etc. */
export function reminderReason(reminder) {
  const since = {
    melamar: 'lamaran dikirim',
    status: 'status terakhir berubah',
    follow_up: 'follow-up terakhir',
    jadwal: reminder.jadwal?.jenis || 'jadwal terakhir',
  }[reminder.anchorKind];
  return `${reminder.days} hari sejak ${since}`;
}

/**
 * Name to greet from the free-text kontak_hr ("Bu Rina — rina@x.com" -> "Rina").
 * Falls back to "Tim Rekrutmen" when there is no usable name.
 */
export function greetingName(kontakHr) {
  const first = String(kontakHr ?? '').split(/\s[-–—|]\s|[,;/(\n]|\s[-–—]|[-–—]\s/)[0].trim();
  if (!first || first.includes('@') || /\d{4,}/.test(first) || /^(https?:|www\.)/i.test(first)) return 'Tim Rekrutmen';
  const name = first.replace(/^(bapak|ibu|pak|bu|mas|mbak|kak|bpk\.?|ms\.?|mr\.?|mrs\.?)\s+/i, '').trim();
  return name || 'Tim Rekrutmen';
}

/**
 * Follow-up message, using the template that fits the situation.
 * @param {{ lamaran: object, jadwal?: object|null }} reminder
 * @param {string} nama  the user's name
 */
export function followUpMessage({ lamaran, jadwal = null }, nama) {
  const kepada = greetingName(lamaran.kontak_hr);
  const saya = String(nama ?? '').trim() || '[nama kamu]';
  const posisi = String(lamaran.posisi ?? '').trim() || '[posisi]';
  const useSchedule = jadwal && AFTER_SCHEDULE.has(lamaran.status);
  if (useSchedule) {
    return (
      `Selamat siang Bapak/Ibu ${kepada}, saya ${saya}, kandidat posisi ${posisi} yang mengikuti ` +
      `${jadwal.jenis || 'tahap seleksi'} pada ${formatDateLong(dateValue(jadwal.tanggal))}. ` +
      'Saya ingin menanyakan perkembangan proses seleksi selanjutnya. Terima kasih.'
    );
  }
  const tanggal = formatDateLong(dateValue(lamaran.tanggal_melamar)) || '[tanggal]';
  return (
    `Selamat siang Bapak/Ibu ${kepada}, saya ${saya}, pelamar posisi ${posisi} yang mengirim lamaran pada ${tanggal}. ` +
    'Saya ingin menanyakan perkembangan proses seleksinya. Terima kasih atas waktunya.'
  );
}
