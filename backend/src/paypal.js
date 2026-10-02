// PayPal Payouts (the hands-free rail). Secrets come from env only.
const API = () => process.env.PAYPAL_API || 'https://api-m.sandbox.paypal.com';
let tokenCache = { value: null, exp: 0 };

export class PayPalError extends Error {
  constructor(msg, { status, name, debugId, details } = {}) { super(msg); this.name = 'PayPalError'; Object.assign(this, { status, ppName: name, debugId, details }); }
}

async function ppFetch(path, opts = {}) {
  const r = await fetch(API() + path, opts);
  const text = await r.text();
  let json; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!r.ok) throw new PayPalError(json.message || json.error_description || `PayPal ${r.status}`, { status: r.status, name: json.name || json.error, debugId: json.debug_id, details: json.details });
  return json;
}

export async function getToken() {
  if (tokenCache.value && Date.now() < tokenCache.exp - 60000) return tokenCache.value;
  const id = process.env.PAYPAL_CLIENT_ID, sec = process.env.PAYPAL_SECRET;
  if (!id || !sec) throw new PayPalError('PayPal credentials are not configured');
  const j = await ppFetch('/v1/oauth2/token', { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(`${id}:${sec}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' });
  tokenCache = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Create a single-item payout. The sender_batch_id is deterministic per case (and per corrected-email generation),
 * and the same value is sent as PayPal-Request-Id. FINDING (sandbox, see TEST-RESULTS): PayPal-Request-Id alone did NOT
 * dedupe a payout; the duplicate sender_batch_id is what PayPal refuses, with a 400 whose details carry a link to the
 * ORIGINAL batch. We adopt that batch, so a lost write can be recovered without paying twice.
 */
export async function createPayout({ caseId, email, amount, currency, note, subject, recipientType = 'EMAIL' }) {
  if (recipientType === 'EMAIL' && !EMAIL_RE.test(email || '')) throw new PayPalError('Recipient email is not valid', { name: 'INVALID_RECIPIENT' });
  const value = Number(amount);
  if (!(value > 0)) throw new PayPalError('Amount must be positive', { name: 'INVALID_AMOUNT' });
  const batchId = `cop-${caseId}`;
  const body = {
    sender_batch_header: { sender_batch_id: batchId, email_subject: subject || 'Your out-of-pocket costs have been repaid', email_message: 'Your operation was cancelled and no new date was given within 28 days. This repays what the cancellation cost you.' },
    items: [{ recipient_type: recipientType, amount: { value: value.toFixed(2), currency }, receiver: email, note: (note || '').slice(0, 900), sender_item_id: caseId }],
  };
  try {
    const j = await ppFetch('/v1/payments/payouts', { method: 'POST', headers: { Authorization: 'Bearer ' + (await getToken()), 'Content-Type': 'application/json', 'PayPal-Request-Id': batchId }, body: JSON.stringify(body) });
    return { batchId: j.batch_header.payout_batch_id, batchStatus: j.batch_header.batch_status, senderBatchId: batchId, requestId: batchId, duplicate: false };
  } catch (e) {
    const d = (e.details || []).find((x) => /already exists/i.test(x.issue || ''));
    const href = d?.link?.[0]?.href;
    if (e.status === 400 && href) return { batchId: href.split('/').pop(), batchStatus: 'PENDING', senderBatchId: batchId, requestId: batchId, duplicate: true };
    throw e;
  }
}

export async function getBatch(batchId) {
  const j = await ppFetch('/v1/payments/payouts/' + encodeURIComponent(batchId), { headers: { Authorization: 'Bearer ' + (await getToken()) } });
  const it = j.items?.[0];
  return {
    batchId: j.batch_header.payout_batch_id, batchStatus: j.batch_header.batch_status,
    fee: j.batch_header.fees, itemId: it?.payout_item_id, itemStatus: it?.transaction_status,
    errors: it?.errors || null, amount: it?.payout_item?.amount,
  };
}

export async function cancelUnclaimed(itemId) {
  return ppFetch(`/v1/payments/payouts-item/${encodeURIComponent(itemId)}/cancel`, { method: 'POST', headers: { Authorization: 'Bearer ' + (await getToken()), 'Content-Type': 'application/json' } });
}

/** Verify a webhook with PayPal's own endpoint. Returns true only on SUCCESS. */
export async function verifyWebhook(headers, rawBody) {
  const h = (k) => headers[k] || headers[k.toLowerCase()];
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return false;
  const j = await ppFetch('/v1/notifications/verify-webhook-signature', {
    method: 'POST', headers: { Authorization: 'Bearer ' + (await getToken()), 'Content-Type': 'application/json' },
    body: JSON.stringify({ auth_algo: h('paypal-auth-algo'), cert_url: h('paypal-cert-url'), transmission_id: h('paypal-transmission-id'), transmission_sig: h('paypal-transmission-sig'), transmission_time: h('paypal-transmission-time'), webhook_id: webhookId, webhook_event: JSON.parse(rawBody) }),
  });
  return j.verification_status === 'SUCCESS';
}

// Webhook event type -> our payout status. Note PayPal's names differ from item statuses (HELD vs ONHOLD, SUCCEEDED vs SUCCESS).
export const WEBHOOK_STATUS = {
  'PAYMENT.PAYOUTS-ITEM.SUCCEEDED': 'SUCCESS', 'PAYMENT.PAYOUTS-ITEM.FAILED': 'FAILED', 'PAYMENT.PAYOUTS-ITEM.UNCLAIMED': 'UNCLAIMED',
  'PAYMENT.PAYOUTS-ITEM.BLOCKED': 'BLOCKED', 'PAYMENT.PAYOUTS-ITEM.CANCELED': 'CANCELED', 'PAYMENT.PAYOUTS-ITEM.HELD': 'ONHOLD',
  'PAYMENT.PAYOUTS-ITEM.REFUNDED': 'REFUNDED', 'PAYMENT.PAYOUTS-ITEM.RETURNED': 'RETURNED',
};
