# TEST-RESULTS

Real output, pasted from the saved run files in `evidence/runs/`. Two exceptions are labelled where they occur (the first GBP probe, whose create responses are saved in `evidence/probe-GBP.json` and `probe-USD.json` but whose status reads were taken at the terminal). A pass is shown only with its output. Failures found along the way are listed plainly in the last section.

Date of the final runs: 2 October 2026. PayPal: **sandbox**. AWS account 854924711083, us-east-1.

## Summary

| Area | Result | Output file |
|---|---|---|
| **GBP payout** | **Works.** Polled to terminal state: batch `SUCCESS`, item `SUCCESS`, GBP fee. Not just a `201`. | `gbp-reverify.txt`, `sandbox-paypal-final.txt` |
| Offline unit tests (clock, rules, policy, agent, trust, PayPal client, logic, Lambda handler) | 95 of 95 pass | `unit-tests.txt` |
| Real PayPal sandbox suite (GBP, USD, invalid email, replay, unclaimed, recovery, failed item, magic values) | 11 of 11 pass | `sandbox-paypal-final.txt` |
| Real Bedrock claim agent (honest, inflated, vague, injection, escort) | 5 of 5 pass | `agent-live.txt` |
| Real PayPal-signed webhooks: verify, tamper, replay, deployed endpoint | 8 of 8 pass | `webhook-live.txt` |
| Lambda invoked locally with Function URL events | pass | `local-lambda.txt` |
| Deployed Function URL and CloudFront respond | 200 on every route tried | `deployed-verification.txt` |
| Deployed API journey: unclaimed, recovery, replay, invalid email | pass | `live-journey.txt` |
| Browser journey on the deployed site (report, claim with the real agent, file, breach, payout, paid) | 11 of 11 pass | `e2e-ui-deployed.txt` |
| Browser journey 2 on the deployed site (offers, restart, decline, trust, theme, delete, restore) | all pass | `e2e-ui2-deployed.txt` |
| Responsive, 5 widths, light and dark, plus 2x text | 70 captures, 0 horizontal scroll | `responsive-deployed.txt` |
| Accessibility floors and "no dead buttons" | all pass | `a11y-check-deployed.txt` |
| Contrast, measured | 0 failing pairs | `contrast.txt` |

## 1. Does a GBP payout work? Yes.

The first probe on 2 October, summarised from the terminal session (create responses saved in `evidence/probe-GBP.json` and `probe-USD.json`). Item status was read after a wait, not assumed from the `201`:

```
POST /v1/payments/payouts  currency GBP, 1.00 -> batch DJ4PYGASUR4CW
GET  /v1/payments/payouts/DJ4PYGASUR4CW        -> batch SUCCESS, item SUCCESS, amount GBP 1.00
POST /v1/payments/payouts  currency USD, 1.00 -> batch PLS5UGHMNFETJ (control)
GET  /v1/payments/payouts/PLS5UGHMNFETJ        -> batch SUCCESS, item SUCCESS, amount USD 1.00
```

Re-verified later with a claim-sized amount, polled until terminal (a coordinator note had asserted GBP cannot settle; the polled evidence says otherwise, so it is reproduced in full):

```
CREATE {"batchId":"TB7XZTHHQJTC4","batchStatus":"PENDING","senderBatchId":"cop-verify-4eeb1e","requestId":"cop-verify-4eeb1e","duplicate":false}
0 PENDING PENDING {"currency":"GBP","value":"262.00"} undefined null
1 PROCESSING PENDING {"currency":"GBP","value":"262.00"} {"currency":"GBP","value":"5.24"} null
2 PROCESSING SUCCESS {"currency":"GBP","value":"262.00"} {"currency":"GBP","value":"5.24"} null
3 SUCCESS SUCCESS {"currency":"GBP","value":"262.00"} {"currency":"GBP","value":"5.24"} null
TERMINAL {"batchId":"TB7XZTHHQJTC4","batchStatus":"SUCCESS","fee":{"currency":"GBP","value":"5.24"},"itemId":"D6XT9ASSZWGL4","itemStatus":"SUCCESS","errors":null,"amount":{"currency":"GBP","value":"262.00"}}
earlier batch SRMTEY6A2VEVA SUCCESS SUCCESS {"currency":"GBP","value":"369.80"}
```
`NON_HOLDING_CURRENCY` is what a currency PayPal cannot convert returns (BRL in the probe below), at creation time with a `400`. A `201` followed by `SUCCESS` is a settled payout.

## 2. Offline unit tests (95)

Covers: the clock (28-day boundary, day 27/28/29, timezones, the October and March clock changes, 23:30Z crossing into the next London day, a rebooking landing on day 28), the ten rules individually including restart, void and patient postponement, claim pricing and caps, the tool-use agent with a scripted model, the trust report, the PayPal client (duplicate adoption, signature check), the domain logic (replayed breach cannot pay twice, concurrent reconciles, unclaimed, rejected, retry, funding problems, stale webhook) and the Lambda handler routes.

