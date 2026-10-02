import { readFileSync, existsSync } from 'node:fs';
const p = new URL('../../../../.env', import.meta.url).pathname;
if (existsSync(p)) for (const l of readFileSync(p, 'utf8').split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
