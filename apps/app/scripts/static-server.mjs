// Serves the static export (out/) the way any static host would: /run → run.html.
// Used by the end-to-end tests; no dependencies.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? 'out');
const port = Number(process.argv[3] ?? 4173);
// The Content-Security-Policy CloudFront sends (infra/csp.json: app or site), so the tests run under it.
const policy = process.argv[4] ? JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../../infra/csp.json'), 'utf8'))[process.argv[4]] : null;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png' };

http
  .createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const base = path.join(root, url);
    if (!base.startsWith(root)) return res.writeHead(403).end();
    for (const p of [base, `${base}.html`, path.join(base, 'index.html')]) {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        res.writeHead(200, { 'content-type': TYPES[path.extname(p)] ?? 'application/octet-stream', ...(policy ? { 'content-security-policy': policy } : {}) });
        return fs.createReadStream(p).pipe(res);
      }
    }
    res.writeHead(404).end('not found');
  })
  .listen(port, () => console.log(`static export on http://localhost:${port}`));
