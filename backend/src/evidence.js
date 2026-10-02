// The verified figures. Used verbatim by the API and the UI. Do not round, do not extend.
export const EVIDENCE = {
  asOf: '2026-10-02',
  cancellations: { q: 'Q1 2026-27', count: 22029, pctOfAdmissions: '0.9893%', admissions: 2226660, previousQuarter: 23056 },
  breach: { q: 'Q3 2025/26', notTreated: 4821, cancelled: 21456, pct: '22.5%', source: 'NHS England commentary, published 12 Feb 2026' },
  pledge: {
    constitution: 'Pledges go above and beyond legal rights. This means that pledges are not legally binding.',
    handbook: 'The 28-day commitment appears in the NHS Constitution Handbook only under "government pledges".',
    si: 'SI 2012/2996 Part 9 contains no cancelled-operation provision. The only "28 days" in it is the cancer-diagnosis standard in reg 52.',
    contract: 'The NHS Standard Contract carries the promise as National Quality Requirement E.B.S.2 (zero tolerance), but nationally mandated financial consequences for missing National Quality Requirements were removed from 2021/22.',
    statute: 'The duty to have regard to the Constitution is Health Act 2009 s.2. It is a "have regard" duty, not a right to a new date.',
  },
  hospitalCost: {
    hrg: 'WH50 "Procedure Not Carried Out"', source: 'NHS National Cost Collection 2024/25',
    daycase: { low: 458, high: 479 }, inpatient: { low: 917, high: 1144 },
    episodes: 297600, totalMillions: 163,
    totalNote: 'About 297,600 episodes and 163 million pounds a year across both settings. That total is a sum calculated for this project, not a published NHS figure.',
    pricing: 'Not priced, currency not mandated in the NHS Payment Scheme: nothing is paid nationally for WH50, so the trust absorbs it.',
  },
  notClaimed: [
    'England publishes no breakdown of cancellation reasons and the collection has no reason field.',
    'No current published per-session or per-minute theatre cost exists. The 16-pounds-a-minute figure sometimes quoted is a 2011 author assumption.',
  ],
};
