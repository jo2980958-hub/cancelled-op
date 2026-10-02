import { memoryStore } from '../src/store.js';
import { PayPalError, EMAIL_RE } from '../src/paypal.js';

/** A scripted stand-in for Bedrock Converse. `turns` is a list; each turn is the list of toolUse blocks (or a text string) the "model" emits. */
export function scriptedConverse(turns) {
  let i = 0; const seen = [];
  const fn = async (body) => {
    seen.push(structuredClone(body.messages));
    const t = turns[i++];
    if (t === undefined) return { output: { message: { role: 'assistant', content: [{ text: 'done' }] } }, stopReason: 'end_turn' };
    if (typeof t === 'string') return { output: { message: { role: 'assistant', content: [{ text: t }] } }, stopReason: 'end_turn' };
    return { output: { message: { role: 'assistant', content: t.map(([name, input], k) => ({ toolUse: { toolUseId: `t${i}_${k}`, name, input } })) } }, stopReason: 'tool_use' };
  };
  fn.seen = seen; return fn;
}
export const LINES = [
  { category: 'travel', description: 'Car to hospital and back', miles: 68, evidence: 'none', justification: 'stated 68 miles' },
  { category: 'parking', description: 'Hospital parking', amount_gbp: 9.5, evidence: 'receipt', justification: 'ticket held' },
  { category: 'wages', description: 'Lost working day', hours: 8, hourly_rate_gbp: 22, evidence: 'payslip', justification: 'payslip held' },
];
export const finishScript = (lines = LINES) => [[...lines.map((l) => ['add_line', l]), ['submit_claim', { summary: 'Three costs recorded.' }]]];

export function fakeDeps({ nowIso = '2026-10-02T12:00:00Z', lines, turns, ppFail } = {}) {
  const calls = { createPayout: [], getBatch: [] };
  const state = { now: Date.parse(nowIso) };
  const deps = {
    store: memoryStore(), now: () => state.now,
    converse: scriptedConverse(turns ?? finishScript(lines)),
    paypal: {
      async createPayout(a) { calls.createPayout.push(a); if (ppFail) throw ppFail; if (!EMAIL_RE.test(a.email)) throw new PayPalError('bad email', { status: 400, name: 'VALIDATION_ERROR' }); return { batchId: 'B' + calls.createPayout.length, batchStatus: 'PENDING', senderBatchId: 'cop-' + a.caseId, requestId: 'cop-' + a.caseId }; },
      async cancelUnclaimed(itemId) { calls.cancel = (calls.cancel || []).concat(itemId); return {}; },
      async getBatch(id) { calls.getBatch.push(id); return { batchId: id, batchStatus: 'SUCCESS', itemStatus: 'SUCCESS', itemId: 'I1', fee: { currency: 'GBP', value: '0.02' } }; },
    },
  };
  return { deps, calls, state };
}
export const baseInput = { name: 'Test Patient', email: 'test.patient@example.com', hospital: 'H', procedure: 'P', setting: 'daycase', cancelledBy: 'hospital_nonclinical', timing: 'day_of_surgery', reasonText: 'x' };
