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
  '.webp': 'image/webp',
};
const port = +process.env.PORT || 4173;
const ROOT = path.resolve('dist');

function loadRedirects() {
  const file = path.join(ROOT, '_redirects');
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
        return { code: rule.code, location: rule.to.replace(':splat', splat) + (rule.to.includes('?') ? '' : search) };
      }
    } else if (pathOnly === rule.from) {
      return { code: rule.code, location: rule.to + (rule.to.includes('?') ? '' : search) };
    }
  }
  return null;
}

function safeJoin(urlPath) {
  let rel;
  try { rel = decodeURIComponent(urlPath).replace(/^\/+/, ''); } catch { return null; }
  const abs = path.resolve(ROOT, rel);
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) return null;
  return abs;
}
const isFile = file => !!(file && fs.existsSync(file) && fs.statSync(file).isFile());
const isDir = file => !!(file && fs.existsSync(file) && fs.statSync(file).isDirectory());

// Same HTML routing as Cloudflare Pages: /x.html is served at /x, and /x/ plus /x.html
// each 308 once to /x when dist/x/index.html does not exist. Directory indexes keep the slash.
function resolve(pathname) {
  if (pathname === '/' || pathname === '') return { file: path.join(ROOT, 'index.html'), status: 200 };
  if (pathname === '/index.html') return { redirect: '/', code: 308 };
  if (pathname.endsWith('/index.html')) {
    const file = safeJoin(pathname);
    if (isFile(file)) return { redirect: pathname.slice(0, -'index.html'.length), code: 308 };
  } else if (pathname.endsWith('.html')) {
    const file = safeJoin(pathname);
    if (isFile(file)) {
      const bare = pathname.slice(0, -'.html'.length);
      return { redirect: bare === '/index' ? '/' : bare, code: 308 };
    }
  }
  if (pathname.endsWith('/')) {
    const dir = safeJoin(pathname);
    if (dir && isFile(path.join(dir, 'index.html'))) return { file: path.join(dir, 'index.html'), status: 200 };
    const bare = pathname.length > 1 ? pathname.slice(0, -1) : '/';
    const html = safeJoin((bare === '/' ? '/index' : bare) + '.html');
    if (isFile(html)) return { redirect: bare, code: 308 };
  } else {
    const asDir = safeJoin(pathname);
    if (isDir(asDir) && isFile(path.join(asDir, 'index.html'))) return { redirect: pathname + '/', code: 308 };
    const html = safeJoin(pathname + '.html');
    if (isFile(html)) return { file: html, status: 200 };
    const file = safeJoin(pathname);
    if (isFile(file)) return { file, status: 200 };
  }
  return null;
}

function notFoundFile() {
  const file = path.join(ROOT, '404.html');
  return isFile(file) ? file : null;
}

http.createServer((req, res) => {
  const raw = req.url || '/';
  const dest = redirect(raw);
  if (dest) {
    res.writeHead(dest.code, { Location: dest.location });
    return res.end();
  }
  const q = raw.indexOf('?');
  let pathname = q < 0 ? raw : raw.slice(0, q);
  const search = q < 0 ? '' : raw.slice(q);
  try { pathname = decodeURIComponent(pathname); } catch {
    res.writeHead(400);
    return res.end();
  }
  const hit = resolve(pathname);
  if (hit?.redirect) {
    res.writeHead(hit.code, { Location: hit.redirect + search });
    return res.end();
  }
  if (hit?.file && isFile(hit.file)) {
    res.writeHead(hit.status, { 'content-type': TYPES[path.extname(hit.file)] || 'application/octet-stream' });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(hit.file).pipe(res);
  }
  const missing = notFoundFile();
  res.writeHead(404, { 'content-type': TYPES['.html'] });
  res.end(missing ? fs.readFileSync(missing) : '404');
}).listen(port, () => console.log('http://localhost:' + port));
