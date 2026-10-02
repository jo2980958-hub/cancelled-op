// WCAG contrast from the actual colour tokens in frontend/src/styles.css. Thresholds: 4.5 normal text, 3 large/bold (18pt+ or 14pt bold) and UI components.
const L = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)); return .2126 * r + .7152 * g + .0722 * b; };
const cr = (a, b) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
const light = { bg: '#f4f0e8', surface: '#fffdf9', ink: '#241326', muted: '#594460', accent: '#4a1d57', accentInk: '#ffffff', burg: '#8f1d44', amberInk: '#6e4300', green: '#2a6039', hotBg: '#fbecc4', okBg: '#dfeedf', badBg: '#f8e1e8', infoBg: '#ece5d8', soft: '#ece5d8', clockRun: '#3a1245', clockWarn: '#f2b01e', clockBroken: '#7b1c3b', clockKept: '#25583a', clockOff: '#55455a', border: '#7d6a82' };
const dark = { bg: '#160a1a', surface: '#241229', ink: '#f4ecf6', muted: '#cfbdd4', accent: '#e6bff5', accentInk: '#25102c', burg: '#ffa3bc', amberInk: '#f6c453', green: '#9ad8a5', hotBg: '#4a3508', okBg: '#173a24', badBg: '#45172b', infoBg: '#301a37', soft: '#301a37', clockRun: '#2a0e34', clockWarn: '#f2b01e', clockBroken: '#7b1c3b', clockKept: '#25583a', clockOff: '#55455a', border: '#9c86a3' };
const pairs = (t) => [
  ['Body text on page', t.ink, t.bg, 4.5], ['Body text on card', t.ink, t.surface, 4.5], ['Muted text on page', t.muted, t.bg, 4.5], ['Muted text on card', t.muted, t.surface, 4.5], ['Muted text on soft panel', t.muted, t.soft, 4.5],
  ['Heading/link accent on page', t.accent, t.bg, 4.5], ['Heading/link accent on card', t.accent, t.surface, 4.5], ['Primary button label on button', t.accentInk, t.accent, 4.5],
  ['Burgundy text on card', t.burg, t.surface, 4.5], ['Burgundy text on page', t.burg, t.bg, 4.5], ['Amber text on card', t.amberInk, t.surface, 4.5], ['Amber text on warning fill', t.amberInk, t.hotBg, 4.5],
  ['Green text on card', t.green, t.surface, 4.5], ['Green text on success fill', t.green, t.okBg, 4.5], ['Burgundy text on error fill', t.burg, t.badBg, 4.5], ['Body text on info fill', t.ink, t.infoBg, 4.5],
  ['Clock (running): white on plum', '#ffffff', t.clockRun, 4.5], ['Clock (running): cell digits', '#ffffff', '#5b2a69', 4.5], ['Clock (running): crossed-out digits', '#d9c3e1', '#46204f', 4.5],
  ['Clock (running): today cell', '#2a1a00', '#f2b01e', 4.5], ['Clock (warning): dark on amber', '#2a1a00', t.clockWarn, 4.5], ['Clock (warning): digits on cell', '#2a1a00', '#fbd27a', 4.5], ['Clock (warning): crossed digits', '#3a2500', '#dc9a12', 4.5], ['Clock (warning): today white on plum', '#ffffff', '#3a1245', 4.5],
  ['Clock (broken): white on burgundy', '#ffffff', t.clockBroken, 4.5], ['Clock (broken): cell digits', '#ffffff', '#a03a5d', 4.5], ['Clock (broken): crossed digits', '#fbdbe5', '#8d2c4d', 4.5],
  ['Clock (kept): white on green', '#ffffff', t.clockKept, 4.5], ['Clock (kept): cell digits', '#ffffff', '#3b7550', 4.5], ['Side clock: white on off-grey', '#ffffff', t.clockOff, 4.5],
  ['Form field border vs card (UI component, 3:1)', t.border, t.surface, 3], ['Focus ring (#1a5fd0 light / #8fb8ff dark) vs page, 3:1', t === light ? '#1a5fd0' : '#8fb8ff', t.bg, 3],
];
let fails = 0; for (const [name, t] of [['LIGHT', light], ['DARK', dark]]) { console.log(`\n${name}`); for (const [n, f, b, need] of pairs(t)) { const r = cr(f, b); const ok = r >= need; if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${r.toFixed(2).padStart(5)}:1  (need ${need})  ${n}  ${f} on ${b}`); } }
console.log(`\n${fails} failing pair(s)`);
