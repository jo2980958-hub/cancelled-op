const base = import.meta.env.VITE_API_BASE || '';
async function req(method, path, body) {
  let r;
  try { r = await fetch(base + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }); }
  catch { throw new Error('The service cannot be reached. Check the connection and try again.'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `The request failed (${r.status}). Try again in a moment.`);
  return j;
}
export const api = {
  state: (ids = []) => req('GET', '/api/state' + (ids.length ? '?ids=' + ids.join(',') : '')),
  trust: (hospital) => req('GET', '/api/trust' + (hospital ? '?hospital=' + encodeURIComponent(hospital) : '')),
  create: (b) => req('POST', '/api/cases', b),
  get: (id) => req('GET', `/api/cases/${id}`),
  offer: (id, b) => req('POST', `/api/cases/${id}/offer`, b),
  offerAction: (id, oid, act, b) => req('POST', `/api/cases/${id}/offer/${oid}/${act}`, b || {}),
  claim: (id, narrative) => req('POST', `/api/cases/${id}/claim`, { narrative }),
  reply: (id, message) => req('POST', `/api/cases/${id}/claim/reply`, { message }),
  skip: (id) => req('POST', `/api/cases/${id}/claim/skip`),
  confirm: (id) => req('POST', `/api/cases/${id}/claim/confirm`),
  advance: (id, days) => req('POST', `/api/cases/${id}/advance`, { days }),
  email: (id, email) => req('POST', `/api/cases/${id}/email`, { email }),
  refresh: (id) => req('POST', `/api/cases/${id}/refresh`),
  remove: (id) => req('POST', `/api/cases/${id}/delete`),
  restore: () => req('POST', '/api/demo/restore'),
};
