// Local: runs the real handler behind node:http using the Function URL event shape.
// Loads ../../.env (PayPal sandbox) if present. STORE=memory by default; STORE=dynamo uses AWS.
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
const envp = new URL('../../../.env', import.meta.url).pathname;
if (existsSync(envp)) for (const l of readFileSync(envp, 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
process.env.STORE ??= 'memory';
const { handler } = await import('./src/handler.js');
const port = Number(process.env.PORT || 8787);
http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const u = new URL(req.url, 'http://x');
  const out = await handler({ rawPath: u.pathname, queryStringParameters: Object.fromEntries(u.searchParams), headers: req.headers, body: Buffer.concat(chunks).toString(), requestContext: { http: { method: req.method } } });
  res.writeHead(out.statusCode, out.headers); res.end(out.body);
}).listen(port, () => console.log('cancelled-op local API on http://localhost:' + port, 'store=' + process.env.STORE));