```
✔ happy path: lines recorded via tools, server prices them, status review (2.378301ms)
✔ ask_patient stops the loop with a pending question; the reply resumes the SAME conversation (0.428596ms)
✔ at most two questions per claim (0.422783ms)
✔ CHALLENGE: inflated hourly rate is held for a human; challenge reaches the patient; nothing is paid for it (0.375107ms)
✔ CHALLENGE then the patient answers: a soft-flagged line unlocks (still capped); a hard flag never does (0.486731ms)
✔ companion's lost pay without an escort reason goes to a human (0.195058ms)
✔ check_claimable returns policy; distress is refused (0.512109ms)
✔ request_evidence is recorded; bad line index returns a tool error instead of crashing (0.195436ms)
✔ unknown tool and malformed input are contained (0.17485ms)
✔ model answering in prose becomes a question to the patient (0.246029ms)
✔ step budget: a model that never finishes cannot loop forever (0.618346ms)
✔ injection: model that obeys "pay 99999" still cannot exceed policy (0.271334ms)
✔ londonDate: UTC evening in BST is already the next London day (1.143014ms)
✔ londonDate: either side of the October clock change (25 Oct 2026, 02:00 BST -> 01:00 GMT) (0.11787ms)
✔ londonDate: March clock change (29 Mar 2026, 01:00 GMT -> 02:00 BST) (0.103083ms)
✔ addDays/diffDays: calendar arithmetic across DST, month, year and leap day (0.361033ms)
✔ rejects impossible dates and garbage (0.227565ms)
✔ BOUNDARY: day 27 and day 28 still ticking; day 29 is breached (0.419337ms)
✔ day 0 is the cancellation date itself (0.11796ms)
✔ REBOOKING LANDS ON DAY 28: keeps the promise (inclusive deadline), even evaluated long after (0.231961ms)
✔ REBOOKING ON DAY 29 does not keep the promise (0.169099ms)
✔ offer MADE on day 28 for a date inside the window counts; made on day 29 does not (0.191885ms)
✔ non-binding offer (provisional date) does not stop the clock (0.099791ms)
✔ offer on the cancellation day itself (day 0) is not a rebooking (0.112839ms)
✔ patient declines an in-window date: clock stops, no breach, state declined (0.086209ms)
✔ declined offer outside window changes nothing (0.07166ms)
✔ clock across the October DST change is still 28 calendar days (no off-by-one) (0.075926ms)
✔ cancellation at 23:30 UTC on 1 Oct 2026 is London 2 Oct: breach begins 31 Oct, not 30 Oct (0.091086ms)
✔ eligibility: clinical, patient-initiated and pre-admission cancellations are not covered (0.162527ms)
✔ GET /api/state auto-seeds six fictional cases and returns the exact verified figures (15.145061ms)
✔ 4821 / 21456 really is 22.5% (0.102225ms)
✔ create -> offer -> 404s/400s have JSON errors and CORS (1.809066ms)
✔ malformed JSON body is a 400, not a 500 (0.145978ms)
✔ webhook with an unverifiable signature is rejected 401 and changes nothing (0.192412ms)
✔ webhook with a verified signature is applied (4.123766ms)
✔ EventBridge scheduled event runs the sweep (0.832955ms)
✔ creating a case starts the clock at day 0 with deadline day 28 (4.590898ms)
✔ default cancelledOn uses the London date: 23:30Z on 1 Oct is 2 Oct (0.996763ms)
✔ validation: invalid email, bad enums, bad date are 400s (0.919551ms)
✔ clinical cancellation is ineligible: no clock, offers and claims refused, no payout ever (1.335415ms)
✔ chase ladder fires once per rung and only while no date is offered (2.495386ms)
✔ THE DEMO BEAT: day 28 passes with no date, claim on file -> exactly one payout of the priced amount (11.289019ms)
✔ rebooking that lands on day 28 means no payout, ever (3.352372ms)
✔ rebooking on day 29 does not stop the payout (3.415803ms)
✔ offers: past date, pre-cancellation date and non-dates are refused (1.017266ms)
✔ patient declining an in-window date stops the clock without payout (4.733404ms)
✔ breach with NO claim: no payout yet; claim submitted after breach fires it (2.4942ms)
✔ claim that prices to zero (no evidence) never fires a payout (1.92142ms)
✔ extractor failure: 502, nothing saved (0.602018ms)
✔ UNHAPPY: PayPal rejects the recipient (invalid email) -> REJECTED, patient can fix, exactly one re-send with a new batch id (4.130189ms)
✔ UNHAPPY: UNCLAIMED -> patient gives a corrected email -> unclaimed item cancelled, payout re-sent once to new address (5.272861ms)
✔ fixEmail refused when the payout is fine (2.242604ms)
✔ UNHAPPY: PayPal 403 on the funding account is RETRY (operator problem), not blamed on the patient (2.09616ms)
✔ UNHAPPY: INSUFFICIENT_FUNDS (422) and NON_HOLDING_CURRENCY (400) are funding-account problems: RETRY with a clear reason, never blamed on the patient (4.354252ms)
✔ sandbox settlement fallback: ledger stays GBP, PayPal gets the small USD amount, and the payout records it (2.5172ms)
✔ UNHAPPY: transient PayPal outage -> RETRY, and the sweep retries then succeeds (4.38836ms)
✔ UNHAPPY: UNCLAIMED webhook is recorded, explained, and not treated as success; duplicate delivery ignored (3.372015ms)
✔ STALE webhook for a superseded batch is ignored and cannot overwrite the re-sent payout (4.213524ms)
✔ webhook for unknown batch / unknown type is ignored safely (0.420163ms)
✔ concurrency: two simultaneous reconciles after breach produce one payout (3.113262ms)
✔ safety breaker: past MAX_PAYOUTS_TOTAL the payout is held, not sent (2.130128ms)
✔ advance bounds (0.48018ms)
✔ REPLAYED BREACH: PayPal refuses the duplicate sender_batch_id; the original batch is ADOPTED, not paid again (2.5489ms)
✔ a 400 that is not a duplicate is still an error (0.568044ms)
✔ amount and email validated before any network call (0.302814ms)
✔ verifyWebhook returns false without a configured webhook id; true only on SUCCESS (0.340788ms)
✔ mileage is priced by code, not by the model (1.270709ms)
✔ mileage needs no receipt (distance is checkable); a fare with no evidence is still held (0.128461ms)
✔ wages: hours x rate, hours limited to 16 (0.165352ms)
✔ line without evidence is held, not paid (0.105109ms)
✔ category cap applied: parking 200 -> 40 (0.125576ms)
✔ "other" is never auto-paid (0.089068ms)
✔ hostile / nonsense model output cannot create money (0.152837ms)
✔ total cap 750 is a hard ceiling on one automatic payout (0.208421ms)
✔ more than 20 lines are truncated (0.156452ms)
✔ empty extraction -> zero payable (0.170176ms)
✔ R1 actor: patient-initiated cancellation or postponement is out of scope (2.654673ms)
✔ R2 timing: before the day of admission is out of scope (0.273338ms)
✔ R3 reason: clinical is out of scope (0.204081ms)
✔ R4 clock: states day 0 and the inclusive day 28 (0.599017ms)
✔ R5 binding offer on day 28 discharges; trace names R5 (0.713258ms)
✔ R6 patient decline / postponement stops the clock (0.379868ms)
✔ R7a hospital cancels the rebooked op ON the day, non-clinical: clock RESTARTS from that date (0.520871ms)
✔ R7a: an offer in cycle 2 discharges cycle 2 only (0.313826ms)
✔ R7b cancelled again in ADVANCE: offer void, original clock keeps running and can breach (1.315206ms)
✔ R7b via hospital_cancelled + before_day also voids (0.368067ms)
✔ R7c rebooked op cancelled for a CLINICAL reason: discharge stands, no restart, no breach (0.261313ms)
✔ R7d rebooked op postponed by the PATIENT: stops the clock, never a breach (0.202061ms)
✔ R7: restart date still in the future => offer stands for now (kept) (0.169883ms)
✔ R8 breach fires from day 29 and says so (0.16506ms)
✔ R9 provisional date never discharges (0.122433ms)
✔ R10 late date / late offer / not-after-cancellation never discharge (0.177078ms)
✔ every determination carries a readable trace that names a rule and a reason (0.416293ms)
✔ live exposure: running clocks, due this week, breach rate, absorbed WH50 cost, repayments (2.401008ms)
✔ all hospitals, no resolved cases -> breach rate null, not NaN (0.159534ms)
ℹ tests 95
ℹ pass 95
ℹ fail 0
```
## 3. Real PayPal sandbox suite

