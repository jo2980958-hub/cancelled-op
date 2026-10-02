export const fmtDate = (s) => (s ? new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '');
export const fmtShort = (s) => (s ? new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');
export const gbp = (n) => '£' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const gbp0 = (n) => '£' + Number(n).toLocaleString('en-GB', { maximumFractionDigits: 0 });
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const MINE = 'cop.mine';
export const mine = {
  get() { try { return JSON.parse(localStorage.getItem(MINE) || '[]'); } catch { return []; } },
  add(id) { try { const a = mine.get(); if (!a.includes(id)) localStorage.setItem(MINE, JSON.stringify([id, ...a].slice(0, 30))); } catch { /* storage blocked: the link still works */ } },
  remove(id) { try { localStorage.setItem(MINE, JSON.stringify(mine.get().filter((x) => x !== id))); } catch { /* ignore */ } },
};

/** One place that turns a case's determination into words, tone and a status label (never colour alone). */
export function look(c) {
  const e = c.eval;
  if (e.state === 'ineligible') return { tone: 'off', label: 'Outside the promise', big: '–', unit: '', head: 'This cancellation is outside the 28-day promise', text: e.reasons[0] };
  if (e.state === 'kept') return { tone: 'kept', label: 'Promise kept', big: '✓', unit: '', head: `A binding date is secured for ${fmtDate(e.keptDate)}`, text: `It falls inside the window that closes on ${fmtDate(e.deadline)}. The clock has stopped and nothing is owed.` };
  if (e.state === 'declined') return { tone: 'kept', label: 'Clock stopped', big: '■', unit: '', head: 'The patient declined or postponed a date inside the window', text: 'That was the patient\'s choice, so the promise is not broken and nothing is owed.' };
  if (e.state === 'breached') {
    const paid = c.payout;
    return { tone: 'broken', label: 'Promise broken', big: '+' + e.daysOver, unit: e.daysOver === 1 ? 'day past the deadline' : 'days past the deadline', head: `No binding date was given by ${fmtDate(e.deadline)}`,
      text: paid ? 'The promise has no legal force and no automatic penalty. The agent repaid the patient\'s costs through PayPal.' : c.claim?.status === 'submitted' ? 'The claim is filed. The payout is being sent.' : 'The agent repays the patient\'s costs once a claim is filed. Describe the costs under Claim your costs.' };
  }
  const warn = e.daysLeft <= 7;
  return { tone: warn ? 'warn' : 'run', label: `Day ${e.day} of 28`, big: String(e.daysLeft), unit: e.daysLeft === 1 ? 'day left' : 'days left', head: e.daysLeft === 0 ? 'Today is the last day of the window' : `A binding date is owed by ${fmtDate(e.deadline)}`,
    text: c.offers.some((o) => (o.cycle || 1) === e.cycle) ? 'An offer is on file, but it does not secure the promise yet.' : 'No binding new date has been given. The agent is chasing the hospital.' };
}
export const toneWord = { run: 'Clock running', warn: 'Running out', broken: 'Broken', kept: 'Kept', off: 'Not covered' };

/** What the patient is owed, in one line: the second number on the page. */
export function owed(c) {
  const e = c.eval, p = c.claim?.priced;
  if (e.state === 'ineligible') return null;
  if (c.payout) return { amount: c.payout.amount, label: c.payout.status === 'SUCCESS' ? 'paid to the patient' : 'being paid to the patient', tone: 'paid' };
  if (e.state === 'kept' || e.state === 'declined') return { amount: 0, label: 'owed: nothing, the promise holds', tone: 'none' };
  if (c.claim?.status === 'submitted') return { amount: p.payableTotal, label: e.state === 'breached' ? 'being sent now' : 'repaid if the date is missed', tone: 'due' };
  if (c.claim) return { amount: p.payableTotal, label: 'priced, not filed yet', tone: 'draft', action: 'claim' };
  return { amount: null, label: e.state === 'breached' ? 'Add your costs to be repaid' : 'Add your costs so they are repaid if the date is missed', tone: 'none', action: 'claim' };
}

const REASON = { hospital_nonclinical: 'for a non-clinical reason', clinical: 'for a clinical reason', patient: 'by the patient' };
const WHEN = { day_of_surgery: 'on the day of surgery', on_admission: 'after admission', before_day: 'before the day of admission' };
/** The rules engine's decision, as a sentence a patient would say. */
export function plainReason(c) {
  const e = c.eval;
  const base = `The operation (${c.procedure.toLowerCase()}) was cancelled ${c.cancelledBy === 'patient' ? 'by the patient' : 'by the hospital'} on ${fmtDate(c.cancelledOn)}, ${WHEN[c.timing]}, ${c.cancelledBy === 'patient' ? '' : REASON[c.cancelledBy]}`.replace(/, $/, '');
  if (e.state === 'ineligible') return `${base}. ${e.reasons[0]}`;
  const restart = e.cycle > 1 ? ` The rebooked operation was then cancelled again by the hospital, so a new 28-day clock started on ${fmtDate(e.cycleStart)}.` : '';
  const cover = `${base}, so the 28-day promise applies.${restart}`;
  if (e.state === 'kept') return `${cover} A binding date of ${fmtDate(e.keptDate)} was given inside the window that closes on ${fmtDate(e.deadline)}, so the promise is kept and nothing is owed.`;
  if (e.state === 'declined') return `${cover} The patient declined or postponed a date inside the window. That is their choice, so the promise is not broken.`;
  if (e.state === 'breached') return `${cover} No binding date was given by ${fmtDate(e.deadline)}, so the promise was broken on day ${e.day}. The patient is owed their out-of-pocket costs.`;
  return `${cover} A binding date must be given by ${fmtDate(e.deadline)}, which is day 28 and still counts. ${e.daysLeft === 0 ? 'That is today.' : `${plural(e.daysLeft, 'day remains', 'days remain')}.`}`;
}
