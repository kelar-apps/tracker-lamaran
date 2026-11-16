/**
 * May a reminder (install prompt, tip) be shown again?
 * @param {number|string|null} lastShown  ms timestamp of the last time, or empty
 * @param {number} everyMs  minimum time between two reminders (default 3 days)
 */
export function shouldRemind(lastShown, now = Date.now(), everyMs = 3 * 24 * 60 * 60 * 1000) {
  const last = Number(lastShown);
  // A time in the future means the device clock changed: show it again.
  return !Number.isFinite(last) || last <= 0 || now - last >= everyMs || now < last;
}
