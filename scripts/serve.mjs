import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const root = resolve('lumi-derm-website');
const host = process.env.HOST || '127.0.0.1';
const port = Number.parseInt(process.env.PORT || '8080', 10);

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.xml': 'application/xml; charset=utf-8',
};

async function resolveRequestPath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, `http://${host}`).pathname);
  const candidate = resolve(root, `.${pathname}`);

  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) return null;

  try {
    const details = await stat(candidate);
    return details.isDirectory() ? resolve(candidate, 'index.html') : candidate;
  } catch {
    return null;
  }
}

const server = createServer(async (request, response) => {
  const file = await resolveRequestPath(request.url || '/');
  if (!file) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found\n');
    return;
  }

  response.writeHead(200, {
    'Content-Type': contentTypes[extname(file).toLowerCase()] || 'application/octet-stream',
  });
  createReadStream(file).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Lumi Derm local site: http://${host}:${port}`);
});
