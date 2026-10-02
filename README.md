# Cancelled-Op

**An agent that enforces the NHS 28-day promise and repays what a cancelled operation actually cost the patient.**

Live: **https://drw0b3axbb84o.cloudfront.net** (web app) · API: `https://75dinzuhygjxcbvdkqwcjjgjsu0quuyd.lambda-url.us-east-1.on.aws/api/health`
Licence: MIT. Independent project. Not an NHS service, not endorsed by the NHS, no NHS branding. Hospitals and patients in the examples are fictional. All money is PayPal **sandbox** money.

## The problem

Someone is cancelled on the day of their operation, after fasting, after arranging leave, childcare and travel, for a reason that has nothing to do with their health. England promises another binding date within 28 days. More than a fifth of the time the promise is broken, and nothing happens, because it is a pledge with no legal force and no financial penalty.

### Verified figures (used exactly, nothing rounded or invented)

| Fact | Figure | Source |
|---|---|---|
| Elective operations cancelled at the last minute for non-clinical reasons | **22,029** in Q1 2026-27, which is **0.9893%** of **2,226,660** elective admissions. The previous quarter: 23,056 | NHS England cancelled-operations statistics |
| Cancelled patients **not** treated within 28 days | **4,821 of 21,456 (22.5%)**, Q3 2025/26 | NHS England commentary, published 12 Feb 2026 |
| Cost to the hospital of a cancelled procedure | Day case **£458 to £479**, elective inpatient **£917 to £1,144** per episode | NHS National Cost Collection 2024/25, HRG WH50 "Procedure Not Carried Out" |
| Scale | About 297,600 episodes and £163m a year across both settings | **A sum calculated for this project, not a published NHS figure** |

### The promise is a pledge, not a legal right

- The NHS Constitution: "Pledges go above and beyond legal rights. This means that pledges are not legally binding."
- The 28-day commitment appears in the Constitution Handbook only under "government pledges".
- **SI 2012/2996 Part 9 contains no cancelled-operation provision.** The only "28 days" in it is the cancer-diagnosis standard in reg 52.
- The NHS Standard Contract carries the promise as National Quality Requirement E.B.S.2 with a zero-tolerance threshold, but **nationally mandated financial consequences for missing National Quality Requirements were removed from 2021/22**.
- WH50 is "not priced, currency not mandated" in the NHS Payment Scheme: nothing is paid nationally, so the trust absorbs the cost.
- The duty to have regard to the Constitution is **Health Act 2009 s.2**. It is a "have regard" duty. (It is not s.1B of the Health and Social Care Act 2012; that is s.1B of the NHS Act 2006 and binds only the Secretary of State.)

### What this project does not claim

- No breakdown of cancellation reasons for England. England publishes none and the collection has no reason field. The reasons offered in the form are input choices, never statistics.
- No per-session or per-minute theatre cost. The £16-a-minute figure sometimes quoted is a 2011 author assumption.

## For the submission

Deck copy, kept out of the patient's screens on purpose: these lines argue why the product should exist, so they belong in the Devpost description and the video script. (The trust dashboard keeps the 22.5% as an operational benchmark against its own breach rate.)

**Paste block 1: the breach rate**

> **22.5% of cancelled patients (4,821 of 21,456) were not treated within 28 days**, Q3 2025/26. NHS England commentary, published 12 Feb 2026. More than a fifth of the time the promise is broken.

**Paste block 2: no penalty**

> **The penalty for missing the promise is £0.** It is a pledge, not a legal right: the NHS Constitution says "Pledges go above and beyond legal rights. This means that pledges are not legally binding." SI 2012/2996 Part 9 contains no cancelled-operation provision. The NHS Standard Contract carries the promise as National Quality Requirement E.B.S.2 with a zero-tolerance threshold, but nationally mandated financial consequences for missing National Quality Requirements were removed from 2021/22.

**Supporting line for either:** 22,029 operations were cancelled at the last minute for non-clinical reasons in Q1 2026-27 (0.9893% of 2,226,660 elective admissions; 23,056 the quarter before). Each costs the hospital £458 to £479 (day case) or £917 to £1,144 (elective inpatient), HRG WH50, NHS National Cost Collection 2024/25, and the NHS pays nothing nationally for it.

