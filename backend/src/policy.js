// Claim policy engine. The model READS the patient's account; this code DECIDES the money.
// Nothing the model says can raise a payment above these limits. All limits are OUR illustrative
// policy parameters (configurable per trust) - they are not NHS figures.

export const CURRENCY_DISPLAY = 'GBP';
export const POLICY = {
  mileagePerMile: 0.45,      // matches the HMRC approved mileage rate; our choice, stated openly
  maxWageHours: 16,          // at most two working days of lost pay per cancellation
  categoryCaps: { travel: 150, wages: 400, childcare: 200, parking: 40, accommodation: 150, other: 0 },
  totalCap: 750,             // hard ceiling on one automatic payout
  evidenceOverGBP: 25,       // any non-mileage line needs a named document
  highHourlyRate: 45,        // above this a line goes to a human
  longTripMiles: 120,        // above this the patient is asked to confirm; above 250 a human reviews
  evidenceAccepted: ['receipt', 'payslip', 'booking_confirmation', 'ticket', 'bank_statement', 'employer_letter', 'business_records'],
};
export const CATEGORIES = Object.keys(POLICY.categoryCaps);

const num = (x) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : null);
const r2 = (x) => Math.round(x * 100) / 100;

/** What may be claimed, in the agent's own words (also served to the model as the check_claimable tool). */
export function claimability(category, description = '') {
  const d = String(description).toLowerCase();
  const companion = /\b(sister|brother|mum|mother|dad|father|husband|wife|partner|friend|neighbour|neighbor|son|daughter|carer|companion)\b/.test(d) && /(wage|pay|salary|day off|time off|took the day|lost)/.test(d);
  if (!CATEGORIES.includes(category)) return { claimable: false, category, rule: 'Unknown category. Use travel, wages, childcare, parking, accommodation or other.' };
  if (/(distress|pain|suffering|anxiety|upset|compensation|fasting|hunger)/.test(d)) return { claimable: false, category, rule: 'Distress, pain and fasting are real but are not out-of-pocket costs, so this service does not price them.' };
  if (companion) return { claimable: 'conditional', category, cap: POLICY.categoryCaps.wages, rule: "A companion's lost pay is claimable only when the hospital required an adult escort (for example after a general anaesthetic). Ask whether that was required, and who lost the pay.", evidence: 'employer_letter or payslip' };
  const cap = POLICY.categoryCaps[category];
  if (category === 'other') return { claimable: false, category, cap: 0, rule: 'Not paid automatically. Ask which of travel, wages, childcare, parking or accommodation it belongs to; if none, it goes to a human.' };
  return {
    claimable: true, category, cap,
    rule: { travel: `Car travel is paid at ${(POLICY.mileagePerMile * 100).toFixed(0)}p a mile with no receipt. Fares and taxis need a ticket or receipt. Cap GBP ${cap}.`,
      wages: `Lost pay is hours x hourly rate, at most ${POLICY.maxWageHours} hours, evidenced by a payslip, employer letter or business records. Cap GBP ${cap}.`,
      childcare: `Childcare paid because of the cancelled day, with a receipt or bank statement. Cap GBP ${cap}.`,
      parking: `Hospital parking with a ticket or receipt. Cap GBP ${cap}.`,
      accommodation: `A room booked for the cancelled stay, with a booking confirmation. Cap GBP ${cap}.` }[category],
    evidence: category === 'travel' ? 'none for mileage; ticket or receipt for fares' : 'a named document',
  };
}

/** Flags that make a line stop and think. severity 'review' = a human decides; 'confirm' = patient must confirm after being challenged. */
export function sanity(raw) {
  const flags = [];
  const miles = num(raw?.miles), hours = num(raw?.hours), rate = num(raw?.hourly_rate_gbp), amt = num(raw?.amount_gbp);
  if (raw?.for_whom === 'companion' && raw?.escort_required !== true) flags.push({ code: 'companion_pay', severity: 'review', text: "A companion's lost pay needs confirmation that the hospital required an adult escort." });
  if (rate !== null && rate > POLICY.highHourlyRate) flags.push({ code: 'high_rate', severity: 'review', text: `An hourly rate of GBP ${rate.toFixed(2)} is above GBP ${POLICY.highHourlyRate}; a human checks it against the payslip.` });
  if (miles !== null && miles > 250) flags.push({ code: 'very_long_trip', severity: 'review', text: `${miles} miles is over 250; a human checks the route.` });
  else if (miles !== null && miles > POLICY.longTripMiles) flags.push({ code: 'long_trip', severity: 'confirm', text: `${miles} miles is a long trip; the patient is asked to confirm the distance.` });
  if (amt !== null && amt >= 100 && raw?.category === 'travel') flags.push({ code: 'large_fare', severity: 'confirm', text: `A single travel cost of GBP ${amt.toFixed(2)} is asked to be confirmed.` });
  return flags;
}