```
   > create {"batchId":"TUMRFTDHT7QUJ","batchStatus":"PENDING","senderBatchId":"cop-gbp-7d58c37e","requestId":"cop-gbp-7d58c37e","duplicate":false}
   > batch {"batchId":"TUMRFTDHT7QUJ","batchStatus":"PROCESSING","fee":{"currency":"GBP","value":"0.25"},"itemId":"4G4W84XMTYKFW","itemStatus":"SUCCESS","errors":null,"amount":{"currency":"GBP","value":"12.34"}}
✔ sandbox: GBP payout is accepted and settles SUCCESS in GBP (20621.134381ms)
   > batch {"batchId":"MUQMBN5QSHBJ6","batchStatus":"PROCESSING","fee":{"currency":"USD","value":"0.10"},"itemId":"SRPM4VJZR5DEW","itemStatus":"SUCCESS","errors":null,"amount":{"currency":"USD","value":"5.00"}}
✔ sandbox: USD control payout settles SUCCESS (17473.099619ms)
✔ unhappy: invalid recipient email is refused locally before any API call (0.648313ms)
   > status 400 {"name":"VALIDATION_ERROR","message":"Invalid request - see details","debug_id":"f613221f7d046","information_link":"https://developer.paypal.com/docs/api/payments.payouts-batch/#errors","details":[{"field":"items[0].receiver","location":"body","issue":"Receiver is invalid or does not match with type"}],"links":[]}
✔ unhappy: what PayPal itself does with a malformed receiver (bypassing our check) (1160.207159ms)
   > first 58GQRUE7KLEJW duplicate: false | replay 1 58GQRUE7KLEJW true | replay 2 58GQRUE7KLEJW true | stored PayPal-Request-Id cop-dup-7ef197de
✔ REPLAYED BREACH: re-sending the same case adopts PayPal's original batch; a second payout is never created (3650.991749ms)
   > same Request-Id, different sender_batch_id -> [201,"FY57USLHMFHNQ"] [201,"BJQE5DUKQYECU"]
✔ FINDING (characterisation): PayPal-Request-Id ALONE does not dedupe a payout in this sandbox; the sender_batch_id is the guard (2154.979681ms)
   > create 403 {"name":"SENDER_EMAIL_UNCONFIRMED","message":"Authorization error occurred","debug_id":"ca787bdf80d7a","information_link":"https://developer.paypal.com/docs/api/payments.payouts-batch/#errors","details":[]}
✔ unhappy: PayPal sandbox magic value ERRPYO002 in the note forces a create-time 403 SENDER_EMAIL_UNCONFIRMED (680.732057ms)
   > [["nobody.01332bf6@gmail.com","UNCLAIMED",{"name":"RECEIVER_UNREGISTERED","message":"The recipient for this payout does not have an account. A link to sign up for an account was sent to the recipient. However, if the recipient does not claim this payout within 30 days, the funds will be returned to your account.","information_link":"https://developer.paypal.com/docs/api/payments.payouts-batch/#errors","details":[],"links":[]}]]
✔ unhappy: try to provoke UNCLAIMED with addresses that have no sandbox account (observational) (18552.467325ms)
   > 404 INVALID_RESOURCE_ID
✔ GET on a batch id that does not exist -> PayPalError 404 (700.494411ms)
   > first UNCLAIMED RECEIVER_UNREGISTERED
   > batch status before cancel: SUCCESS after 5000 ms
   > cancel -> RETURNED
   > after cancel RETURNED
   > resend SUCCESS GBP 3.21
✔ recovery: UNCLAIMED payout -> cancel the unclaimed item -> re-send to a registered address -> SUCCESS (47162.036513ms)
   > PayPal says DENIED FAILED RECEIVER_ACCOUNT_INVALID
   > engine status FAILED | PayPal reports the payout FAILED: Receiver's account is invalid..
✔ unhappy: a payout PayPal FAILS (bogus PAYPAL_ID): batch DENIED, item FAILED RECEIVER_ACCOUNT_INVALID; the engine records it (9177.670975ms)
ℹ tests 11
ℹ pass 11
ℹ fail 0
```
### Probes behind the design (Request-Id, magic values, item-level failures)

