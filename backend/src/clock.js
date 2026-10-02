// The 28-day clock. Pure functions, no I/O, shared by the Lambda and the browser.
//
// RULES (the product's reading of the pledge; see README "How the clock counts"):
//  * Day 0 is the Europe/London calendar date of the cancellation.
//  * The deadline is day 28: cancelledOn + 28 CALENDAR days. It is INCLUSIVE:
//    a binding operation date that falls ON day 28 keeps the promise.
//  * The promise is broken from 00:00 London time on day 29 (the first date after the deadline).
//  * Everything is compared as YYYY-MM-DD strings in Europe/London. We never add 28*24h of
//    milliseconds, because clocks change in March and October and a 24h-multiple drifts a day.
//  * An offer keeps the promise only if it is binding, its date is within [day 1, day 28]
//    and it was MADE on or before day 28.

export const WINDOW_DAYS = 28;
export const TZ = 'Europe/London';

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Europe/London calendar date (YYYY-MM-DD) of an instant. */
export function londonDate(ts) {
  const d = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(d.getTime())) throw new Error('invalid timestamp: ' + ts);
  return fmt.format(d);
}

const RE = /^\d{4}-\d{2}-\d{2}$/;
function parts(s) {
  if (!RE.test(s)) throw new Error('invalid date (want YYYY-MM-DD): ' + s);
  const [y, m, d] = s.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) throw new Error('not a real calendar date: ' + s);
  return t;
}

/** Calendar-day arithmetic on YYYY-MM-DD strings (UTC midnight maths, so DST-proof). */
export function addDays(s, n) {
  return new Date(parts(s) + n * 86400000).toISOString().slice(0, 10);
}
export function diffDays(a, b) { // b - a in whole calendar days
  return Math.round((parts(b) - parts(a)) / 86400000);
}

export function deadlineOf(cancelledOn) { return addDays(cancelledOn, WINDOW_DAYS); }

/** The chase ladder: day numbers at which the agent chases the trust while no date is offered. */
export const CHASE_DAYS = [3, 7, 14, 21, 26, 28];