/** One extracted line -> priced line with status and plain-English basis. */
export function priceLine(raw) {
  const category = CATEGORIES.includes(raw?.category) ? raw.category : 'other';
  const evidence = typeof raw?.evidence === 'string' ? raw.evidence : 'none';
  const hasEvidence = POLICY.evidenceAccepted.includes(evidence);
  const flags = sanity({ ...raw, category });
  const line = { category, description: String(raw?.description || '').slice(0, 200), evidence, claimed: null, amount: 0, status: 'held', basis: '', flags, justification: String(raw?.justification || '').slice(0, 300) };

  let claimed = null, basis = '';
  const miles = num(raw?.miles), hours = num(raw?.hours), rate = num(raw?.hourly_rate_gbp), amt = num(raw?.amount_gbp);
  if (category === 'travel' && miles !== null && amt === null) {
    claimed = r2(miles * POLICY.mileagePerMile); basis = `${miles} miles at ${(POLICY.mileagePerMile * 100).toFixed(0)}p per mile`;
  } else if (category === 'wages' && hours !== null && rate !== null) {
    const h = Math.min(hours, POLICY.maxWageHours);
    claimed = r2(h * rate); basis = `${h} hours at GBP ${rate.toFixed(2)}${hours > h ? ` (stated ${hours} hours, limited to ${POLICY.maxWageHours})` : ''}`;
  } else if (amt !== null) {
    claimed = r2(amt); basis = 'amount stated by patient';
  }
  if (claimed === null) { line.basis = 'No usable amount in the account; a figure is needed.'; return line; }
  line.claimed = claimed;

  const hard = flags.find((f) => f.severity === 'review');
  if (hard) { line.status = 'review'; line.basis = basis + '. Held for a human: ' + hard.text; return line; }
  const soft = flags.find((f) => f.severity === 'confirm');
  if (soft && !raw?.confirmed) { line.status = 'challenged'; line.basis = basis + '. Waiting for the patient to confirm: ' + soft.text; return line; }
  if (raw?.challenged && !raw?.confirmed) { line.status = 'challenged'; line.basis = basis + '. Challenged: ' + String(raw.challenged).slice(0, 200); return line; }

  const cap = POLICY.categoryCaps[category];
  if (category === 'other') { line.basis = basis + '. Not a category the policy pays automatically; held for a human.'; line.status = 'review'; return line; }
  const distanceBased = category === 'travel' && miles !== null && amt === null; // mileage has no receipt to ask for
  if (!hasEvidence && !distanceBased) { line.status = 'held'; line.basis = basis + '. Held: no receipt, payslip or booking confirmation mentioned.'; return line; }
  const pay = Math.min(claimed, cap);
  line.amount = r2(pay);
  line.status = pay < claimed ? 'capped' : 'payable';
  line.basis = basis + (pay < claimed ? `. Limited to the GBP ${cap} ${category} cap.` : '.') + (distanceBased && !hasEvidence ? ' Paid on the distance stated; no receipt exists for mileage.' : ` Document cited: ${evidence.replace(/_/g, ' ')}. It must be produced if the claim is audited.`);
  return line;
}

/** Whole claim: priced lines, total, and the amount that is safe to pay automatically. */
export function priceClaim(extraction) {
  const items = Array.isArray(extraction?.items) ? extraction.items.slice(0, 20) : [];
  const lines = items.map(priceLine);
  const claimedTotal = r2(lines.reduce((s, l) => s + (l.claimed || 0), 0));
  let payable = r2(lines.reduce((s, l) => s + l.amount, 0));
  const capped = payable > POLICY.totalCap;
  if (capped) payable = POLICY.totalCap;
  return {
    lines,
    claimedTotal,
    payableTotal: payable,
    heldTotal: r2(lines.filter((l) => l.status !== 'payable' && l.status !== 'capped').reduce((s, l) => s + (l.claimed || 0), 0)),
    totalCapApplied: capped,
    questions: Array.isArray(extraction?.questions) ? extraction.questions.slice(0, 5).map((q) => String(q).slice(0, 200)) : [],
    summary: String(extraction?.summary || '').slice(0, 400),
    currency: CURRENCY_DISPLAY,
  };
}