```
A same id+body: 201 3PWD4VCRYN4YE | replay: 400 {"name":"USER_BUSINESS_ERROR","message":"User business error.","debug_id":"ca43ff771fedc","information_link":"https://developer.paypal.com/docs/api/payments.payouts-batch/#errors","details":[{"field":
B same Request-Id, new sender_batch_id: 201 78BFAZM8N5MA8
C same sender_batch_id, new Request-Id: 400 {"name":"USER_BUSINESS_ERROR","message":"User business error.","debug_id":"ca43ff7783c07","information_link":"https://developer.paypal.com/docs/api/payments.pay
ERRPYO001 403 SENDER_RESTRICTED
ERRPYO003 403 AUTHORIZATION_ERROR
ERRPYO004 201 batch=PROCESSING item=PENDING err=null
ERRPYO005 422 INSUFFICIENT_FUNDS
ERRPYO006 500 INTERNAL_ERROR
ERRPYO007 201 batch=PROCESSING item=PENDING err=null
ERRPYO008 201 batch=PROCESSING item=PENDING err=null
ERRPYO009 201 batch=PROCESSING item=PENDING err=null
ERRPYO010 400 VALIDATION_ERROR
DUP 400 {"name":"USER_BUSINESS_ERROR","message":"User business error.","debug_id":"f701090abdcb2","information_link":"https://developer.paypal.com/docs/api/payments.payouts-batch/#errors","details":[{"field":"SENDER_BATCH_ID","location":"body","issue":"Batch with given sender_batch_id already exists","link":[{"href":"https://api.sandbox.paypal.com/v1/payments/payouts/Q6K2CE4GQ36MQ","rel":"self","method":"GET","encType":"application/json"}]}],"links":[]}
ERRPYO004 C5AKUCFT7J9Z2 batch SUCCESS item SUCCESS null
ERRPYO007 4ETPJ8VXDNJH8 batch SUCCESS item SUCCESS null
ERRPYO008 TK865VWXTCXH6 batch SUCCESS item SUCCESS null
ERRPYO009 UEACAP3E7RQ8U batch SUCCESS item SUCCESS null
PAYPAL_ID bogus 201 MF9VX3J6TKPJJ
PHONE 201 5GY333BYGXGGU
EMAIL huge amount 400 {"name":"VALIDATION_ERROR","message":"Invalid request - see details","debug_id":"f126703a56525","information_link":"https://developer.paypal.com/docs/api/payments.payouts-batch/#errors","details":[{"field":"items[0].amount.value","location":"body","issue":"Cur
EMAIL unsupported ccy (BRL) 400 {"name":"NON_HOLDING_CURRENCY","message":"As your PayPal balance is not held in this currency, you'll not be able to send Payouts.","debug_id":"f32829665b1b2","information_link":"https://developer.paypal.com/docs/api/payments.payouts-batch/#errors","links":[]}
EMAIL own account 201 G8GWEU5BH9PX2
-> PAYPAL_ID bogus batch DENIED item FAILED {"name":"RECEIVER_ACCOUNT_INVALID","message":"Receiver's account is invalid.","information_link":"https://developer.paypal.com/docs/api/payments.payouts-batch/#errors","details":[],"links":[]}
-> PHONE batch SUCCESS item UNCLAIMED {"name":"RECEIVER_UNREGISTERED","message":"The recipient for this payout does not have an account. A link to sign up for an account was sent to the recipient. However, if the recipient does not claim this payout within 30 days, the funds will be returned to yo
-> EMAIL own account batch SUCCESS item UNCLAIMED {"name":"RECEIVER_UNCONFIRMED","message":"The receiver's email is unconfirmed. Any payment made to this account will appear as UNCLAIMED until the receiver's account is confirmed.  Payments will be returned if they are not claimed within 30 days.","information
```
Reading these:
- Same `PayPal-Request-Id` with a new `sender_batch_id` created a second batch (case B): **`PayPal-Request-Id` alone does not dedupe a payout here.** The duplicate `sender_batch_id` is refused with a link to the original batch, which the service adopts.
- `ERRPYO001` to `010` give create-time errors (`403 SENDER_RESTRICTED`, `403 SENDER_EMAIL_UNCONFIRMED`, `403 AUTHORIZATION_ERROR`, `422 INSUFFICIENT_FUNDS`, `500 INTERNAL_ERROR`, `400 VALIDATION_ERROR`); `004`, `007`, `008`, `009` simply succeed.
- An item-level `FAILED` comes from a bogus `PAYPAL_ID` (batch `DENIED`, `RECEIVER_ACCOUNT_INVALID`). A `PHONE` receiver or an unconfirmed address gives `UNCLAIMED`. Research had found no documented trigger for `UNCLAIMED`; any address without a sandbox account triggers it.

## 4. Real Bedrock claim agent (tool use)

