import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { fmtDate, fmtShort, gbp, gbp0, look, plural, mine, owed, plainReason } from './lib.js';
import { Field, Icon, Ill, Notice, Spinner, Confirm } from './ui.jsx';

/* ------------------------------------------------------------------ Overview */
export function Overview({ cur, open, hasMine }) {
  const e = cur.eval, o = owed(cur);
  const hot = e.state === 'ticking' && e.daysLeft <= 7;
  const claimLine = !o ? 'Not covered by the promise.' : o.amount === null ? 'Describe the costs once. They are itemised and paid back.' : `${gbp(o.amount)} ${o.label}.`;
  const cards = [
    { v: 'track', ill: 'track', t: 'Watch the 28 days', d: 'Every chase sent to the hospital and what happens on day 29.', cls: hot ? 'hot' : e.state === 'kept' ? 'good' : '' },
    { v: 'claim', ill: 'claim', t: 'Claim your costs', d: claimLine },
    { v: 'offers', ill: 'offer', t: 'Rebooking dates', d: cur.offers.length ? `${plural(cur.offers.length, 'date', 'dates')} on file. A binding date inside 28 days, including day 28, keeps the promise.` : 'Record the date the hospital offers. A binding date inside 28 days, including day 28, keeps the promise.' },
    { v: 'why', ill: 'why', t: 'Why this was decided', d: 'The decision in plain words, with the rules behind it.' },
    { v: 'report', ill: 'report', t: 'Report a cancellation', d: 'Cancelled on the day for a reason that was not your health? Start a clock.' },
    { v: 'trust', ill: 'trust', t: 'For the hospital trust', d: 'Which clocks are about to break, and what each cancellation costs the trust.' },
  ];
  return (
    <>
      {!hasMine && (
        <section className="intro">
          <h2>Cancelled on the day of your operation?</h2>
          <p>This service keeps the 28-day count, chases the hospital, and repays your costs through PayPal if no new date is given in time.</p>
        </section>
      )}
      <div className="cards">
        {e.state === 'breached' && (
          <button className="card alarm" onClick={() => open('claim')}>
            <h3>{cur.payout ? `${gbp(cur.payout.amount)} was paid to ${cur.patient.name}.` : `${cur.patient.name} was owed a date by ${fmtDate(e.deadline)}. None came.`}</h3>
            <p>{cur.payout ? 'The promise was broken, and the costs were repaid through PayPal.' : cur.claim?.status === 'submitted' ? 'The claim is filed and the payout is being sent.' : 'Describe the costs and the agent repays them.'}</p>
            <span className="go" aria-hidden="true"><Icon n="arrow" /></span>
          </button>
        )}
        {cards.map((k) => (
          <button key={k.v} className={'card ' + (k.cls || '')} onClick={() => open(k.v)}>
            <h3>{k.t}</h3><p>{k.d}</p><Ill kind={k.ill} />
            <span className="go" aria-hidden="true"><Icon n="arrow" /></span>
          </button>
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ Report */
export function Report({ onCreated, run, error }) {
  const [f, setF] = useState({ name: '', email: '', hospital: '', procedure: '', setting: 'daycase', cancelledBy: 'hospital_nonclinical', timing: 'day_of_surgery', reasonText: '' });
  const [errs, setErrs] = useState({});
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setErrs({ ...errs, [k]: undefined }); };
  const submit = (e) => {
    e.preventDefault();
    const x = {};
    if (!f.name.trim()) x.name = 'Enter your name so the repayment can be matched to you.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) x.email = 'Enter the email address of your PayPal account, for example name@example.com.';
    if (!f.hospital.trim()) x.hospital = 'Enter the hospital that cancelled the operation.';
    if (!f.procedure.trim()) x.procedure = 'Enter the operation, for example cataract surgery.';
    setErrs(x);
    if (Object.keys(x).length) { document.getElementById('f-' + Object.keys(x)[0])?.focus(); return; }
    run(async () => onCreated(await api.create({ ...f, name: f.name.trim(), email: f.email.trim() })));
  };
  const covered = f.cancelledBy === 'hospital_nonclinical' && f.timing !== 'before_day';
  return (
    <div className="panel">
      <h2>Report a cancellation</h2>
      <p className="lead">The clock starts today, London time. The promise covers operations the hospital cancelled for a non-clinical reason on or after the day of admission.</p>
      <form onSubmit={submit} noValidate className="form two">
        <Field id="f-name" label="Your name" error={errs.name}><input id="f-name" autoComplete="name" value={f.name} onChange={set('name')} aria-invalid={!!errs.name} aria-describedby={errs.name ? 'f-name-e' : undefined} /></Field>
        <Field id="f-email" label="PayPal email address" hint="The repayment goes here." error={errs.email}><input id="f-email" type="email" autoComplete="email" inputMode="email" value={f.email} onChange={set('email')} aria-invalid={!!errs.email} aria-describedby={'f-email-h' + (errs.email ? ' f-email-e' : '')} /></Field>
        <Field id="f-hospital" label="Hospital" error={errs.hospital}><input id="f-hospital" value={f.hospital} onChange={set('hospital')} aria-invalid={!!errs.hospital} aria-describedby={errs.hospital ? 'f-hospital-e' : undefined} /></Field>
        <Field id="f-procedure" label="Operation" error={errs.procedure}><input id="f-procedure" value={f.procedure} onChange={set('procedure')} aria-invalid={!!errs.procedure} aria-describedby={errs.procedure ? 'f-procedure-e' : undefined} /></Field>
        <Field id="f-setting" label="Type of stay"><select id="f-setting" value={f.setting} onChange={set('setting')}><option value="daycase">Day case (home the same day)</option><option value="inpatient">Inpatient (staying overnight)</option></select></Field>
        <Field id="f-timing" label="When were you told?"><select id="f-timing" value={f.timing} onChange={set('timing')}><option value="day_of_surgery">On the day of the operation</option><option value="on_admission">After I was admitted</option><option value="before_day">Before the day of admission</option></select></Field>
        <Field id="f-by" label="Who cancelled, and why?"><select id="f-by" value={f.cancelledBy} onChange={set('cancelledBy')}><option value="hospital_nonclinical">The hospital, not for a health reason (no bed, list over-ran, surgeon away)</option><option value="clinical">The hospital, for a clinical reason (I was unwell)</option><option value="patient">I cancelled or postponed it</option></select></Field>
        <Field id="f-reason" label="What you were told" hint="Optional."><input id="f-reason" value={f.reasonText} onChange={set('reasonText')} /></Field>
        <div className="full">
          <Notice tone={covered ? 'ok' : 'info'} title={covered ? 'This is covered by the promise.' : 'This is outside the promise.'}>
            {covered ? ' A new binding date is owed within 28 days.' : ' The cancellation is saved, but no clock runs and no repayment applies. The reason is shown on the next screen.'}
          </Notice>
          {error && <Notice tone="err" title="The cancellation was not saved.">{' ' + error}</Notice>}
          <div className="row"><button className="btn primary" type="submit">Start my 28-day clock</button></div>
        </div>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ Track */
const TYPE_LABEL = { cancelled: 'Cancelled', chase: 'Chased', offer: 'Date offered', declined: 'Patient decision', recancel: 'Cancelled again', restart: 'Clock restarted', kept: 'Promise kept', stopped: 'Clock stopped', breach: 'Promise broken', claim: 'Claim', payout: 'Payout', email: 'Email corrected', sim: 'Demo' };
/** Consecutive chases collapse to one line: the patient needs "chased", not six near-identical rows. */
function groupEvents(events) {
  const out = [];
  for (const ev of events) {
    const prev = out.at(-1);
    if (ev.type === 'chase' && prev?.type === 'chase') { prev.days.push(ev.day); prev.last = ev; continue; }
    out.push(ev.type === 'chase' ? { ...ev, days: [ev.day] } : ev);
  }
  return out;
}
export function Track({ c, run, onChange, isMine, afterDelete, justCreated }) {
  const e = c.eval;
  const go = (d) => run(async () => onChange(await api.advance(c.id, d)));
  const to28 = 28 - (e.day ?? 0), to29 = 29 - (e.day ?? 0);
  const link = typeof window !== 'undefined' ? `${location.origin}${location.pathname}#/case/${c.id}/track` : '';
  const [copied, setCopied] = useState(false);
  const events = groupEvents(c.events.filter((x) => x.type !== 'sim'));
  return (
    <div className="panel">
      {justCreated && isMine && (
        <Notice tone="ok" title="The clock is running.">
          {' '}This case is saved on this device and at the private link below. Keep the link to come back from any device.
          <div className="linkrow"><code>{link}</code><button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); } }}><Icon n="copy" /> {copied ? 'Link copied' : 'Copy the link'}</button></div>
        </Notice>
      )}
      <PayoutReceipt c={c} run={run} onChange={onChange} />
      <h2>What has happened</h2>
      <ol className="tl">
        {events.map((ev, i) => (
          <li key={i} className={'t-' + ev.type}>
            <div className="t-label">{ev.type === 'chase' ? `Chased the hospital on ${ev.days.length === 1 ? 'day ' + ev.days[0] : 'days ' + ev.days.slice(0, -1).join(', ') + ' and ' + ev.days.at(-1)}` : TYPE_LABEL[ev.type] || ev.type}</div>
            {ev.type !== 'chase' && <div>{ev.text}</div>}
            <div className="meta">{ev.type === 'chase' ? 'The chase is recorded here; no live channel to a hospital is connected. ' : ''}{ev.day != null ? `Day ${ev.day} · ` : ''}{new Date(ev.at).toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
          </li>
        ))}
      </ol>
      {e.state === 'ticking' && (
        <details className="demo">
          <summary>Demo controls: move this case's clock</summary>
          <p>The real clock takes 28 days. These buttons move only this case's clock so the day-29 breach and payout can be watched. Each move is recorded as a demo step.</p>
          <div className="row">
            <button className="btn" onClick={() => go(7)}>Move forward 7 days</button>
            {to28 > 0 && <button className="btn" onClick={() => go(to28)}>Move to day 28, the last day</button>}
            <button className="btn primary" onClick={() => go(to29)}>Let day 28 pass</button>
          </div>
          {c.claim?.status !== 'submitted' && <p className="fine">A payout needs a filed claim. File one under Claim your costs first.</p>}
        </details>
      )}
      {isMine && !c.payout && (
        <details className="demo">
          <summary>Remove this case</summary>
          <p>Deletes the case, the claim and the timeline from the service and from this device. A case with a payout cannot be deleted.</p>
          <Confirm label="Delete this case" confirmLabel="Yes, delete this case" onConfirm={() => run(async () => { await api.remove(c.id); mine.remove(c.id); afterDelete(c.id); })} />
        </details>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Decision */
const OUT = { pass: ['Met', 'ok'], fail: ['Not met', 'bad'], fired: ['Applies', 'hot'], info: ['Note', 'info'] };
export function Why({ c }) {
  const e = c.eval;
  const audit = c.events.filter((x) => x.trace);
  return (
    <div className="panel">
      <h2>Why this was decided</h2>
      <p className="why-plain">{plainReason(c)}</p>
      <details className="more">
        <summary>The rules behind it</summary>
        <p className="fine">Checked on {fmtDate(e.today)}.</p>
        <ol className="rules">
          {e.trace.map((t, i) => {
            const [word, tone] = OUT[t.outcome] || OUT.info;
            return (
              <li key={i} className={'rule-row ' + tone}>
                <span className="rid">{t.rule}</span>
                <div><b>{t.title}</b> <span className={'pill ' + tone}>{tone === 'ok' && <Icon n="check" />}{tone === 'bad' && <Icon n="cross" />}{word}</span><p>{t.why}</p></div>
              </li>
            );
          })}
        </ol>
        <h3>All ten rules</h3>
        <ul className="plain">
          <li><b>R1</b> The hospital cancelled it. A patient cancelling or postponing is not covered.</li>
          <li><b>R2</b> Cancelled on or after the day of admission, including the day of surgery.</li>
          <li><b>R3</b> The reason was not clinical.</li>
          <li><b>R4</b> Day 0 is the London date of the cancellation. Day 28 is the last valid day.</li>
          <li><b>R5</b> A binding date within day 1 to day 28, offered by day 28, keeps the promise.</li>
          <li><b>R6</b> A patient who declines or postpones an in-window date stops the clock. That is not a breach.</li>
          <li><b>R7</b> If the hospital cancels the rebooked operation on or after the day of admission for a non-clinical reason, a new 28-day clock starts. Cancelled in advance, the offer is void and the old clock keeps running. Cancelled for a clinical reason, the offer stands.</li>
          <li><b>R8</b> From 00:00 London time on day 29 with nothing in place, the promise is broken.</li>
          <li><b>R9</b> A provisional date never keeps the promise.</li>
          <li><b>R10</b> A date after day 28, or an offer made after day 28, never keeps the promise.</li>
        </ul>
      </details>
      {audit.length > 0 && (
        <details className="more">
          <summary>Audit trail ({audit.length})</summary>
          <ul className="audit">{audit.map((a, i) => <li key={i}><span className="rule">{a.rule}</span> {a.text}<div className="meta">Day {a.day ?? 0} · {new Date(a.at).toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div></li>)}</ul>
        </details>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Payout receipt */
export function PayoutReceipt({ c, run, onChange }) {
  const p = c.payout;
  const [email, setEmail] = useState('');
  useEffect(() => {
    if (!p || !['PENDING', 'SUBMITTING'].includes(p.status) || !p.batchId) return undefined;
    let n = 0; const t = setInterval(async () => { if (++n > 12) { clearInterval(t); return; } try { onChange(await api.refresh(c.id)); } catch { /* next tick */ } }, 5000);
    return () => clearInterval(t);
  }, [p?.status, p?.batchId, c.id]);
  if (!p) return null;
  const paid = p.status === 'SUCCESS';
  const needsFix = ['REJECTED', 'RETRY', 'UNCLAIMED'].includes(p.status);
  const label = { SUCCESS: 'Paid. PayPal confirms the money reached the patient.', PENDING: 'Sent to PayPal, which is settling it.', SUBMITTING: 'Sending to PayPal.', UNCLAIMED: 'Unclaimed. That email address has no confirmed PayPal account.', REJECTED: 'PayPal rejected the payout.', RETRY: 'PayPal has not accepted the payout yet. The agent will try again.', FAILED: 'The payout failed.', HELD_BREAKER: 'The payout is held by a safety limit on sandbox payouts.', RETURNED: 'The payout was returned unclaimed.', ONHOLD: 'PayPal has put the payout on hold.', BLOCKED: 'PayPal blocked the payout.' }[p.status] || p.status;
  return (
    <section className={'receipt ' + (paid ? 'paid' : needsFix || p.status === 'FAILED' ? 'bad' : '')} aria-labelledby="rc-h">
      <p className="rc-kicker" id="rc-h">Payout receipt</p>
      <p className="rc-amt">{gbp(p.amount)} <span>to {c.patient.email}</span></p>
      <p className="rc-status"><Icon n={paid ? 'check' : needsFix || p.status === 'FAILED' ? 'info' : 'clock'} /> {label}</p>
      {p.error && <p className="fine">{p.error}</p>}
      {p.batchId && <details className="tech"><summary>PayPal details</summary><dl className="kv"><dt>Batch</dt><dd className="mono">{p.batchId}</dd>{p.itemStatus && (<><dt>Status</dt><dd className="mono">{p.itemStatus}{p.fee ? ` · fee ${p.fee.currency} ${p.fee.value}` : ''}</dd></>)}<dt>Currency</dt><dd>Paid in pounds sterling (GBP).</dd></dl></details>}
      {p.settle?.scaled && <p className="fine"><b>Settlement is in {p.settle.currency}.</b> PayPal moved a small amount in {p.settle.currency}; the sterling figure above is the real amount this would pay.</p>}
      {p.status === 'UNCLAIMED' && <p className="fine">PayPal holds an unclaimed payout for 30 days and then returns it. Opening a PayPal account with that email address claims it. Or give a different address and the unclaimed payout is cancelled and sent again once.</p>}
      {needsFix && (
        <form className="row" onSubmit={(e) => { e.preventDefault(); run(async () => { onChange(await api.email(c.id, email)); setEmail(''); }); }}>
          <label className="sr" htmlFor="fix-email">Corrected PayPal email address</label>
          <input id="fix-email" type="email" required placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn primary" disabled={!email}>{p.status === 'UNCLAIMED' ? 'Cancel and send to this address' : 'Send the payout to this address'}</button>
        </form>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ Claim */
const EXAMPLE = 'My operation was cancelled at 11am after I had fasted since midnight. I drove 52 miles each way, so 104 miles in total. Parking cost 11 pounds and I have the ticket. I took the day unpaid, 8 hours at 16.50 pounds an hour, and my payslip will show it. I paid a childminder 45 pounds for the day and I have her receipt.';
const STATUS = { payable: ['Will be paid', 'ok'], capped: ['Paid up to the limit', 'ok'], held: ['Held: needs a document', 'hot'], challenged: ['Held: waiting for your answer', 'hot'], review: ['Held for a person to check', 'bad'] };

function Transcript({ claim }) {
  return (
    <div className="chat" aria-label="Conversation with the claim assistant">
      {claim.transcript.slice(claim.transcript[0]?.from === 'patient' ? 1 : 0).map((t, i) => (<div key={i} className={'bubble ' + t.from}><span className="who">{t.from === 'patient' ? 'You' : 'Claim assistant'}</span><p>{t.text}</p></div>))}
    </div>
  );
}

export function Claim({ c, run, onChange, busy, policy }) {
  const cl = c.claim;
  const [text, setText] = useState('');
  const [reply, setReply] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { setText(''); setReply(''); setErr(''); }, [c.id]);
  const closed = !!c.payout || c.eval.state === 'ineligible';
  const start = (e) => { e.preventDefault(); if (text.trim().length < 20) { setErr('Write at least a sentence, for example "I drove 40 miles each way and paid 8 pounds for parking".'); document.getElementById('acct')?.focus(); return; } setErr(''); run(async () => onChange(await api.claim(c.id, text))); };
  const send = (e) => { e.preventDefault(); if (!reply.trim()) { setErr('Write your answer first, then send it.'); return; } setErr(''); run(async () => { onChange(await api.reply(c.id, reply)); setReply(''); }); };
  const pr = cl?.priced;
  return (
    <div className="panel">
      <h2>Claim your costs</h2>
      {c.eval.state === 'ineligible' && <Notice title="No claim is possible.">{' ' + c.eval.reasons[0]}</Notice>}
      {!cl && !closed && (
        <>
          <p className="lead">Describe what the cancellation cost in your own words: travel, lost pay, childcare, parking. A claim assistant reads it, asks about anything unclear, and questions amounts that look wrong. Fixed rules, not the assistant, set what is paid.</p>
          <form onSubmit={start} noValidate>
            <Field id="acct" label="What did the cancelled operation cost you?" error={err}>
              <textarea id="acct" value={text} onChange={(e) => { setText(e.target.value); setErr(''); }} aria-invalid={!!err} aria-describedby={err ? 'acct-e' : undefined} placeholder="For example: I drove 40 miles each way, parking cost 8 pounds, and I lost 8 hours of pay at 14 pounds an hour." />
            </Field>
            <div className="row">
              <button className="btn primary" disabled={busy}>Add up my costs</button>
              <button type="button" className="btn" onClick={() => setText(EXAMPLE)} disabled={busy}>Use an example account</button>
            </div>
          </form>
          {busy && <Spinner label="Reading your account. This takes up to 30 seconds." />}
        </>
      )}
      {cl && <Transcript claim={cl} />}
      {busy && cl && <Spinner label="Reading your answer. This takes up to 30 seconds." />}
      {cl?.status === 'needs_input' && !closed && !busy && (
        <form onSubmit={send} noValidate>
          <Field id="reply" label="Your answer" error={err}><textarea id="reply" rows={3} value={reply} onChange={(e) => { setReply(e.target.value); setErr(''); }} aria-invalid={!!err} aria-describedby={err ? 'reply-e' : undefined} /></Field>
          <div className="row"><button className="btn primary">Send my answer</button><button type="button" className="btn" onClick={() => run(async () => onChange(await api.skip(c.id)))}>Skip this and review what is priced</button></div>
        </form>
      )}
      {pr && pr.lines.length > 0 && (
        <>
          <h3>How the costs were priced</h3>
          <ul className="lines">
            {pr.lines.map((l, i) => {
              const [w, tn] = STATUS[l.status] || [l.status, 'info'];
              return (
                <li key={i} className={'line ' + tn}>
                  <div className="line-top"><span className="cat">{l.category}</span><span className={'pill ' + tn}>{tn === 'ok' && <Icon n="check" />}{w}</span></div>
                  <p className="sub">{l.description}</p>
                  <p>{l.basis}</p>
                  <dl className="amts"><div><dt>Claimed</dt><dd>{l.claimed != null ? gbp(l.claimed) : 'Not stated'}</dd></div><div><dt>Paid on a breach</dt><dd><b>{gbp(l.amount)}</b></dd></div></dl>
                </li>
              );
            })}
          </ul>
          <div className="totalbar"><span>Total paid if the promise is broken{pr.totalCapApplied ? ' (limited to the ceiling)' : ''}</span><b>{gbp(pr.payableTotal)}</b><span className="sm">of {gbp(pr.claimedTotal)} claimed</span></div>
          <p className="fine">Limits are this service's own policy, not NHS figures: at most {gbp0(policy?.totalCap ?? 750)} per payout, mileage at 45p a mile, and a document for every cost except mileage.</p>
          {cl.steps?.length > 0 && (
            <details className="more"><summary>How the claim assistant worked ({cl.steps.length} steps)</summary><ol className="plain">{cl.steps.map((s, i) => <li key={i}><span className="rule">{s.tool}</span> {s.summary}</li>)}</ol></details>
          )}
        </>
      )}
      {cl?.status === 'review' && !closed && !busy && (
        <>
          {pr.lines.some((l) => ['challenged', 'held', 'review'].includes(l.status)) && <Notice tone="info" title="Some costs are held.">{' Answer the assistant below to release them, or file the claim now and only the costs marked "Will be paid" are repaid.'}</Notice>}
          <form onSubmit={send} noValidate>
            <Field id="reply2" label="Add detail or answer a question" hint="Optional." error={err}><textarea id="reply2" rows={3} value={reply} onChange={(e) => { setReply(e.target.value); setErr(''); }} /></Field>
            <div className="row"><button className="btn" disabled={!reply.trim()}>Send this detail</button></div>
          </form>
          <div className="filebox">
            <p><b>Ready to file?</b> Filing is final. After day 28 passes without a binding date, {gbp(pr.payableTotal)} is sent to {c.patient.email}.</p>
            <Confirm label="File my claim" confirmLabel={`Yes, file my claim for ${gbp(pr.payableTotal)}`} tone="primary" disabled={!pr.lines.length} onConfirm={() => run(async () => onChange(await api.confirm(c.id)))} />
          </div>
        </>
      )}
      {cl?.status === 'submitted' && !c.payout && (
        <Notice tone="ok" title="Your claim is filed.">
          {` ${gbp(pr.payableTotal)} will be sent to ${c.patient.email} through PayPal Payouts if day 28 passes without a binding date. ${c.eval.state === 'ticking' ? `That is ${plural(c.eval.daysLeft + 1, 'day', 'days')} from now at the earliest.` : ''} Nothing more is needed from you.`}
        </Notice>
      )}
      <PayoutReceipt c={c} run={run} onChange={onChange} />
    </div>
  );
}

/* ------------------------------------------------------------------ Offers */
export function Offers({ c, run, onChange }) {
  const [date, setDate] = useState(''); const [binding, setBinding] = useState('b'); const [err, setErr] = useState('');
  const [rc, setRc] = useState(null); // offer id being re-cancelled
  const [rcBy, setRcBy] = useState('hospital_nonclinical'); const [rcT, setRcT] = useState('day_of_surgery');
  const add = (e) => { e.preventDefault(); if (!date) { setErr('Choose the date the hospital offered.'); return; } setErr(''); run(async () => { onChange(await api.offer(c.id, { date, binding: binding === 'b' })); setDate(''); }); };
  const act = (oid, a, b) => run(async () => { onChange(await api.offerAction(c.id, oid, a, b)); setRc(null); });
  const closed = !!c.payout || c.eval.state === 'ineligible';
  return (
    <div className="panel">
      <h2>Rebooking dates</h2>
      <p className="lead">Record a date the hospital offered. It keeps the promise only if it is <b>binding</b>, falls between day 1 and day 28 <b>including day 28</b>, and was offered by day 28.</p>
      {c.offers.length === 0 && <Notice title="No dates recorded yet.">{' When the hospital offers a new date, record it here. Until then the clock keeps running.'}</Notice>}
      {c.offers.length > 0 && (
        <div className="tablewrap"><table className="stack">
          <caption className="sr">Dates offered</caption>
          <thead><tr><th scope="col">Date offered</th><th scope="col">Made on</th><th scope="col">Type</th><th scope="col">Status</th><th scope="col"><span className="sr">Actions</span></th></tr></thead>
          <tbody>{c.offers.map((o) => (
            <tr key={o.id}>
              <th scope="row">{fmtDate(o.date)}</th><td data-label="Made on">{fmtShort(o.madeOn)}</td><td data-label="Type">{o.binding ? 'Binding' : 'Provisional'}</td>
              <td data-label="Status">{{ open: 'Open', declined: 'Declined by the patient', postponed_by_patient: 'Postponed by the patient', hospital_cancelled: 'Cancelled again by the hospital', void: 'Void: cancelled in advance' }[o.status] || o.status}</td>
              <td>{o.status === 'open' && !closed && (<span className="row">
                <button className="btn" onClick={() => act(o.id, 'decline')}>I decline this date</button>
                <button className="btn" onClick={() => act(o.id, 'postpone')}>I postpone this date</button>
                <button className="btn" onClick={() => setRc(rc === o.id ? null : o.id)} aria-expanded={rc === o.id}>It was cancelled again</button></span>)}</td>
            </tr>))}</tbody>
        </table></div>
      )}
      {rc && (
        <form className="subform" onSubmit={(e) => { e.preventDefault(); act(rc, 'recancel', { cancelledBy: rcBy, timing: rcT }); }}>
          <h3>What happened to that date?</h3>
          <div className="two form">
            <Field id="rc-by" label="Who cancelled it, and why?"><select id="rc-by" value={rcBy} onChange={(e) => setRcBy(e.target.value)}><option value="hospital_nonclinical">The hospital, not for a health reason</option><option value="clinical">The hospital, for a clinical reason</option><option value="patient">The patient postponed it</option></select></Field>
            <Field id="rc-t" label="When were you told?"><select id="rc-t" value={rcT} onChange={(e) => setRcT(e.target.value)}><option value="day_of_surgery">On the day of the operation</option><option value="on_admission">After admission</option><option value="before_day">Before the day of admission</option></select></Field>
          </div>
          <p className="fine">Cancelled again by the hospital on or after the day of admission, for a non-clinical reason, starts a new 28-day clock from today.</p>
          <div className="row"><button className="btn primary">Record what happened</button><button type="button" className="btn" onClick={() => setRc(null)}>Cancel</button></div>
        </form>
      )}
      {!closed && (
        <form onSubmit={add} noValidate className="form two sep">
          <Field id="od" label={`Date the hospital offered (${fmtShort(c.today)} or later)`} error={err}><input id="od" type="date" min={c.today} value={date} onChange={(e) => { setDate(e.target.value); setErr(''); }} aria-invalid={!!err} aria-describedby={err ? 'od-e' : undefined} /></Field>
          <Field id="ob" label="Type of offer"><select id="ob" value={binding} onChange={(e) => setBinding(e.target.value)}><option value="b">Binding, confirmed in writing</option><option value="p">Provisional, may change</option></select></Field>
          <div className="full row"><button className="btn primary">Record this date</button></div>
        </form>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Trust */
export function Trust({ run, onCaseChange }) {
  const [hospital, setHospital] = useState('');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [dates, setDates] = useState({});
  const load = async (h = hospital) => { try { setErr(''); setData(await api.trust(h)); } catch (e) { setErr(e.message); } };
  useEffect(() => { load(hospital); }, [hospital]);
  if (err && !data) return <div className="panel"><h2>For the hospital trust</h2><Notice tone="err" title="The dashboard did not load.">{' ' + err + ' Reload the page to try again.'}</Notice></div>;
  if (!data) return <div className="panel"><h2>For the hospital trust</h2><Spinner label="Loading the trust dashboard." /></div>;
  const r = data.report, ev = data.evidence;
  const max = Math.max(5, ...r.bands.map((b) => b.count));
  const book = (id) => { const d = dates[id]; if (!d) return; run(async () => { const v = await api.offer(id, { date: d, binding: true }); onCaseChange(v); await load(); }); };
  return (
    <div className="panel">
      <h2>For the hospital trust</h2>
      <p className="lead">What the cancellations in front of this trust cost, and which clocks are about to break. Showing example data: this build has no trust login, so real patients' cases are never listed here.</p>
      <Field id="hosp" label="Hospital"><select id="hosp" value={hospital} onChange={(e) => setHospital(e.target.value)}><option value="">All example hospitals</option>{r.hospitals.map((h) => <option key={h}>{h}</option>)}</select></Field>
      <dl className="kpis">
        <div><dt>Clocks running</dt><dd>{r.counts.running}</dd></div>
        <div className={r.dueSoon.length ? 'hot' : ''}><dt>Break within 7 days</dt><dd>{r.dueSoon.length}</dd></div>
        <div className={r.counts.breached ? 'bad' : ''}><dt>Past the deadline</dt><dd>{r.counts.breached}</dd></div>
        <div><dt>Breach rate in this data</dt><dd>{r.breachRate ? r.breachRate.pct + '%' : 'None yet'}</dd><dd className="sm">{r.breachRate ? `of ${r.breachRate.of} decided cases. ` : ''}National: {r.nationalRate} (NHS England, Q3 2025/26)</dd></div>
      </dl>
      <h3>Clocks by time left</h3>
      <ul className="bars" aria-label="Running clocks by days left">{r.bands.map((b) => (<li key={b.label}><span>{b.label}</span><span className="bar" style={{ '--w': (b.count / max) * 100 + '%' }} /><b>{b.count}</b></li>))}</ul>
      <h3>Needs a binding date now</h3>
      {r.dueSoon.length === 0 ? <Notice tone="ok" title="No clock breaks in the next 7 days.">{' Nothing needs a date this week.'}</Notice> : (
        <div className="tablewrap"><table className="stack">
          <caption className="sr">Cases about to breach</caption>
          <thead><tr><th scope="col">Patient</th><th scope="col">Left</th><th scope="col" className="n">Repayment if missed</th><th scope="col">Record a binding date</th></tr></thead>
          <tbody>{r.dueSoon.map((d) => (<tr key={d.id}><th scope="row"><span className="cat">{d.name}</span><span className="sub">{d.procedure}, {d.hospital}</span></th><td data-label="Time left">{plural(d.daysLeft, 'day', 'days')} (by {fmtShort(d.deadline)})</td><td className="n" data-label="Repayment if missed">{d.ifBreached ? gbp(d.ifBreached) : 'No claim yet'}</td>
            <td data-label="Record a binding date"><span className="row"><label className="sr" htmlFor={'d' + d.id}>Binding date for {d.name}</label><input id={'d' + d.id} type="date" value={dates[d.id] || ''} onChange={(e) => setDates({ ...dates, [d.id]: e.target.value })} /><button className="btn" onClick={() => book(d.id)} disabled={!dates[d.id]}>Record binding date</button></span></td></tr>))}</tbody>
        </table></div>
      )}
      <h3>What these cancellations cost the trust</h3>
      <div className="cmp">
        <div><p className="sm">Absorbed by the trust, {plural(r.absorbed.episodes, 'covered cancellation', 'covered cancellations')}</p><p className="fig2">{gbp0(r.absorbed.low)} to {gbp0(r.absorbed.high)}</p></div>
        <div><p className="sm">Repaid to patients so far ({plural(r.repayments.paidCount, 'payout', 'payouts')})</p><p className="fig2">{gbp(r.repayments.paid)}</p></div>
        <div><p className="sm">Filed claims on running clocks, due if missed</p><p className="fig2">{gbp(r.repayments.exposureOnRunningClocks)}</p></div>
      </div>
      <div className="tablewrap"><table>
        <caption className="sr">Cost per cancelled episode</caption>
        <thead><tr><th scope="col">NHS National Cost Collection 2024/25, {ev.hrg}</th><th scope="col" className="n">Per episode</th></tr></thead>
        <tbody><tr><th scope="row">Day case</th><td className="n">{gbp0(ev.daycase.low)} to {gbp0(ev.daycase.high)}</td></tr><tr><th scope="row">Elective inpatient</th><td className="n">{gbp0(ev.inpatient.low)} to {gbp0(ev.inpatient.high)}</td></tr></tbody>
      </table></div>
      <p>{ev.pricing}</p>
      <p className="fine">{ev.totalNote}</p>
      <p className="fine">The absorbed total above is the per-episode range multiplied by the number of covered cancellations in the example data. It is an estimate, not a ledger.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ Evidence */
export function Evidence({ ev, state }) {
  return (
    <div className="panel prose">
      <h2>Evidence and method</h2>
      <h3>The promise is a pledge, not a right</h3>
      <blockquote>"{ev.pledge.constitution}" <cite>NHS Constitution</cite></blockquote>
      <ul className="plain"><li>{ev.pledge.handbook}</li><li>{ev.pledge.si}</li><li>{ev.pledge.contract}</li><li>{ev.pledge.statute}</li></ul>
      <h3>What a cancellation costs the hospital</h3>
      <p>NHS National Cost Collection 2024/25, {ev.hospitalCost.hrg}: {gbp0(ev.hospitalCost.daycase.low)} to {gbp0(ev.hospitalCost.daycase.high)} for a day case and {gbp0(ev.hospitalCost.inpatient.low)} to {gbp0(ev.hospitalCost.inpatient.high)} for an elective inpatient. {ev.hospitalCost.pricing} {ev.hospitalCost.totalNote}</p>
      <h3>How the clock counts</h3>
      <ul className="plain">
        <li>Day 0 is the London calendar date of the cancellation. Day 28 is the last valid day.</li>
        <li>The promise is broken from 00:00 London time on day 29. A binding date that falls on day 28 keeps it.</li>
        <li>Days are calendar dates, never multiples of 24 hours, so the October clock change cannot move the deadline.</li>
        <li>The pledge wording is "offered another binding date within 28 days". NHS England's published measure counts patients treated within 28 days. This service applies the pledge wording.</li>
      </ul>
      <h3>Money</h3>
      <ul className="plain">
        <li>Repayments are made in pounds sterling through PayPal Payouts.</li>
        <li>An agent cannot start a PayPal wallet payment without a person in a browser, but it can send a Payout. That is why this service is built on Payouts.</li>
        <li>Each case has one payout reference. If a payout is replayed, PayPal refuses the duplicate and the original is adopted. The ceiling per payout is {gbp0(state.policy.totalCap)}.</li>
      </ul>
      <h3>What this service does not claim</h3>
      <ul className="plain">{ev.notClaimed.map((t, i) => <li key={i}>{t}</li>)}</ul>
      <p className="fine">Cancelled-Op is an independent project. It is not an NHS service and is not endorsed by the NHS.</p>
    </div>
  );
}
