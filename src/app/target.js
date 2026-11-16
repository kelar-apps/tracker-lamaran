// Weekly target. Weeks run Monday–Sunday in the device's local time.
// Applications count towards the week of their `tanggal_melamar` (archived ones too).

import { addDays, formatDate, startOfWeek } from '../core/dates.js';
import { dateValue } from './lamaran.js';

export const TARGET_MIN = 1;
export const TARGET_MAX = 50;

/** Week start (Monday "YYYY-MM-DD") -> number of applications. */
function countsByWeek(lamaran) {
  const map = new Map();
  for (const l of lamaran) {
    const d = dateValue(l.tanggal_melamar);
    if (!d) continue;
    const [y, m, day] = d.split('-').map(Number);
    const key = formatDate(startOfWeek(new Date(y, m - 1, day)));
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

/**
 * Consecutive weeks with the target reached, counted back from last week.
 * The current week adds 1 when its target is already reached, and never breaks
 * the streak while it is still in progress. The current target is used for
 * every week (no target history is kept).
 */
export function streak(lamaran, target, now = new Date()) {
  const goal = Math.max(1, Number(target) || 1);
  const counts = countsByWeek(lamaran);
  const thisMonday = startOfWeek(now);
  let weeks = (counts.get(formatDate(thisMonday)) || 0) >= goal ? 1 : 0;
  for (let i = 1; ; i++) {
    const key = formatDate(addDays(thisMonday, -7 * i));
    if ((counts.get(key) || 0) < goal) break;
    weeks++;
  }
  return weeks;
}

/** Number of applications sent in the week containing `now`. */
export function countThisWeek(lamaran, now = new Date()) {
  const start = formatDate(startOfWeek(now));
  const end = formatDate(addDays(startOfWeek(now), 6));
  return lamaran.filter((l) => {
    const d = dateValue(l.tanggal_melamar);
    return d && d >= start && d <= end;
  }).length;
}

/** Progress 0..1 (capped) and an encouraging line that fits it. */
export function weeklyProgress(count, target) {
  const goal = Math.max(1, Number(target) || 1);
  const ratio = Math.min(1, count / goal);
  let message;
  if (count >= goal) message = 'Target minggu ini tercapai. Keren!';
  else if (count === 0) message = 'Yuk mulai minggu ini dengan satu lamaran!';
  else if (ratio < 0.5) message = 'Awal yang bagus, lanjutkan!';
  else message = `Sedikit lagi, tinggal ${goal - count} lamaran!`;
  return { ratio, message, goal };
}