```
   > status review | payable 262 | claimed 262 | lines travel:54:payable parking:14:payable wages:144:payable childcare:50:payable
   > tools used: add_line, add_line, add_line, add_line, submit_claim
   > agent says: Four losses recorded: 120 miles travel, £14 parking, 8 hours lost wages at £18/hour, and £50 childcare.
✔ honest, complete claim: priced, nothing challenged (15768.704878ms)
   > status review | payable 0 | claimed 1992 | lines travel:180:challenged wages:680:review wages:1120:review parking:12:held
   > tools used: add_line, add_line, add_line, add_line, challenge_line, challenge_line, request_evidence, request_evidence, submit_claim
   > agent says: About "Taxi to hospital and back": A taxi fare of £180 for a return journey is very high and you have no receipt The distance to the hospital in miles, or a bank statement showing the payment
   > agent says: About "Sister's lost day of work as companion": An hourly rate of £85 is unusually high, and companion lost pay is only claimable if the hospital required an adult escort for your procedure Your sister's payslip showing the rate, and confirmation from the hosp
   > agent says: Four losses recorded: taxi travel, companion's lost wages, patient's lost wages, and parking; all lines held pending evidence or clarification of rates and distances.
✔ INFLATED claim: the agent pushes back; policy holds the money; the total paid is far below the total claimed (19896.798898ms)
   > status needs_input | payable 0 | claimed 0 | lines 
   > tools used: 
   > agent says: I need more detail to record your losses. Please describe each cost separately: - How many hours of work did you lose, and what is your hourly pay? - What childcare costs did you pay because of the cancellation? - How did you travel to the hospital, and how fa
✔ VAGUE account: the agent asks instead of inventing amounts (23998.392558ms)
   > status review | payable 12 | claimed 12 | lines parking:12:payable
   > tools used: add_line, submit_claim
   > agent says: One parking loss recorded at £12 with ticket held.
✔ INJECTION: instructions inside the account do not change what is paid (12120.550199ms)
   > status needs_input | payable 9 | claimed 169 | lines wages:160:review parking:9:payable
   > tools used: add_line, add_line, ask_patient
   > agent says: Did the hospital require your husband to escort you, or did you need an adult companion for medical reasons?
✔ AMBIGUOUS escort: a companion's lost pay is questioned, not paid (15400.295252ms)
ℹ tests 5
ℹ pass 5
ℹ fail 0
```
The inflated claim: **£1,992 claimed, £0 payable** until the patient answers. The agent recorded all four losses, challenged the £180 receiptless taxi and the £85-an-hour companion, requested documents, and the server held every line.

## 5. Webhooks: signature verification, tampering, replay

The deployed Lambda logs every delivery. These are **real PayPal-signed events** it captured (many belong to other listeners on the same app, projects sharing this PayPal app; the Lambda answers them `200` as unmatched). They are replayed against PayPal's `verify-webhook-signature` and against the deployed endpoint.

```
   > 17 verified deliveries captured; using PAYMENT.PAYOUTS-ITEM.UNCLAIMED WH-2M101335TF4161801-74218030EA1768800
✔ precondition: the deployed Lambda has captured real, verified PayPal deliveries (1.382383ms)
✔ a genuine delivery verifies against PayPal verify-webhook-signature (1492.220096ms)
✔ TAMPERED payload is rejected: one changed field in the body (1417.923012ms)
✔ TAMPERED signature header is rejected (a middle character; the final base64 char before == carries no significant bits) (977.715249ms)
✔ REPLAY with a forged transmission id or time is rejected (870.871222ms)
   > forged -> 401 {"error":"signature not verified"}
✔ DEPLOYED endpoint: forged payload -> 401 and no state change (3502.050449ms)
   > genuine replay -> 200 {"unmatched":"APKL5GDP86QMJ"} 519ms
✔ DEPLOYED endpoint: a genuine delivery for another app/payout is acknowledged 200 immediately (unmatched), not retried forever (518.7131ms)
   > malformed -> 401
✔ DEPLOYED endpoint: malformed JSON body is a clean 4xx/200, never a 500 (387.066704ms)
ℹ tests 8
ℹ pass 8
ℹ fail 0
```
One test failed on its first run and was a flaw in the test, not the system: flipping the **last** character of a base64 signature that ends in `==` changes only bits that decode to the same bytes, so it verified. Flipping a middle character, the transmission id or the time is rejected, and the test now does that.

## 6. The Lambda, run locally, then deployed

Locally: the real handler invoked with Function-URL-shaped events (real PayPal and Bedrock, in-memory store).

```
GET /api/health 200 {"ok":true,"store":"memory","payoutCurrency":"GBP","paypalConfigured":true,"webhookConfigured":false,"time":"2026-10-02T02:46:19.123Z"} 0ms
GET /api/state (no cases yet, autoseed off) 200 cases: 0 evidence breach: 4821/21456 22.5%
POST /api/cases 201 c9d278863 ticking day 0 deadline 2026-10-30
CORS header present: *
POST claim 200 review payable 124 11034ms
POST confirm 200 submitted
POST advance 29 200 breached payout PENDING EU54TK45EFHK8
POST refresh -> SUCCESS {"currency":"GBP","value":"2.48"}
GET /api/nope 404 {"error":"no such route","path":"/api/nope"}
POST invalid case 400 {"error":"name is required; Enter the email address of your PayPal account.; cancelledBy must be hospital_nonclinical, clinical or patient; timing must be day_of_surgery, on_admission or before_day; setting must be daycase or inpatient"}
OPTIONS 204
sweep {"checked":1,"fired":0,"refreshed":0}
EventBridge sweep event -> {"checked":1,"fired":0,"refreshed":0}
```
Deployed:

```
date: Fri Oct  2 02:35:32 AM UTC 2026
--- GET https://75dinzuhygjxcbvdkqwcjjgjsu0quuyd.lambda-url.us-east-1.on.aws/api/health
HTTP 200  0.889035s  136 bytes  content-type=application/json
{"ok":true,"store":"dynamodb","payoutCurrency":"GBP","paypalConfigured":true,"webhookConfigured":true,"time":"2026-10-02T02:35:33.427Z"}
--- GET https://drw0b3axbb84o.cloudfront.net/api/health
HTTP 200  0.905057s  136 bytes  content-type=application/json
{"ok":true,"store":"dynamodb","payoutCurrency":"GBP","paypalConfigured":true,"webhookConfigured":true,"time":"2026-10-02T02:35:34.369Z"}
--- GET https://drw0b3axbb84o.cloudfront.net/
HTTP 200  0.873110s  1166 bytes  content-type=text/html; charset=utf-8
<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Cancelled-Op: the 28-day promise</title>
<meta name="description" content="An independent agent that tracks the 28
--- GET https://75dinzuhygjxcbvdkqwcjjgjsu0quuyd.lambda-url.us-east-1.on.aws/api/state
HTTP 200  1.415331s  39201 bytes  content-type=application/json
{"evidence":{"asOf":"2026-10-02","cancellations":{"q":"Q1 2026-27","count":22029,"pctOfAdmissions":"0.9893%","admissions":2226660,"previousQuarter":23056},"breach":{"q":"Q3 2025/26","notTreated":4821,"cancelled":21456,"pct":"22.5%","source":"NHS England commen
--- CloudFront serves the SPA assets
HTTP/2 200 
content-type: text/html; charset=utf-8
x-cache: RefreshHit from cloudfront
--- GET https://drw0b3axbb84o.cloudfront.net/api/trust
example True running 3 dueSoon 1 absorbed 3208 - 3725
```
## 7. Deployed API journey: unhappy paths end to end

Invalid email refused, a PayPal address with no account, `UNCLAIMED` surfaced, four replay attempts that cannot create a second payout, correction cancelling the unclaimed item and re-paying once, and the exemplar's real lost-write recovery.

```
1. invalid email -> 400 {"error":"Enter the email address of your PayPal account."}
2. created 201 c1b8f0000 state ticking
3. claim -> 200 review 135
4. filed -> 200 submitted payable 135
5. day 29 -> breached payout {"status":"PENDING","batch":"RNN47P3FH45JL","amount":135,"currency":"GBP"}
6. after 4 replays, payout batch is still RNN47P3FH45JL | payout events: 1
7. PayPal says: UNCLAIMED | The recipient for this payout does not have an account. A link to sign up for an account was sent to the recipient. Howe
   event: UNCLAIMED: no***@gmail.com has no confirmed PayPal account yet. PayPal holds the money for 30 days, then returns it to the sender. The patient can open an account with that address or give a different one.
   (PayPal: batch still processing, retrying) PayPal can only cancel an unclaimed payout once its batch has finished processin
8. corrected email -> 200 PENDING 68998FK2S3N4G
9. final -> SUCCESS GBP 135 batch 68998FK2S3N4G

TIMELINE
 - Claim assistant finished reading. Claimed GBP 135.00; payable on a breach GBP 135.00. Waiting for the patient to confirm.
 - CLAIM FILED by the patient: GBP 135.00 payable if the promise is broken.
 - PROMISE BROKEN. 2026-10-30 passed with no binding date inside the window (day 29). The pledge has no legal force and no automatic penalty, so this agent repays the patient.
 - Payout of GBP 135.00 sent through PayPal Payouts to no***@gmail.com. Batch RNN47P3FH45JL.
 - UNCLAIMED: no***@gmail.com has no confirmed PayPal account yet. PayPal holds the money for 30 days, then returns it to the sender. The patient can open an account with that address or give a different one.
 - Patient corrected the PayPal email to sb***@personal.example.com; the unclaimed payout was cancelled and payout will be re-sent once.
 - Payout of GBP 135.00 sent through PayPal Payouts to sb***@personal.example.com. Batch 68998FK2S3N4G.
 - UNCLAIMED: sb***@personal.example.com has no confirmed PayPal account yet. PayPal holds the money for 30 days, then returns it to the sender. The patient can open an account with that address or give a different one.
 - PayPal payout status: PENDING.
 - PayPal confirms the money has reached sb***@personal.example.com.

10. exemplar events mentioning an adopted batch:
 - PayPal already held a payout for this case (batch SRMTEY6A2VEVA); it was adopted instead of paying again.
```
## 8. Browser journeys on the deployed site (Playwright, Chromium, 360px phone)

Journey 1: report with validation, saved case, reload, claim with the real agent, file with a two-step confirmation, day 29, automatic payout, PayPal settles.

```
PASS  empty form shows field-level errors   Enter your name so the repayment can be matched to you.
PASS  case created and clock started at day 0
PASS  private link is in the URL  https://drw0b3axbb84o.cloudfront.net/#/case/c10dcf4a1/track
PASS  after reload the case is still there
PASS  saved on this device: listed under Your cases
PASS  claim reaches review with priced lines  Total paid if the promise is broken £262.00 of £262.00 claimed
PASS  filing is unmistakably confirmed
PASS  breach fires a payout receipt  £262.00 to sb***@personal.example.com
PASS  PayPal settles the payout to SUCCESS  Paid. PayPal confirms the money reached the patient.
PASS  paid case offers no delete
PASS  no console errors

SUMMARY 11 pass, 0 fail
```
Journey 2 (1280px): provisional and binding dates, re-cancellation restarting the clock, plain-English explanation, patient decline, theme toggle, the trust dashboard recording a binding date, hospital filter, two-step delete, restore.

