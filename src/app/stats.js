// Statistics (prompt 7.6). Pure functions, unit tested.
//
// - Response rate = responded / counted.
//   responded = ever had a status other than Dikirim and Mundur (Ditolak counts).
//   counted   = not archived, except Mundur that was never responded to.
// - Average reply time = days from tanggal_melamar to the first status change in
//   Riwayat that is not to Mundur. Applications without one are left out.
// - Funnel (cumulative): reaching a stage counts for every earlier stage too. For
//   Ditolak/Mundur the highest stage ever reached according to Riwayat is used.
// - Best sources: per source, total and response rate, highest rate first, at least
//   3 applications per source.
// - Applications per week (Monday–Sunday, by tanggal_melamar, archived included).

import { addDays, daysBetween, formatDate, isoToLocalDate, parseDate, startOfWeek } from '../core/dates.js';
import { STATUS_FLOW } from './schema.js';
import { dateValue, isTrue } from './lamaran.js';

export const MIN_FOR_STATS = 10;
export const MIN_PER_SOURCE = 3;

/** lamaran_id -> its 'status' history rows, oldest first. */
export function statusHistory(riwayat) {
  const map = new Map();
  for (const r of riwayat) {
    if (r.jenis !== 'status') continue;
    if (!map.has(r.lamaran_id)) map.set(r.lamaran_id, []);
    map.get(r.lamaran_id).push(r);
  }
  for (const rows of map.values()) rows.sort((a, b) => String(a.tanggal).localeCompare(String(b.tanggal)));
  return map;
}

/** Every status this application has ever had (current + history). */
function statusesOf(l, history) {
  const set = new Set([l.status || 'Dikirim']);
  for (const r of history.get(l.id) || []) if (r.status_baru) set.add(r.status_baru);
  return set;
}

export function isResponded(l, history) {
  for (const s of statusesOf(l, history)) if (s !== 'Dikirim' && s !== 'Mundur') return true;
  return false;
}

/** Applications that count for response-based statistics. */
export function countedLamaran(lamaran, history) {
  return lamaran.filter((l) => {
    if (isTrue(l.diarsipkan)) return false;
    if ((l.status || 'Dikirim') === 'Mundur' && !isResponded(l, history)) return false;
    return true;
  });
}

export function responseRate(lamaran, history) {
  const counted = countedLamaran(lamaran, history);
  const responded = counted.filter((l) => isResponded(l, history)).length;
  return { responded, counted: counted.length, rate: counted.length ? responded / counted.length : 0 };
}

export function replyTime(lamaran, history) {
  const days = [];
  for (const l of lamaran) {
    if (isTrue(l.diarsipkan)) continue;
    const sent = parseDate(dateValue(l.tanggal_melamar));
    const first = (history.get(l.id) || []).find((r) => r.status_baru !== 'Mundur');
    const answered = first && parseDate(isoToLocalDate(first.tanggal));
    if (!sent || !answered) continue;
    days.push(Math.max(0, daysBetween(sent, answered)));
  }
  return { average: days.length ? days.reduce((a, b) => a + b, 0) / days.length : null, n: days.length };
}

/** Index in STATUS_FLOW of the highest stage reached (0 = Dikirim). */
export function highestStage(l, history) {
  let best = 0;
  for (const s of statusesOf(l, history)) best = Math.max(best, STATUS_FLOW.indexOf(s));
  return best;
}

export function funnel(lamaran, history) {
  const counts = STATUS_FLOW.map(() => 0);
  for (const l of lamaran) {
    if (isTrue(l.diarsipkan)) continue;
    const top = highestStage(l, history);
    for (let i = 0; i <= top; i++) counts[i]++;
  }
  return STATUS_FLOW.map((status, i) => ({ status, count: counts[i] }));
}

export function sourceStats(lamaran, history, minimum = MIN_PER_SOURCE) {
  const bySource = new Map();
  for (const l of countedLamaran(lamaran, history)) {
    const s = String(l.sumber ?? '').trim();
    if (!s) continue;
    if (!bySource.has(s)) bySource.set(s, { sumber: s, total: 0, responded: 0 });
    const row = bySource.get(s);
    row.total++;
    if (isResponded(l, history)) row.responded++;
  }
  return [...bySource.values()]
    .filter((r) => r.total >= minimum)
    .map((r) => ({ ...r, rate: r.responded / r.total }))
    .sort((a, b) => b.rate - a.rate || b.total - a.total || a.sumber.localeCompare(b.sumber, 'id'));
}

/**
 * Applications per week for the last `weeks` weeks, oldest first; the last
 * entry is the current week. start = Monday "YYYY-MM-DD".
 */
export function weeklyCounts(lamaran, now = new Date(), weeks = 8) {
  const thisMonday = startOfWeek(now);
  const result = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const monday = addDays(thisMonday, -7 * i);
    result.push({ start: formatDate(monday), end: formatDate(addDays(monday, 6)), count: 0 });
  }
  for (const l of lamaran) {
    const d = dateValue(l.tanggal_melamar);
    if (!d) continue;
    const week = result.find((w) => d >= w.start && d <= w.end);
    if (week) week.count++;
  }
  return result;
}

/** Everything the Statistik screen needs. */
export function computeStats({ lamaran = [], riwayat = [] }, now = new Date()) {
  const history = statusHistory(riwayat);
  return {
    total: lamaran.length,
    response: responseRate(lamaran, history),
    reply: replyTime(lamaran, history),
    funnel: funnel(lamaran, history),
    sources: sourceStats(lamaran, history),
    weekly: weeklyCounts(lamaran, now),
  };
}
