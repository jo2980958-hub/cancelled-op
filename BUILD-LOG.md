# BUILD-LOG (running)

## 2026-10-02 — start
- Read brief, FINDINGS/NOTES-uk. Credentials present in ../../.env (not copied anywhere).
- **GBP PROBE (real sandbox, first thing)**: POST /v1/payments/payouts with currency GBP, 1.00 -> accepted, batch DJ4PYGASUR4CW,
  later GET: item `SUCCESS`, amount GBP 1.00, fee GBP 0.02. USD control PLS5UGHMNFETJ identical. **GBP payouts WORK in this sandbox.**
  Raw: evidence/probe-GBP.json, evidence/probe-USD.json.
- Live Payouts spec (v1.9) downloaded to evidence/payouts-schema.json. It contains NO per-item cap value (only pagination max 1000, error names
  RECEIVING_LIMIT_EXCEEDED / TRANSACTION_LIMIT_EXCEEDED). The three caps seen elsewhere (from ../../research/capability/FINDINGS.md s7.3):
  FAQ $20,000; fees table USD 60,000 registered / 20,000 unregistered, GBP 50,000 / 15,000; PayPal skill file "$20,000 USD". We enforce far below all of them.
- clock.js + 17 passing tests (boundary day28/29, DST Oct/Mar, 23:30Z->London next day, rebooking on day 28)
- policy.js, bedrock.js, paypal.js written
- store.js (memory+dynamo, optimistic lock), evidence.js (exact figures)
- logic.js (createCase/offer/decline/advance/claim/reconcile/payout/webhook/sweep)
- seed.js (6 fictional cases; exemplar seed-aisha pays via real engine)
- unit tests: clock 17, policy 9, logic 19, handler 7 (all green after fixing one test arithmetic error)
- FINDING: first probes showed item SUCCESS because `sb-patient@personal.example.com` is a REGISTERED sandbox personal account. Any unregistered address -> item UNCLAIMED
  (RECEIVER_UNREGISTERED). `sb-gypf446000721@personal.example.com` (PayPal's doc example) -> UNCLAIMED (RECEIVER_UNCONFIRMED). Sandbox DOES let us provoke UNCLAIMED
  (research said no documented trigger). Magic note ERRPYO002 -> 403 SENDER_EMAIL_UNCONFIRMED at create time. Malformed receiver -> 400 VALIDATION_ERROR. Duplicate sender_batch_id -> 400 USER_BUSINESS_ERROR.
- Added fixEmail for UNCLAIMED (cancel unclaimed item, re-send to corrected address, generation suffix on batch id). 403/401 = RETRY (operator side).
- UI direction from coordinator: portal layout (sidebar, top bar, banner+pill, 3-col cards w/ icon/illustration/arrow); plum+burgundy on cream, amber warning, muted green secured; clock permanent banner; breached card outranks. Own CSS only.
- UI v1 built (portal layout, banner clock, cards, breached card outranks). Local run OK with real Bedrock + PayPal (ports 18431/15173; 8787/8791 belong to sibling projects, do not touch).
- COORDINATOR ROUND 2 (go deeper): 1 rules engine w/ audit trail + explanation screen (restart on re-cancel, patient postponement); 2 trust dashboard w/ live exposure (WH50);
  3 Bedrock Converse TOOL-USE claim agent that asks follow-ups, requests evidence, challenges inflated claims; 4 webhook sig verify + tamper test + PayPal-Request-Id replay test; 5 failure modes (UNCLAIMED/invalid email/FAILED) w/ real output.
  Plan order: probes -> rules.js -> agent.js -> trust.js -> webhook capture/tests -> UI -> deploy -> TEST-RESULTS/README.
- PROBES (evidence/runs/probe-requestid-magic.txt):
  * PayPal-Request-Id replay does NOT dedupe payouts in this sandbox: same Request-Id + new sender_batch_id created a 2nd batch. The deterministic sender_batch_id is the real guard.
  * Duplicate sender_batch_id -> 400 USER_BUSINESS_ERROR, details[0].issue "Batch with given sender_batch_id already exists" and details[0].link[0].href = the ORIGINAL batch. => lost-write recovery: adopt that batch id.
  * ERRPYO001 403 SENDER_RESTRICTED, 002 403 SENDER_EMAIL_UNCONFIRMED, 003 403 AUTHORIZATION_ERROR, 005 422 INSUFFICIENT_FUNDS, 006 500 INTERNAL_ERROR, 010 400 VALIDATION_ERROR; 004/007/008/009 -> plain SUCCESS.
  * Item-level FAILED: recipient_type PAYPAL_ID with a bogus id -> batch DENIED, item FAILED RECEIVER_ACCOUNT_INVALID. PHONE and own business email -> UNCLAIMED (RECEIVER_UNREGISTERED / RECEIVER_UNCONFIRMED). BRL -> 400 NON_HOLDING_CURRENCY.
- rules.js written (R1-R10, trace per determination); logic.js wired (cycles, offerAction decline/postpone/recancel, audit trace on events). Old 17 clock tests pass against new evaluate.
- COORDINATOR ROUND 3 (ship-ready bar): no dead buttons, persistence (capability links + localStorage), a11y measured (contrast ratios in README, 200% zoom, focus ring, no colour-only), copy rules (no "we", verb buttons, no interjections, errors say how to fix), every state, responsive 360-1920 + dark mode, avoid cream+serif+terracotta template look (use Atkinson Hyperlegible; clock is the signature), no NHS look.
  Privacy decision: public /api/state returns example cases only (emails masked) + cases whose ids the browser passes; trust dashboard = example data (no auth in this build; disclosed).
- BACKEND ROUND 2 DONE (offline): agent.js (Converse tool use: check_claimable, add_line, ask_patient, request_evidence, challenge_line, submit_claim; server prices; soft/hard holds; <=2 questions; 10 step budget; backoff on Bedrock throttling),
  claim lifecycle working -> needs_input -> review -> submitted (patient files; only a filed claim can be paid), trust.js live-exposure report, createPayout adopts the ORIGINAL batch on duplicate sender_batch_id,
  webhook log + /api/admin/webhook-log, scoped /api/state (examples + own ids), delete own case, masked emails. Recorded real agent runs -> src/seed-claims.json (Priya filed, Aisha filed+paid, Helen left open with challenges).
  92 offline tests pass (clock 17, rules 18, policy 10, agent 12, trust 2, paypal.unit 4, logic ~22, handler 7).
- NEXT: UI rewrite (phone-first, four-week calendar clock, Atkinson Hyperlegible, light+dark, a11y), screenshots + scoring loop, then deploy + webhook registration + live tests.

## UI iteration log (screenshots in shots/r1..r10, e2e in shots/e2e; each round in its own directory)
- r1 (360 light, track): **6/10.** Clock reads, but 8 stacked nav pills pushed it far down the phone; flat; menu always open.
- r2 (360 light claim, 1280 light home): **7.5/10.** Collapsed nav into a Menu disclosure. Amber warning state strong. Bug found: Menu button leaked onto desktop (class specificity). Priced lines hidden while a question was open.
- r3 (360 dark why, 1280 trust): **8/10.** Dark mode good. Trust bars were scaled to the max (a count of 1 filled the bar); breach rate 50% had no sample size shown; audit timestamps unformatted. Fixed.
- e2e (real browser, real Bedrock + PayPal, 360px): 11/11 passed. But the review screenshot showed the 4-column cost table clipped at 360px, the payout receipt buried under a long timeline, and every chase line repeating a long parenthetical. **7.5/10.** Fixed: costs became cards with a totals bar, stacked tables on phones, receipt moved above the timeline, parenthetical removed (tag stays).
- r4-r10 (text scale 200% at 360, widths 320/360/768/1280/1920, light+dark): found real overflow from the top-bar button, case chips, flex amounts, long headings, calendar digits, a table (and fixed each). Final sweep: 0 horizontal scroll on all 10 views at 320/360/768/1280/1920 in both themes, and at 360 with 2x text. Note: my CSS-percent 2x simulation does not move rem media queries; real browser zoom/text-size does, so 640px (=200% zoom of 1280) and 320px (WCAG reflow) were tested directly.
- Final self-score: **8.5/10.** Not a 9: overview card text columns are narrower than ideal beside the illustrations, and the desktop sidebar ends at 100vh in full-page captures (it is sticky, correct in a live browser).
- Copy audit: grep for we/our/seamless/robust/leverage/oops/sorry found only code comments and three user-facing strings (fixed). Tagline changed from an opinion ("someone should pay") to a neutral description. Server errors rewritten to say how to fix.
- COORDINATOR CLAIM vs EVIDENCE (GBP): twice told GBP "cannot settle". My polled evidence (evidence/runs/gbp-reverify.txt): GBP 262.00 batch TB7XZTHHQJTC4 -> batch SUCCESS + item SUCCESS, fee GBP 5.24; exemplar GBP 369.80 batch SRMTEY6A2VEVA -> SUCCESS/SUCCESS; GBP 12.34 and 3.21 earlier. GBP is on PayPal's auto-convertible list (research s7.3).
  NON_HOLDING_CURRENCY is what BRL returned in my probe. Default stays GBP; added a disclosed env fallback (SANDBOX_SETTLE_CURRENCY=USD, ledger stays GBP) and precise handling for INSUFFICIENT_FUNDS / NON_HOLDING_CURRENCY (RETRY, never blamed on the patient).
- WEBHOOKS: 4 webhooks already registered on this PayPal app before this one. Events from this service's payouts are delivered to theirs too; their failures are not mine. My handler returns 200 for matched, duplicate, ignored and unmatched events (unmatched = another project's payout), 401 only for an unverifiable signature, and logs every delivery.
- Automated checks added: scripts/a11y-check.mjs (all pass), scripts/contrast.mjs (0 failing pairs), scripts/e2e-ui.mjs (11/11 real journey), scripts/e2e-ui2.mjs (all pass).
- deploy.sh written; deploying 02:12
- DESIGN-STANDARD PASS (deletion): removed the sidebar clock (it repeated the banner), the banner's legend/headers, the "recorded; delivery simulated" tag on every chase (chases now collapse to one line), rule ids and batch ids from the primary layout (rules behind a "The rules behind it" disclosure, PayPal batch behind "PayPal details"), the overview's three-fact band (now two sentences), badge-only card content, the footer restore control, and the duplicated copy of the patient's own account in the claim chat. Added the second number a patient wants beside the countdown: what is owed. The rules engine's decision now reads as a sentence ("The operation was cancelled by the hospital on 3 August 2026, on the day of surgery, for a non-clinical reason, so the 28-day promise applies...").
  r11-r13 screenshots. Scores after the cut: **phone 9/10, desktop 8.5/10** (desktop overview still has more explanatory prose above the cards than I like).
  Found by the dead-button sweep: banner "Review the claim" did nothing on the claim page; hidden there now.

