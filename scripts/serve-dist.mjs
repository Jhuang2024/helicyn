/** Production preview server: static assets, legacy redirects, and safe SPA fallback. */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const port = Number(process.argv[2] || 4188);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.pdf': 'application/pdf', '.ico': 'image/x-icon' };
const redirectRules = (await readFile(resolve(dist, '_redirects'), 'utf8')).split('\n').map((line) => line.trim().split(/\s+/)).filter((rule) => rule.length === 3 && rule[2] === '301');
const server = http.createServer(async (req, res) => {
  try {
    const [rawPath = '/', query] = (req.url || '/').split('?');
    const p = decodeURIComponent(rawPath);
    const rule = redirectRules.find(([from]) => decodeURIComponent(from) === p);
    if (rule) { res.writeHead(301, { location: rule[1] + (query ? '?' + query : '') }); res.end(); return; }
    let fp = resolve(dist, '.' + p);
    if (fp !== dist && !fp.startsWith(dist + sep)) { res.writeHead(403); res.end('forbidden'); return; }
    try { if ((await stat(fp)).isDirectory()) fp = resolve(fp, 'index.html'); }
    catch { if (!extname(p)) fp = resolve(dist, 'index.html'); }
    const data = await readFile(fp);
    res.writeHead(200, { 'content-type': types[extname(fp)] || 'application/octet-stream' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404); res.end('not found'); }
});
server.listen(port, '127.0.0.1', () => console.log(`serve-dist on ${port}`));
