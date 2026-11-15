// Serveur de test uniquement : reproduit un déploiement sous /calque/.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
const root = resolve('dist');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/calque/')) { res.writeHead(404); res.end(); return; }
  const path = resolve(root, decodeURIComponent(url.pathname.slice('/calque/'.length) || 'index.html'));
  if (!path.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
  try { const data = await readFile(path); res.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream'); res.end(data); }
  catch { res.writeHead(404); res.end(); }
}).listen(4173, '127.0.0.1', () => console.log('http://127.0.0.1:4173/calque/'));
