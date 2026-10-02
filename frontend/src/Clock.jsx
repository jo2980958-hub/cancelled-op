import React from 'react';
import { look, fmtDate, gbp, owed } from './lib.js';

/** The signature element: 28 days as exactly four weeks. Crossed-off days, today ringed, day 28 flagged. */
export function Calendar({ c }) {
  const e = c.eval;
  if (e.state === 'ineligible') return null;
  const start = new Date(e.cycleStart + 'T00:00:00Z');
  const keptIdx = e.keptDate ? Math.round((Date.parse(e.keptDate + 'T00:00:00Z') - start) / 864e5) : null;
  const rows = [0, 1, 2, 3].map((w) => Array.from({ length: 7 }, (_, k) => w * 7 + k + 1));
  const dateOf = (n) => new Date(start.getTime() + n * 864e5).toISOString().slice(0, 10);
  const summary = e.state === 'ticking' ? `Day ${e.day} of 28, ${e.daysLeft} days left, deadline ${fmtDate(e.deadline)}`
    : e.state === 'breached' ? `Day ${e.day}, ${e.daysOver} days past the deadline of ${fmtDate(e.deadline)}` : `Promise secured for ${fmtDate(e.keptDate)}`;
  return (
    <div className="cal" role="img" aria-label={`Four-week calendar. ${summary}.`}>
      <div className="cal-grid" aria-hidden="true">
        {rows.map((r, wi) => (
          <div className="cal-row" key={wi}>
            <span className="cal-wk">Week {wi + 1}</span>
            {r.map((n) => {
              let k = 'cal-d';
              let mark = null;
              if (e.state === 'breached') { k += ' over'; mark = n === 28 ? 'missed' : 'crossed'; }
              else if (keptIdx !== null && n === keptIdx) { k += ' secured'; mark = 'booked'; }
              else if (n < e.day || (keptIdx !== null && n < keptIdx && e.state !== 'ticking')) { k += ' gone'; mark = 'crossed'; }
              else if (n === e.day) { k += ' today'; mark = 'today'; }
              if (n === 28) k += ' last';
              return (
                <span key={n} className={k} title={fmtDate(dateOf(n))}>
                  <b>{n}</b>
                  {mark === 'crossed' && <i className="x" />}
                  {mark === 'missed' && <i className="x" />}
                  {mark === 'today' && <i className="dot" />}
                  {mark === 'booked' && <i className="tick">✓</i>}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Banner({ c, example, onAction }) {
  const l = look(c), e = c.eval, o = owed(c);
  return (
    <section className={'clock tone-' + l.tone} aria-label="The 28-day clock">
      <div className="clock-top">
        <span className="stamp">{l.label}</span>
        {example && <span className="eg">Example</span>}
        {e.cycle > 1 && <span className="eg">New clock, cycle {e.cycle}</span>}
        <h1>{l.big}{l.unit ? ` ${l.unit}` : ''} to treat {c.patient.name}, or the NHS pays for it privately.<span>{c.procedure.toLowerCase()} · {c.hospital}</span></h1>
      </div>
      <div className="clock-body">
        <div className="count" aria-live="polite">
          <div className="num">{l.big}</div>
          {l.unit && <div className="unit">{l.unit}</div>}
        </div>
        {o && (
          <div className={'owed owed-' + o.tone}>
            {o.amount !== null && <b>{gbp(o.amount)}</b>}
            <span>{o.label}</span>
            {o.action && onAction && <button className="btn onDark" onClick={() => onAction(o.action)}>{c.claim ? 'Review the claim' : 'Claim my costs'}</button>}
          </div>
        )}
        <p className="clock-copy"><b>{l.head}.</b>{e.state === 'breached' || e.state === 'ineligible' ? ' ' + l.text : ''}</p>
      </div>
      <Calendar c={c} />
    </section>
  );
}
