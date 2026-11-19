// Serves the static export (out/) the way any static host would: /run → run.html.
// Used by the end-to-end tests; no dependencies.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? 'out');
const port = Number(process.argv[3] ?? 4173);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain', '.woff2': 'font/woff2' };

http
  .createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const base = path.join(root, url);
    if (!base.startsWith(root)) return res.writeHead(403).end();
    for (const p of [base, `${base}.html`, path.join(base, 'index.html')]) {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        res.writeHead(200, { 'content-type': TYPES[path.extname(p)] ?? 'application/octet-stream' });
        return fs.createReadStream(p).pipe(res);
      }
    }
    res.writeHead(404).end('not found');
  })
  .listen(port, () => console.log(`static export on http://localhost:${port}`));
