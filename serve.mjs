import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json',
};
const port = +process.env.PORT || 4173;

function loadRedirects() {
  const file = path.join('dist', '_redirects');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').map(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return null;
    const [from, to, code] = trimmed.split(/\s+/);
    if (!from || !to) return null;
    return { from, to, code: Number(code) || 301 };
  }).filter(Boolean);
}

const rules = loadRedirects();

function redirect(url) {
  const q = url.indexOf('?');
  const pathOnly = q < 0 ? url : url.slice(0, q);
  const search = q < 0 ? '' : url.slice(q);
  for (const rule of rules) {
    if (rule.from.includes('*')) {
      const prefix = rule.from.slice(0, rule.from.indexOf('*'));
      if (pathOnly.startsWith(prefix)) {
        const splat = pathOnly.slice(prefix.length);
        return { code: rule.code, location: rule.to.replace(':splat', splat) + search };
      }
    } else if (pathOnly === rule.from) {
      return { code: rule.code, location: rule.to + search };
    }
  }
  return null;
}

http.createServer((req, res) => {
  const dest = redirect(req.url || '/');
  if (dest) {
    res.writeHead(dest.code, { Location: dest.location });
    return res.end();
  }
  let p = path.join('dist', decodeURIComponent((req.url || '/').split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) {
    res.writeHead(404, { 'content-type': TYPES['.html'] });
    return res.end(fs.readFileSync('dist/404.html'));
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(p).pipe(res);
}).listen(port, () => console.log('http://localhost:' + port));
