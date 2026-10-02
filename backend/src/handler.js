// One Lambda behind a Function URL. Routes:
//   GET  /api/health                      GET  /api/state
//   POST /api/cases                       GET  /api/cases/:id
//   POST /api/cases/:id/offer             POST /api/cases/:id/offer/:oid/decline
//   POST /api/cases/:id/claim|claim/reply|claim/skip|claim/confirm   POST /api/cases/:id/advance
//   POST /api/cases/:id/offer/:oid/(decline|postpone|recancel)       POST /api/cases/:id/delete
//   GET  /api/trust?hospital=   GET /api/admin/webhook-log (ADMIN_TOKEN)
//   POST /api/cases/:id/email             POST /api/cases/:id/refresh
//   POST /api/demo/restore                POST /api/webhooks/paypal
//   (EventBridge schedule event)  -> sweep()
import * as logic from './logic.js';
import * as paypal from './paypal.js';
import { trustReport } from './trust.js';
import { dynamoStore, memoryStore } from './store.js';
import { seed } from './seed.js';
import { EVIDENCE } from './evidence.js';
import { POLICY } from './policy.js';
import { WINDOW_DAYS } from './clock.js';

let _deps;
export async function getDeps(override) {
  if (override) return override;
  if (!_deps) _deps = { store: process.env.STORE === 'memory' ? memoryStore() : await dynamoStore(), paypal, now: () => Date.now() };
  return _deps;
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
const json = (status, body, extra = {}) => ({ statusCode: status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS, ...extra }, body: JSON.stringify(body) });

export async function handler(event, _ctx, third) {
  // Lambda passes a callback as the third argument; tests pass a dependency object there.
  const deps = await getDeps(third && typeof third === 'object' ? third : undefined);
  if (event.source === 'aws.events' || event['detail-type'] === 'Scheduled Event') {
    const r = await logic.sweep(deps); console.log('sweep', JSON.stringify(r)); return r;
  }
  const method = event.requestContext?.http?.method || event.httpMethod || 'GET';
  const path = (event.rawPath || event.path || '/').replace(/\/+$/, '') || '/';
  if (method === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString() : event.body || '';
  const hdrs = Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  let body = {};
  const isWebhook = path === '/api/webhooks/paypal';
  if (!isWebhook && raw) { try { body = JSON.parse(raw); } catch { return json(400, { error: 'body must be JSON' }); } }
  try {
    let m;
    if (path === '/api/health') return json(200, { ok: true, store: deps.store.kind, payoutCurrency: logic.payoutCurrency(), paypalConfigured: !!process.env.PAYPAL_CLIENT_ID, webhookConfigured: !!process.env.PAYPAL_WEBHOOK_ID, time: new Date(deps.now()).toISOString() });
    if (method === 'GET' && path === '/api/state') {
      const ids = String(event.queryStringParameters?.ids || '').split(',').filter((x) => /^[\w-]+$/.test(x)).slice(0, 30);
      let cases = await logic.listScoped(deps, ids);
      if (!cases.some((c) => c.seed) && !process.env.NO_AUTOSEED) { await seed(deps); cases = await logic.listScoped(deps, ids); }
      return json(200, { evidence: EVIDENCE, policy: POLICY, window: WINDOW_DAYS, payoutCurrency: logic.payoutCurrency(), settlement: logic.settlement(), sandbox: /sandbox/.test(process.env.PAYPAL_API || 'sandbox'), cases });
    }
    if (method === 'POST' && path === '/api/cases') return json(201, await logic.createCase(deps, body));
    if (method === 'GET' && path === '/api/trust') {
      const all = (await logic.listScoped(deps, [])).filter((c) => c.seed); // example data only: there is no trust login in this build
      return json(200, { example: true, report: trustReport(all, event.queryStringParameters?.hospital || null), evidence: EVIDENCE.hospitalCost });
    }
    if (method === 'POST' && path === '/api/demo/restore') { const made = await seed(deps, { restore: true }); return json(200, { restored: made }); }
    if (method === 'GET' && path === '/api/admin/webhook-log') {
      if (!process.env.ADMIN_TOKEN || hdrs['x-admin-token'] !== process.env.ADMIN_TOKEN) return json(403, { error: 'forbidden' });
      return json(200, await deps.store.getLogs());
    }
    if (isWebhook && method === 'POST') {
      let ok = false;
      try { ok = await deps.paypal.verifyWebhook(hdrs, raw); } catch (e) { console.log('webhook verify error', e.message); }
      try { await deps.store.putLog?.({ at: new Date(deps.now()).toISOString(), verified: ok, headers: Object.fromEntries(Object.entries(hdrs).filter(([k]) => k.startsWith('paypal-'))), body: raw.slice(0, 20000) }); } catch (e) { console.log('webhook log error', e.message); }
      if (!ok) return json(401, { error: 'signature not verified' });
      return json(200, await logic.applyWebhook(deps, JSON.parse(raw)));
    }
    if ((m = path.match(/^\/api\/cases\/([\w-]+)$/)) && method === 'GET') { const c = await deps.store.get(m[1]); if (!c) return json(404, { error: 'That case was not found. Check the link, or go back to the overview and choose a case.' }); return json(200, logic.view(c, deps)); }
    if ((m = path.match(/^\/api\/cases\/([\w-]+)\/(offer|claim|claim\/reply|claim\/skip|claim\/confirm|advance|email|refresh|delete)$/)) && method === 'POST') {
      const [, id, act] = m;
      if (act === 'offer') return json(200, await logic.recordOffer(deps, id, body));
      if (act === 'claim') return json(200, await logic.submitClaim(deps, id, body.narrative));
      if (act === 'claim/reply') return json(200, await logic.claimReply(deps, id, body.message));
      if (act === 'claim/skip') return json(200, await logic.claimFinalize(deps, id));
      if (act === 'claim/confirm') return json(200, await logic.claimConfirm(deps, id));
      if (act === 'delete') return json(200, await logic.deleteCase(deps, id));
      if (act === 'advance') return json(200, await logic.advance(deps, id, body.days));
      if (act === 'email') return json(200, await logic.fixEmail(deps, id, body.email));
      if (act === 'refresh') return json(200, await logic.refreshPayout(deps, id));
    }
    if ((m = path.match(/^\/api\/cases\/([\w-]+)\/offer\/(o\d+)\/(decline|postpone|recancel)$/)) && method === 'POST') return json(200, await logic.offerAction(deps, m[1], m[2], m[3], body));
    return json(404, { error: 'no such route', path });
  } catch (e) {
    if (e instanceof logic.HttpError) return json(e.status, { error: e.message });
    console.error('unhandled', e);
    return json(500, { error: 'internal error', detail: e.message });
  }
}
