import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { mine, look } from './lib.js';
import { Banner } from './Clock.jsx';
import { Icon, Notice, Spinner } from './ui.jsx';
import { Overview, Report, Track, Why, Claim, Offers, Trust, Evidence } from './views.jsx';

const VIEWS = ['home', 'report', 'track', 'why', 'claim', 'offers', 'trust', 'evidence'];
const parse = () => { const p = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean); if (p[0] === 'case') return { id: p[1], view: VIEWS.includes(p[2]) ? p[2] : 'track' }; return { id: null, view: VIEWS.includes(p[0]) ? p[0] : 'home' }; };
const THEMES = ['system', 'light', 'dark'];

export default function App() {
  const [state, setState] = useState(null);
  const [loadErr, setLoadErr] = useState('');
  const [route, setRoute] = useState(parse());
  const [sel, setSel] = useState(route.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fresh, setFresh] = useState(null);
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('cop.theme') || 'light'; } catch { return 'light'; } });

  useEffect(() => { const el = document.documentElement; if (theme === 'system') el.removeAttribute('data-theme'); else el.setAttribute('data-theme', theme); try { localStorage.setItem('cop.theme', theme); } catch { /* ignore */ } }, [theme]);
  useEffect(() => { const h = () => { const r = parse(); setRoute(r); if (r.id) setSel(r.id); }; window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h); }, []);

  const load = useCallback(async () => {
    setLoadErr('');
    try {
      const ids = [...new Set([...mine.get(), ...(parse().id ? [parse().id] : [])])];
      const s = await api.state(ids);
      setState(s);
      const want = parse().id;
      if (want && s.cases.some((c) => c.id === want && !c.seed)) mine.add(want);
      setSel((cur) => (cur && s.cases.some((c) => c.id === cur) ? cur : mine.get().find((i) => s.cases.some((c) => c.id === i)) || s.cases.find((c) => c.id === 'seed-priya')?.id || s.cases[0]?.id));
    } catch (e) { setLoadErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const cur = useMemo(() => state?.cases.find((c) => c.id === sel), [state, sel]);
  const open = (view, id = sel) => { setError(''); setFresh(null); const h = view === 'home' ? '#/' : id && ['track', 'why', 'claim', 'offers'].includes(view) ? `#/case/${id}/${view}` : `#/${view}`; if (location.hash === h) setRoute(parse()); else location.hash = h; window.scrollTo({ top: 0 }); document.getElementById('main')?.focus({ preventScroll: true }); };
  const pick = (id) => { setSel(id); setError(''); if (['track', 'why', 'claim', 'offers'].includes(route.view)) location.hash = `#/case/${id}/${route.view}`; };
  const onChange = (c) => setState((s) => ({ ...s, cases: s.cases.map((x) => (x.id === c.id ? c : x)) }));
  const run = async (fn) => { setBusy(true); setError(''); try { await fn(); } catch (e) { setError(e.message); } setBusy(false); };
  const onCreated = (c) => { mine.add(c.id); setState((s) => ({ ...s, cases: [c, ...s.cases] })); setSel(c.id); setFresh(c.id); location.hash = `#/case/${c.id}/track`; window.scrollTo({ top: 0 }); };
  const afterDelete = (id) => { setState((s) => ({ ...s, cases: s.cases.filter((c) => c.id !== id) })); setSel(null); load(); open('home'); };

  if (loadErr) return (<main className="boot"><h1>Cancelled-Op</h1><Notice tone="err" title="The service did not load.">{' ' + loadErr + ' Check the connection, then reload.'}</Notice><button className="btn primary" onClick={load}>Try again</button></main>);
  if (!state || !cur) return (<main className="boot"><h1>Cancelled-Op</h1><Spinner label="Loading the 28-day clock." /></main>);

  const view = route.view;
  const l = look(cur), e = cur.eval;
  const mineCases = state.cases.filter((c) => !c.seed), examples = state.cases.filter((c) => c.seed);
  const isMine = !cur.seed;
  const needsCase = ['track', 'why', 'claim', 'offers'].includes(view);

  const TABS = [['track', 'Watch the 28 days'], ['why', 'Why this was decided'], ['claim', 'Claim your costs'], ['offers', 'Rebooking dates']];
  const back = view !== 'home' && (<button className="back" onClick={() => open('home')}><Icon n="arrow" className="flip" /> All services</button>);
  return (
    <div className="app">
      <a className="skip" href="#main">Skip to content</a>
      <header className="mast">
        <div className="brand">
          <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="10" className="b-bg" /><rect x="8" y="9" width="24" height="22" rx="4" fill="none" className="b-line" strokeWidth="2.4" /><path d="M8 16h24" className="b-line" strokeWidth="2.4" /><path d="M15 21l10 8M25 21l-10 8" className="b-x" strokeWidth="3" strokeLinecap="round" /></svg>
          <div><b>Cancelled-Op</b><small>Independent. Not an NHS service.</small></div>
        </div>
      </header>
      <div className="top">
        <p>{state.settlement?.scaled && <> Settlement is currently in {state.settlement.currency}; the sterling figures are the real amounts this would pay.</>}</p>
        <div className="row">
          <button className="btn onDark" onClick={() => setTheme(THEMES[(THEMES.indexOf(theme) + 1) % 3])} aria-label={`Colour theme: ${theme}. Switch to ${THEMES[(THEMES.indexOf(theme) + 1) % 3]}.`}><Icon n="sun" /> Theme: {theme}</button>
        </div>
      </div>
      <main id="main" tabIndex={-1} className="wrap">
        {back}
        {view !== 'trust' && view !== 'evidence' && view !== 'report' && <Banner c={cur} example={cur.seed} onAction={view === 'claim' ? undefined : (a) => open(a)} />}
        {needsCase && (
          <nav aria-label="This case" className="tabs">
            {TABS.map(([v, t]) => (view === v ? <span key={v} className="tab on" aria-current="page">{t}</span> : <button key={v} className="tab" onClick={() => open(v)}>{t}</button>))}
          </nav>
        )}
        {(view !== 'trust' && view !== 'evidence' && view !== 'report') && (
          <div className="cases" aria-label="Choose a case">
            {mineCases.length > 0 && <div className="chipgroup"><span className="gl">Your cases</span>{mineCases.map((c) => <Chip key={c.id} c={c} on={sel === c.id} pick={pick} />)}</div>}
            {mineCases.length > 0 ? (
              <details className="eg-cases"><summary>Example cases ({examples.length})</summary><div className="chipgroup">{examples.map((c) => <Chip key={c.id} c={c} on={sel === c.id} pick={pick} />)}</div>
                <p className="fine"><button className="linkbtn" onClick={() => run(async () => { await api.restore(); await load(); })} disabled={busy}>Restore the example cases</button> to reset them. Your own cases are not touched.</p></details>
            ) : (
              <div className="chipgroup"><span className="gl">Example cases</span>{examples.map((c) => <Chip key={c.id} c={c} on={sel === c.id} pick={pick} />)}
                <button className="linkbtn" onClick={() => run(async () => { await api.restore(); await load(); })} disabled={busy}>Restore the examples</button></div>
            )}
          </div>
        )}
        {error && <Notice tone="err" title="That did not work.">{' ' + error}</Notice>}
        {view === 'home' && <Overview cur={cur} open={open} hasMine={mineCases.length > 0} />}
        {view === 'report' && <Report onCreated={onCreated} run={run} error={error} />}
        {needsCase && view === 'track' && <Track c={cur} run={run} onChange={onChange} isMine={isMine} afterDelete={afterDelete} justCreated={fresh === cur.id} />}
        {needsCase && view === 'why' && <Why c={cur} />}
        {needsCase && view === 'claim' && <Claim c={cur} run={run} onChange={onChange} busy={busy} policy={state.policy} />}
        {needsCase && view === 'offers' && <Offers c={cur} run={run} onChange={onChange} />}
        {view === 'trust' && <Trust run={run} onCaseChange={onChange} />}
        {view === 'evidence' && <Evidence ev={state.evidence} state={state} />}
        {busy && view !== 'claim' && <Spinner label="Working." />}
      </main>
      <footer className="foot">
        <button className="linkbtn" onClick={() => open('evidence')}>Evidence and method</button>
        <span>Independent project, not affiliated with the NHS.</span>
      </footer>
    </div>
  );
}

function Chip({ c, on, pick }) {
  const l = look(c);
  return (
    <button className={'chip' + (on ? ' on' : '')} aria-pressed={on} onClick={() => pick(c.id)}>
      <span className={'dot tone-' + l.tone} aria-hidden="true" />
      <span>{c.patient.name}</span>
      <span className="cl">{c.eval.state === 'ticking' ? `${c.eval.daysLeft} left` : l.label}</span>
    </button>
  );
}