Where the pledge point does appear in the app: only at the moment it matters, on a case whose promise has been broken ("The promise has no legal force and no automatic penalty..."), and on the Evidence and method page.

## What it does

**The patient's page answers two questions: when is my date owed, and what am I owed?** The 28-day clock is a four-week calendar with days crossed off. Beside the countdown sits the second number: what is repaid if the date is missed, or what was paid.

1. **Report a cancellation.** The clock starts on the London calendar date. Cancellations that are clinical, patient-initiated or before the day of admission are saved but marked outside the promise, with the reason.
2. **The agent chases the hospital** on days 3, 7, 14, 21, 26 and 28 while no binding date exists. *(Chases are recorded, not delivered: no channel into a real trust is connected, and the interface says so.)*
3. **Claim your costs.** A Bedrock claim agent reads the patient's own words, asks follow-up questions, requests documents, and **challenges inflated claims**. Fixed rules, not the model, set every amount.
4. **File the claim** (a two-step confirmation; only a filed claim can ever be paid).
5. **Day 29 arrives with no binding date: a payout fires automatically** through PayPal Payouts, in pounds sterling. The receipt settles to `SUCCESS` and the case keeps the whole audit trail.
6. **The trust's view** is a separate page: clocks running, which break within 7 days (with a form to record a binding date), breach rate against the national 22.5%, the WH50 cost absorbed, and repayments made.

Every decision comes with a plain-English reason, with the rules behind it one click away.

## The rules engine (`backend/src/rules.js`)

Ten explicit, individually tested rules, each producing a human-readable explanation of what applied and why.

| Rule | In one line |
|---|---|
| R1 | The hospital must have cancelled it. A patient cancelling or postponing is not covered. |
| R2 | On or after the day of admission, including the day of surgery. |
| R3 | A non-clinical reason. |
| R4 | Day 0 is the London date of the cancellation. Day 28 is the last valid day (inclusive). |
| R5 | A **binding** date within day 1 to day 28, offered by day 28, keeps the promise. |
| R6 | A patient who declines or postpones an in-window date stops the clock. Not a breach. |
| R7 | If the hospital cancels the rebooked operation **on or after the day of admission, non-clinically, a new 28-day clock starts**. Cancelled in advance: the offer is void and the old clock keeps running. Clinical: the offer stands. |
| R8 | From 00:00 London time on day 29 with nothing in place: the promise is broken. |
| R9 | A provisional date never keeps the promise. |
| R10 | A date after day 28, or an offer made after day 28, never keeps the promise. |

*How the clock counts.* Everything is a London calendar date compared as `YYYY-MM-DD`, never a multiple of 24 hours, so the October clock change cannot move a deadline. The pledge wording is "offered another binding date within 28 days"; NHS England's published measure counts patients **treated** within 28 days. This service applies the pledge wording, and says so.

## The claim agent (`backend/src/agent.js`)

Bedrock **Converse with tool use**, model `us.anthropic.claude-sonnet-4-5-20250929-v1:0`. Tools: `check_claimable`, `add_line`, `ask_patient`, `request_evidence`, `challenge_line`, `submit_claim`.

The model proposes; the server disposes. `add_line` returns the server's own pricing, caps and flags, and the model reads that result. A mileage rate (45p a mile), per-category caps, a ceiling of £750 per payout, a document for every cost except mileage, and a hard hold on implausible rates, long trips and companions' lost pay apply whatever the model says. These limits are this project's own policy, not NHS figures.

Verified against the real model (`TEST-RESULTS.md`): an honest claim is priced in full; an inflated one (£1,992 claimed, including an £85-an-hour companion and a £180 receiptless taxi) is challenged line by line and **£0 is paid** until answered; a vague account gets a question, not an invented amount; instructions hidden in the account change nothing.

## PayPal

Built on **Payouts**, the rail an agent can use hands-free (an agent cannot start a PayPal wallet payment without a person in a browser).