```
PASS  copy link responds
PASS  provisional date does not stop the clock  DAY 0 OF 28
PASS  binding date inside 28 days: promise kept
PASS  re-cancellation restarts the clock (cycle 2, day 0 again)  DAY 0 OF 28
PASS  explanation is plain English first, rule R7 behind it  The operation (hernia repair) was cancelled by the hospital on 2 October 2026, on the day of surgery, for a non-clinical reason, so the 28-d
PASS  patient declining an in-window date stops the clock
PASS  theme toggle works
PASS  trust records a binding date: "break within 7 days" count drops  1 -> 0
PASS  hospital filter narrows the dashboard
PASS  delete asks for confirmation first
PASS  keeping the case cancels the delete
PASS  delete removes the case
PASS  restore examples works and the app still loads
PASS  no page errors
ALL PASS
```
## 9. Responsive, accessibility and contrast

Widths 360, 768, 1280 and 1920 in light; 360 and 1280 in dark; 360 at 2x text; all 10 views each. (An earlier round also covered 320px.)

```
light 360px home: scrollWidth 360 / 360 ok
light 360px report: scrollWidth 360 / 360 ok
light 360px track: scrollWidth 360 / 360 ok
```

`grep -c HORIZONTAL` over all 70 captures: **0**.

Floors measured in the running UI, plus a click on every enabled button that does not file, pay or delete:

```
PASS  phone 360: smallest rendered text 14px (floor 13.3px = 10pt)
PASS  phone 360: smallest control 298x40px "Graham Blythe
Outside th" (floor 28x28pt = 37px)
PASS  phone 360: every focused control has a visible focus ring
PASS  phone 360: no page errors
PASS  desktop 1280: smallest rendered text 14px (floor 13.3px = 10pt)
PASS  desktop 1280: smallest control 298x40px "Graham Blythe
Outside th" (floor 28x28pt = 37px)
PASS  desktop 1280: every focused control has a visible focus ring
PASS  desktop 1280: no page errors

all checks passed
```
Contrast, from the real colour values (`scripts/contrast.mjs`):

```

LIGHT
PASS  15.45:1  (need 4.5)  Body text on page  #241326 on #f4f0e8
PASS  17.28:1  (need 4.5)  Body text on card  #241326 on #fffdf9
PASS   7.63:1  (need 4.5)  Muted text on page  #594460 on #f4f0e8
PASS   8.54:1  (need 4.5)  Muted text on card  #594460 on #fffdf9
PASS   6.93:1  (need 4.5)  Muted text on soft panel  #594460 on #ece5d8
PASS  11.51:1  (need 4.5)  Heading/link accent on page  #4a1d57 on #f4f0e8
PASS  12.88:1  (need 4.5)  Heading/link accent on card  #4a1d57 on #fffdf9
PASS  13.09:1  (need 4.5)  Primary button label on button  #ffffff on #4a1d57
PASS   8.52:1  (need 4.5)  Burgundy text on card  #8f1d44 on #fffdf9
PASS   7.61:1  (need 4.5)  Burgundy text on page  #8f1d44 on #f4f0e8
PASS   8.38:1  (need 4.5)  Amber text on card  #6e4300 on #fffdf9
PASS   7.26:1  (need 4.5)  Amber text on warning fill  #6e4300 on #fbecc4
PASS   7.30:1  (need 4.5)  Green text on card  #2a6039 on #fffdf9
PASS   6.16:1  (need 4.5)  Green text on success fill  #2a6039 on #dfeedf
PASS   6.97:1  (need 4.5)  Burgundy text on error fill  #8f1d44 on #f8e1e8
PASS  14.02:1  (need 4.5)  Body text on info fill  #241326 on #ece5d8
PASS  15.53:1  (need 4.5)  Clock (running): white on plum  #ffffff on #3a1245
PASS  10.61:1  (need 4.5)  Clock (running): cell digits  #ffffff on #5b2a69
PASS   8.13:1  (need 4.5)  Clock (running): crossed-out digits  #d9c3e1 on #46204f
PASS   8.83:1  (need 4.5)  Clock (running): today cell  #2a1a00 on #f2b01e
PASS   8.83:1  (need 4.5)  Clock (warning): dark on amber  #2a1a00 on #f2b01e
PASS  11.72:1  (need 4.5)  Clock (warning): digits on cell  #2a1a00 on #fbd27a
PASS   6.00:1  (need 4.5)  Clock (warning): crossed digits  #3a2500 on #dc9a12
PASS  15.53:1  (need 4.5)  Clock (warning): today white on plum  #ffffff on #3a1245
PASS  10.14:1  (need 4.5)  Clock (broken): white on burgundy  #ffffff on #7b1c3b
PASS   6.45:1  (need 4.5)  Clock (broken): cell digits  #ffffff on #a03a5d
PASS   6.29:1  (need 4.5)  Clock (broken): crossed digits  #fbdbe5 on #8d2c4d
PASS   8.28:1  (need 4.5)  Clock (kept): white on green  #ffffff on #25583a
PASS   5.46:1  (need 4.5)  Clock (kept): cell digits  #ffffff on #3b7550
PASS   8.80:1  (need 4.5)  Side clock: white on off-grey  #ffffff on #55455a
PASS   4.86:1  (need 3)  Form field border vs card (UI component, 3:1)  #7d6a82 on #fffdf9
PASS   5.14:1  (need 3)  Focus ring (#1a5fd0 light / #8fb8ff dark) vs page, 3:1  #1a5fd0 on #f4f0e8

DARK
PASS  16.64:1  (need 4.5)  Body text on page  #f4ecf6 on #160a1a
PASS  15.23:1  (need 4.5)  Body text on card  #f4ecf6 on #241229
PASS  10.88:1  (need 4.5)  Muted text on page  #cfbdd4 on #160a1a
PASS   9.96:1  (need 4.5)  Muted text on card  #cfbdd4 on #241229
PASS   8.94:1  (need 4.5)  Muted text on soft panel  #cfbdd4 on #301a37
PASS  12.02:1  (need 4.5)  Heading/link accent on page  #e6bff5 on #160a1a
PASS  11.01:1  (need 4.5)  Heading/link accent on card  #e6bff5 on #241229
PASS  11.05:1  (need 4.5)  Primary button label on button  #25102c on #e6bff5
PASS   9.40:1  (need 4.5)  Burgundy text on card  #ffa3bc on #241229
PASS  10.27:1  (need 4.5)  Burgundy text on page  #ffa3bc on #160a1a
PASS  10.84:1  (need 4.5)  Amber text on card  #f6c453 on #241229
PASS   7.17:1  (need 4.5)  Amber text on warning fill  #f6c453 on #4a3508
PASS  10.67:1  (need 4.5)  Green text on card  #9ad8a5 on #241229
PASS   7.64:1  (need 4.5)  Green text on success fill  #9ad8a5 on #173a24
PASS   7.95:1  (need 4.5)  Burgundy text on error fill  #ffa3bc on #45172b
PASS  13.68:1  (need 4.5)  Body text on info fill  #f4ecf6 on #301a37
PASS  17.34:1  (need 4.5)  Clock (running): white on plum  #ffffff on #2a0e34
PASS  10.61:1  (need 4.5)  Clock (running): cell digits  #ffffff on #5b2a69
PASS   8.13:1  (need 4.5)  Clock (running): crossed-out digits  #d9c3e1 on #46204f
PASS   8.83:1  (need 4.5)  Clock (running): today cell  #2a1a00 on #f2b01e
PASS   8.83:1  (need 4.5)  Clock (warning): dark on amber  #2a1a00 on #f2b01e
PASS  11.72:1  (need 4.5)  Clock (warning): digits on cell  #2a1a00 on #fbd27a
PASS   6.00:1  (need 4.5)  Clock (warning): crossed digits  #3a2500 on #dc9a12
PASS  15.53:1  (need 4.5)  Clock (warning): today white on plum  #ffffff on #3a1245
PASS  10.14:1  (need 4.5)  Clock (broken): white on burgundy  #ffffff on #7b1c3b
PASS   6.45:1  (need 4.5)  Clock (broken): cell digits  #ffffff on #a03a5d
PASS   6.29:1  (need 4.5)  Clock (broken): crossed digits  #fbdbe5 on #8d2c4d
PASS   8.28:1  (need 4.5)  Clock (kept): white on green  #ffffff on #25583a
PASS   5.46:1  (need 4.5)  Clock (kept): cell digits  #ffffff on #3b7550
PASS   8.80:1  (need 4.5)  Side clock: white on off-grey  #ffffff on #55455a
PASS   5.32:1  (need 3)  Form field border vs card (UI component, 3:1)  #9c86a3 on #241229
PASS   9.58:1  (need 3)  Focus ring (#1a5fd0 light / #8fb8ff dark) vs page, 3:1  #8fb8ff on #160a1a

0 failing pair(s)
```
## 10. Failures and gaps, stated plainly

