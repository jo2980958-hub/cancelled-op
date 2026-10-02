import React, { useEffect, useRef, useState } from 'react';

const P = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  plus: 'M12 5v14M5 12h14',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  scale: 'M12 3v18M5 7h14M5 7l-2 6a3 3 0 006 0zM19 7l-2 6a3 3 0 006 0z',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3',
  cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  building: 'M4 21V8l8-5 8 5v13M4 21h16M9 21v-6h6v6',
  book: 'M5 4h10a3 3 0 013 3v13H8a3 3 0 01-3-3zM5 17a3 3 0 013-3h10',
  arrow: 'M4 12h16M14 6l6 6-6 6',
  check: 'M5 12l4 4 10-10',
  cross: 'M6 6l12 12M18 6L6 18',
  info: 'M12 8h.01M11 12h1v5h1M12 21a9 9 0 100-18 9 9 0 000 18z',
  sun: 'M12 16a4 4 0 100-8 4 4 0 000 8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5',
  copy: 'M9 9h10v12H9zM5 15V3h10',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14',
};
export const Icon = ({ n, className = '' }) => (
  <svg className={'ic ' + className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={P[n]} /></svg>
);

/** Illustrations for the service cards: flat shapes, no photography. */
export const Ill = ({ kind }) => (
  <svg className="ill" viewBox="0 0 200 150" aria-hidden="true" focusable="false">
    <circle cx="150" cy="118" r="62" className="i-soft" />
    {kind === 'report' && (<g><rect x="78" y="30" width="86" height="104" rx="10" className="i-a" /><path d="M92 58h58M92 78h58M92 98h34" className="i-w" /><circle cx="146" cy="112" r="22" className="i-hot" /><path d="M137 103l18 18M155 103l-18 18" className="i-line" /></g>)}
    {kind === 'track' && (<g><circle cx="122" cy="84" r="54" className="i-a" /><circle cx="122" cy="84" r="40" fill="none" className="i-ring" /><path d="M122 84V56M122 84l20 12" className="i-w" /></g>)}
    {kind === 'why' && (<g><rect x="70" y="26" width="104" height="26" rx="8" className="i-a" /><rect x="70" y="60" width="104" height="26" rx="8" className="i-b" /><rect x="70" y="94" width="104" height="26" rx="8" className="i-hot" /><path d="M82 39h22M82 73h22M82 107h22" className="i-w" /></g>)}
    {kind === 'claim' && (<g><path d="M70 28h96v102l-16-11-16 11-16-11-16 11-16-11z" className="i-b" /><path d="M86 60h60M86 82h60M86 104h28" className="i-w" /><circle cx="160" cy="36" r="22" className="i-hot" /><text x="160" y="46" textAnchor="middle" className="i-t">£</text></g>)}
    {kind === 'offer' && (<g><rect x="66" y="40" width="104" height="92" rx="12" className="i-ok" /><rect x="66" y="40" width="104" height="26" rx="12" className="i-a" /><path d="M92 98l16 16 34-34" className="i-wl" /></g>)}
    {kind === 'trust' && (<g><rect x="72" y="86" width="24" height="46" className="i-a" /><rect x="106" y="62" width="24" height="70" className="i-b" /><rect x="140" y="38" width="24" height="94" className="i-hot" /><path d="M64 136h110" className="i-axis" /></g>)}
    {kind === 'book' && (<g><path d="M64 44h50a12 12 0 0112 12v76H76a12 12 0 01-12-12z" className="i-a" /><path d="M126 56a12 12 0 0112-12h20v76a12 12 0 01-12 12h-20z" className="i-b" /><path d="M80 70h32M80 90h32" className="i-w" /></g>)}
  </svg>
);

export function Field({ id, label, hint, error, children }) {
  return (
    <div className={'field' + (error ? ' bad' : '')}>
      <label htmlFor={id}>{label}</label>
      {hint && <p className="hint" id={id + '-h'}>{hint}</p>}
      {children}
      {error && <p className="err" id={id + '-e'} role="alert"><Icon n="info" /> {error}</p>}
    </div>
  );
}

export const Notice = ({ tone = 'info', title, children, role }) => (
  <div className={'notice ' + tone} role={role || (tone === 'err' ? 'alert' : 'status')}>
    <Icon n={tone === 'ok' ? 'check' : tone === 'err' ? 'cross' : 'info'} />
    <div>{title && <b>{title}</b>}{children}</div>
  </div>
);

export function Spinner({ label }) {
  return <div className="spin" role="status"><span className="spinner" aria-hidden="true" /><span>{label}</span></div>;
}

/** Two-step destructive/significant confirmation, inline (no browser dialogs). */
export function Confirm({ label, confirmLabel, onConfirm, tone = '', disabled }) {
  const [ask, setAsk] = useState(false);
  const ref = useRef();
  useEffect(() => { if (ask) ref.current?.focus(); }, [ask]);
  if (!ask) return <button type="button" className={'btn ' + tone} onClick={() => setAsk(true)} disabled={disabled}>{label}</button>;
  return (
    <span className="row" role="group" aria-label="Confirm">
      <button type="button" ref={ref} className="btn danger" onClick={() => { setAsk(false); onConfirm(); }}>{confirmLabel}</button>
      <button type="button" className="btn" onClick={() => setAsk(false)}>Keep this case</button>
    </span>
  );
}