- `POST /v1/payments/payouts` to repay the patient by email, `GET /v1/payments/payouts/{id}` to follow it to a terminal state, `POST /v1/payments/payouts-item/{id}/cancel` to recover an unclaimed item.
- **Webhooks**: `PAYMENT.PAYOUTS-ITEM.SUCCEEDED / FAILED / UNCLAIMED` (and `BLOCKED, CANCELED, HELD, REFUNDED, RETURNED`, plus batch `SUCCESS`/`DENIED`). Every delivery is verified with `POST /v1/notifications/verify-webhook-signature` before it is applied. An unverifiable one gets `401`; a genuine one for someone else's payout gets `200` immediately.
- Verified against the live spec (`https://developer.paypal.com/api/payments.payouts-batch/v1/schema.json`, Payouts 1.9; the GitHub OpenAPI repo is stale).

### Currency: GBP works. Verified by polling to a terminal state.

A `201` on creating a batch proves nothing, so every claim here is the **terminal state**. In this sandbox, GBP payouts reach batch `SUCCESS` and item `SUCCESS` with a GBP fee: `TB7XZTHHQJTC4` (GBP 262.00, fee GBP 5.24), `SRMTEY6A2VEVA` (GBP 369.80, the exemplar case), `ECCNS8SFUQJJJ` (GBP 12.34) and more. GBP is on PayPal's list of auto-convertible currencies. A currency that is not (BRL) fails with `NON_HOLDING_CURRENCY`; that is the error to expect if GBP ever stops working. As insurance, `SANDBOX_SETTLE_CURRENCY=USD` makes PayPal move a small USD sandbox amount while the ledger and screen keep the real sterling figure, with a line on screen saying so. It is off by default. Raw output: `evidence/runs/gbp-reverify.txt`.

### The per-item payout cap: three documented values

The live schema states no per-item cap. PayPal's own pages disagree: the FAQ says **$20,000**; the fees table says **USD 60,000** (registered recipient) or **20,000** (unregistered), and **GBP 50,000 / 15,000**; PayPal's AI-toolkit skill file says "$20,000 USD". This service enforces £750, far below all three.

### Idempotency and failure modes (all proven with real sandbox output)

- **Replay protection.** The payout reference is deterministic per case (`cop-<case>`), sent as both `sender_batch_id` and `PayPal-Request-Id`, and stored. **Finding:** in this sandbox `PayPal-Request-Id` alone does **not** dedupe a payout (the same id with a new `sender_batch_id` created a second batch). The `sender_batch_id` is the real guard: a duplicate is refused with a `400` that carries a link to the **original** batch, and the service adopts it. This happened for real when the exemplar case was re-seeded: "PayPal already held a payout for this case, so it was adopted instead of paying again."
- **UNCLAIMED** (`RECEIVER_UNREGISTERED`): shown to the patient with what to do; correcting the address cancels the unclaimed item (only possible once its batch has finished processing) and re-sends once. Late webhooks for the superseded batch are ignored (a real bug found and fixed in testing).
- **Invalid email**: refused at the form, and refused by PayPal (`400 VALIDATION_ERROR`) if it ever got through.
- **FAILED item** (`RECEIVER_ACCOUNT_INVALID`, batch `DENIED`): recorded by the engine.
- **Funding problems** (`INSUFFICIENT_FUNDS`, `NON_HOLDING_CURRENCY`, `SENDER_EMAIL_UNCONFIRMED`): retried by the hourly sweep and never blamed on the patient.

## Architecture

```
Browser ── CloudFront ──┬── S3 (React + Vite build)
                        └── /api/*  ── Lambda Function URL (Node 22, one function, holds the PayPal secret)
                                          ├── DynamoDB on-demand (one item per case: clock, offers, claim, payout, audit)
                                          ├── Bedrock Converse (Claude Sonnet 4.5) with tool use
                                          ├── PayPal Payouts + webhook verification
                                          └── EventBridge, hourly: re-check clocks, fire due payouts, settle statuses
```