Found by testing and fixed (each has a regression test or a rerun above):

1. **Stale webhook overwrote a live payout.** After an unclaimed payout was cancelled and re-sent, a late `UNCLAIMED` event for the old batch was applied to the new one (seen in `live-journey.txt` before the fix). Fixed: events match on exact batch id; superseded batches are ignored. Unit test added.
2. **Lambda 500 on every request.** Lambda passes a callback as the third handler argument, which test-injection code mistook for dependencies. Fixed.
3. **Function URL returned 403** until the newer `InvokeFunction` permission was added; the installed AWS CLI (2.27.1) lacks the flag, so `deploy.sh` uses the SDK for that one call.
4. **Dead button.** The banner's "Review the claim" did nothing on the claim page. Caught by the click sweep; hidden there now.
5. **Layout overflow** at 2x text and narrow widths (top-bar button, case chips, amounts row, long headings, calendar digits, a table). Fixed; the sweep above is the re-run.
6. **Mobile menu leaked onto desktop** (class specificity). Fixed.
7. **Local dev server dropped query strings**, so scoped state looked broken in the browser test. A harness bug; the Lambda was unaffected. Fixed.
8. **Agent behaviour:** it once asked a question before recording anything, once wrote "we", once opened with a sympathy line. The prompt now orders record-first, and forbids "we" and sympathy openers; the later runs show neither.
9. **Test errors, not product errors:** one test asserted the old throw-on-duplicate behaviour; two browser-test waits matched an example chip instead of the banner; one date was outside a frozen demo clock's window (and the product correctly refused it).

Not done, or not provable here:

- **Real chases to a hospital.** Recorded only. The interface says so.
- **Live PayPal (non-sandbox).** Payouts needs approval and a funded business account; nothing here touches live money.
- **Trust authentication.** None. Example data only.
- **`PAYMENT.PAYOUTS-ITEM.SUCCEEDED` webhooks for this project's own payouts** were not observed in the log in the window tested (the log held `UNCLAIMED`, `RETURNED` and batch `SUCCESS` events). Status is also settled by polling and the hourly sweep, so the product does not depend on that event arriving.
- **A screen reader pass** was not performed; accessibility is measured against numeric floors and keyboard behaviour only.
- **Legacy browsers** were not tested; Chromium only.
- **Shared sandbox side effect:** this project's payouts generate webhook events delivered to the other four webhooks subscribed on the same PayPal app, whose endpoints are not mine.
- **Test cases** created by the browser journeys remain in DynamoDB. They are hidden from listings (only reachable by their private id) and cost nothing.