## FINAL STATE (2 Oct 2026)
- Deployed: web https://drw0b3axbb84o.cloudfront.net ; Function URL https://75dinzuhygjxcbvdkqwcjjgjsu0quuyd.lambda-url.us-east-1.on.aws ; DynamoDB `cancelled-op` ; S3 `cancelled-op-site-854924711083` ; PayPal webhook 7010968192718134F (registered on the Function URL) ; hourly EventBridge sweep.
- Tests: 95 offline pass; sandbox PayPal 11/11; real Bedrock agent 5/5; live webhook 8/8; deployed browser journeys 11/11 and all-pass; responsive 70 captures 0 overflow; a11y all pass; contrast 0 failing pairs. See TEST-RESULTS.md.
- GBP: works (polled to terminal SUCCESS). Fallback switch exists but is off.
- Known gaps are listed in TEST-RESULTS.md section 10 and README "Honest limits".
- Local dev servers on 18431/15173 stopped. Nothing committed to git (not asked).
- Deck-copy cut: removed the 22.5% and GBP 0 blocks (and the penalty line in the intro) from the patient landing; moved verbatim to README 'For the submission'; trust dashboard keeps the 22.5% benchmark with its source. Landing before/after in evidence/runs/landing-*.txt.
- Navigation de-duplicated: sidebar removed (cards kept); masthead + 'All services' back link + a tab row on case pages only; third Report button removed; active tab is plain text (inert-control find from the click sweep). Journeys and sweeps re-run on production.
