// The trust's side of the table: live exposure, computed from case views. Pure.
import { EVIDENCE } from './evidence.js';
import { POLICY } from './policy.js';

const r2 = (x) => Math.round(x * 100) / 100;
export function trustReport(cases, hospital = null) {
  const mine = cases.filter((c) => !hospital || c.hospital === hospital);
  const eligible = mine.filter((c) => c.eval.state !== 'ineligible');
  const running = eligible.filter((c) => c.eval.state === 'ticking');
  const breached = eligible.filter((c) => c.eval.state === 'breached');
  const kept = eligible.filter((c) => c.eval.state === 'kept');
  const stopped = eligible.filter((c) => c.eval.state === 'declined');
  const resolved = breached.length + kept.length + stopped.length;
  const filedPayable = (c) => (c.claim?.status === 'submitted' ? c.claim.priced.payableTotal : 0);
  const potential = (c) => c.claim?.priced?.payableTotal || 0;
  const cost = (c) => (c.setting === 'inpatient' ? EVIDENCE.hospitalCost.inpatient : EVIDENCE.hospitalCost.daycase);
  const sum = (arr, f) => r2(arr.reduce((s, c) => s + f(c), 0));
  const dueSoon = running.filter((c) => c.eval.daysLeft <= 7).sort((a, b) => a.eval.daysLeft - b.eval.daysLeft);
  const justBreached = breached.filter((c) => c.eval.daysOver <= 7);
  const paid = breached.filter((c) => c.payout && ['SUCCESS', 'PENDING', 'UNCLAIMED'].includes(c.payout.status));
  const bands = [['0 to 7 days left', 0, 7], ['8 to 14 days left', 8, 14], ['15 to 21 days left', 15, 21], ['22 to 28 days left', 22, 28]].map(([label, lo, hi]) => ({ label, count: running.filter((c) => c.eval.daysLeft >= lo && c.eval.daysLeft <= hi).length }));
  return {
    hospital: hospital || 'All example hospitals',
    hospitals: [...new Set(cases.map((c) => c.hospital))].sort(),
    counts: { cancellations: mine.length, covered: eligible.length, running: running.length, breached: breached.length, kept: kept.length, stopped: stopped.length, outsidePledge: mine.length - eligible.length },
    breachRate: resolved ? { pct: Math.round((breached.length / resolved) * 1000) / 10, of: resolved, breached: breached.length } : null,
    nationalRate: EVIDENCE.breach.pct,
    bands,
    dueSoon: dueSoon.map((c) => ({ id: c.id, name: c.patient.name, procedure: c.procedure, hospital: c.hospital, daysLeft: c.eval.daysLeft, deadline: c.eval.deadline, ifBreached: potential(c) })),
    breachedThisWeek: justBreached.map((c) => ({ id: c.id, name: c.patient.name, daysOver: c.eval.daysOver })),
    absorbed: { episodes: eligible.length, low: sum(eligible, (c) => cost(c).low), high: sum(eligible, (c) => cost(c).high), basis: EVIDENCE.hospitalCost.pricing },
    repayments: { paidCount: paid.length, paid: sum(paid, (c) => c.payout.amount), exposureOnRunningClocks: sum(running, filedPayable), potentialOnRunningClocks: sum(running, potential), cap: POLICY.totalCap },
  };
}
