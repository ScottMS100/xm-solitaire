// Tiny static file server for local testing:  node tools/serve.mjs [port]
// Set HOST=0.0.0.0 to reach it from a phone on the same Wi-Fi (the install/offline features need https, though).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const port = Number(process.argv[2] || process.env.PORT || 8080);
const host = process.env.HOST || '127.0.0.1';
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.txt': 'text/plain',
};

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = normalize(join(root, p));
    if (!file.startsWith(root + sep) && file !== root) { res.writeHead(403).end('Forbidden'); return; }
    if (file.includes(`${sep}.`) || file.includes(`${sep}tests${sep}`) || file.includes(`${sep}tools${sep}`)) { res.writeHead(404).end('Not found'); return; }
    const st = await stat(file);
    if (!st.isFile()) throw new Error('not a file');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || (file.endsWith('LICENSE') ? 'text/plain' : 'application/octet-stream'), 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(port, host, () => console.log(`XM Solitaire running at http://${host === '0.0.0.0' ? 'localhost' : host}:${port}/`));
