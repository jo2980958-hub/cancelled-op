// Realistic demo data. Hospitals and patients are FICTIONAL. Dates are fixed (and the clock for each
// seeded case is frozen at `simToday`) so the demo looks the same on 13 Nov as it does today.
import { createCase, recordOffer, submitClaim, claimFinalize, claimConfirm, advance } from './logic.js';
import { readFileSync, existsSync } from 'node:fs';

export const SEEDS = [
  { id: 'seed-priya', input: { name: 'Priya Raman', email: 'sb-patient@personal.example.com', hospital: 'Northfield Royal Infirmary', procedure: 'Cataract surgery', setting: 'daycase', cancelledBy: 'hospital_nonclinical', timing: 'day_of_surgery', cancelledOn: '2026-09-02', simToday: '2026-09-02', reasonText: 'Told on arrival, after fasting: the list over-ran and there was no time for her slot.' },
    claim: 'I was cancelled at 11am after fasting from midnight. I drove 34 miles each way to Northfield, so 68 miles in total. Parking at the hospital cost 9.50 pounds and I have the ticket. I am self-employed and lost a full working day, 8 hours at 22 pounds an hour, and I can show invoices I had to postpone. I paid a neighbour 40 pounds to look after my two children for the day, and I have the bank transfer.' },
  { id: 'seed-daniel', input: { name: 'Daniel Mensah', email: 'daniel.mensah.patient@example.com', hospital: 'St Aldric\'s Hospital', procedure: 'Knee arthroscopy', setting: 'daycase', cancelledBy: 'hospital_nonclinical', timing: 'day_of_surgery', cancelledOn: '2026-09-02', simToday: '2026-09-14', reasonText: 'Surgeon unavailable. Told at the check-in desk.' } },
  { id: 'seed-helen', input: { name: 'Helen Cartwright', email: 'helen.cartwright.patient@example.com', hospital: 'Marlow Vale General', procedure: 'Inguinal hernia repair', setting: 'daycase', cancelledBy: 'hospital_nonclinical', timing: 'on_admission', cancelledOn: '2026-09-02', simToday: '2026-09-28', reasonText: 'No critical care bed free after admission.' }, leaveOpen: true,
    claim: 'I took a taxi to the hospital and back because I could not drive after the news, 180 pounds in total, no receipt as the driver did not give one. My sister took the day off work to come with me, she earns 85 pounds an hour and lost the whole day. I also lost two days of my own pay at 70 pounds an hour. Parking was 12 pounds.' },
  { id: 'seed-tomasz', input: { name: 'Tomasz Kowalczyk', email: 'tomasz.kowalczyk.patient@example.com', hospital: 'Kestrel Park University Hospital', procedure: 'Gallbladder removal', setting: 'inpatient', cancelledBy: 'hospital_nonclinical', timing: 'day_of_surgery', cancelledOn: '2026-09-02', simToday: '2026-09-11', reasonText: 'Emergency case took the theatre.' }, offerOn: { day: 9, date: '2026-09-28' } },
  { id: 'seed-aisha', exemplar: true, input: { name: 'Aisha Rahman', email: 'sb-patient@personal.example.com', hospital: 'Northfield Royal Infirmary', procedure: 'Total hip replacement', setting: 'inpatient', cancelledBy: 'hospital_nonclinical', timing: 'day_of_surgery', cancelledOn: '2026-08-03', simToday: '2026-08-03', reasonText: 'No ward bed on the day.' },
    claim: 'My hip replacement was cancelled on the day, after I had arranged a week off. I travelled by train from Leeds to Northfield, return ticket 46.80 pounds and I have the tickets. I booked a childminder for my two children for two days at 55 pounds a day, receipts from her. I lost 2 days of pay, 7.5 hours a day at 14.20 pounds an hour, my employer has confirmed it in a letter.', advanceTo: '2026-09-04' },
  { id: 'seed-graham', input: { name: 'Graham Blythe', email: 'graham.blythe.patient@example.com', hospital: 'Marlow Vale General', procedure: 'Varicose vein surgery', setting: 'daycase', cancelledBy: 'clinical', timing: 'day_of_surgery', cancelledOn: '2026-09-02', simToday: '2026-09-02', reasonText: 'Chest infection found at pre-op check. Cancelled on clinical advice.' } },
];

/** Idempotent. restore=true recreates every non-exemplar seed from scratch. Exemplar (a real paid sandbox payout) is never touched once it exists. */
export async function seed(deps, { restore = false, runClaims = true } = {}) {
  const made = [];
  for (const s of SEEDS) {
    const existing = await deps.store.get(s.id);
    if (existing && (s.exemplar || !restore)) continue;
    if (existing) await deps.store.del(s.id);
    await createCase(deps, s.input, { id: s.id, seed: true, exemplar: s.exemplar });
    if (s.offerOn) {
      // the date was offered on day 9 of the clock
      const { addDays } = await import('./clock.js');
      await rewind(deps, s.id, addDays(s.input.cancelledOn, s.offerOn.day));
      await recordOffer(deps, s.id, { date: s.offerOn.date });
      await rewind(deps, s.id, s.input.simToday);
    }
    if (s.claim && runClaims) await seedClaim(deps, s);
    if (s.advanceTo) {
      const { diffDays } = await import('./clock.js');
      await advance(deps, s.id, diffDays(s.input.simToday, s.advanceTo)); // fires the real payout through the engine
    }
    made.push(s.id);
  }
  return made;
}

const FIX = new URL('./seed-claims.json', import.meta.url);
/** Uses the recorded real agent run when present (fast, deterministic restore); otherwise runs the agent now. */
async function seedClaim(deps, s) {
  const fixtures = existsSync(FIX) ? JSON.parse(readFileSync(FIX, 'utf8')) : {};
  if (fixtures[s.id]) {
    const c = await deps.store.get(s.id);
    c.claim = { ...fixtures[s.id], status: s.leaveOpen ? fixtures[s.id].status : 'review' };
    c.events.push({ at: new Date(deps.now()).toISOString(), day: 0, type: 'claim', text: 'Claim read by the claim assistant (recorded run of the real Bedrock agent).' });
    await deps.store.put(c);
  } else {
    let v = await submitClaim(deps, s.id, s.claim);
    if (v.claim.status === 'needs_input' && !s.leaveOpen) v = await claimFinalize(deps, s.id);
  }
  if (!s.leaveOpen) await claimConfirm(deps, s.id);
}

async function rewind(deps, id, date) { // seed-only: pin the frozen clock to a date
  const c = await deps.store.get(id); c.simToday = date; await deps.store.put(c);
}