No API Gateway, no SAM or CDK: `deploy.sh` is plain `aws` CLI. Idle cost is close to zero (on-demand DynamoDB, free-tier Lambda, one hourly rule), which matters because it must survive judging from 13 Nov to 15 Dec.

Privacy decisions: the public API returns only the example cases and cases whose private ids the browser holds. Emails are masked everywhere. A case can be deleted by its owner (unless paid). The trust dashboard shows example data only, because this build has no trust login.

## Accessibility (measured)

Contrast is computed from the real colour values by `scripts/contrast.mjs` (output in `evidence/runs/contrast.txt`): **0 failing pairs in light and dark**. Lowest and highest, in words:

| Pair | Ratio | Needed |
|---|---|---|
| Body text, ink on cream (light) | 15.45:1 | 4.5 |
| Muted text on a card (light) | 8.54:1 | 4.5 |
| Plum headings and links on cream | 11.51:1 | 4.5 |
| White on the plum button | 13.09:1 | 4.5 |
| Burgundy text on a card | 8.52:1 | 4.5 |
| Dark amber text on a card | 8.38:1 | 4.5 |
| Green text on a card | 7.30:1 | 4.5 |
| Clock, running: white on deep plum | 15.53:1 | 4.5 |
| Clock, warning: near-black on amber | 8.83:1 | 4.5 |
| Clock, broken: white on burgundy | 10.14:1 | 4.5 |
| Clock, kept: white on green | 8.28:1 | 4.5 |
| Lowest text pair: calendar digits on the green clock | 5.46:1 | 4.5 |
| Form field border against its card | 4.86:1 | 3 |
| Dark theme: body text | 16.64:1 | 4.5 |
| Dark theme: lowest text pair | 5.46:1 | 4.5 |

Other floors, measured in the running UI by `scripts/a11y-check.mjs`: smallest text 14px (floor 13.3px, which is 10pt); smallest control 40px high (floor about 37px, which is 28pt); every focused control shows a 3px focus ring; no horizontal scroll at 320, 360, 768, 1280 and 1920px in light and dark, nor at 2x text on a phone. Status never relies on colour alone: every state carries a word ("Promise broken", "Held: needs a document") and calendar days use shape (crossed out, dot, bar). The countdown is static text, so `prefers-reduced-motion` has nothing to remove beyond hover transitions. The font is Atkinson Hyperlegible, designed for low vision. Light, dark and system themes.

## Run it

```bash
# tests (no network needed for the first line)
cd backend && npm install
npm test                                   # 95 offline tests
node --test test/sandbox.paypal.test.js    # real PayPal sandbox (needs ../../.env)
node --test test/live.agent.test.js        # real Bedrock
# local app
PORT=18431 node dev-server.js &            # the real Lambda handler behind node:http
cd ../frontend && npm install && API_PROXY=http://localhost:18431 npx vite
# deploy (account 854924711083, us-east-1)
./deploy.sh
```

Credentials are read from `../../.env` (PayPal sandbox only) and written only to the Lambda's encrypted environment. Nothing is committed (`.gitignore`).

## Repository map

`backend/src` rules, clock, claim policy, agent, PayPal, trust report, handler · `backend/test` 95 offline tests plus real-sandbox suites · `frontend/src` the interface · `scripts` browser journeys, accessibility and contrast checks · `evidence/runs` real outputs · `shots` screenshots of every round · `BUILD-LOG.md` how it was built, with scores · `TEST-RESULTS.md` real test output.

## Honest limits

- Chases to the hospital are recorded, not sent. Nothing in the sandbox can receive them.
- The trust dashboard has no login; it shows example data. A real deployment needs trust authentication and a funded pledge account.
- Who pays? In this build the payer is the sandbox business account. In practice a trust or commissioner would fund a pledge account; no national mechanism exists.
- The payout ceiling, mileage rate and category caps are this project's own policy, not NHS figures.
- The demo clock controls move a single case's clock so day 29 can be watched; the real clock takes 28 days.
- PayPal webhook subscriptions are per app, and this sandbox app is shared with other projects, so the webhook endpoint also receives their events and answers `200` for them.
