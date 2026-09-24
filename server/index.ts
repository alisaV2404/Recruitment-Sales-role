// Second Look HTTP server: static client files + JSON API for model calls.
// No third-party dependencies; Node 20+.

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeAnswer, analyzeReport } from './analysis.js';
import { selectProvider } from './providers/index.js';
import { ProviderError } from './providers/types.js';
import type { ApiError, StatusResponse } from '../shared/types.js';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const PUBLIC_DIR = join(ROOT, 'public');
const CLIENT_DIR = join(ROOT, 'build', 'client');
const MAX_BODY = 3 * 1024 * 1024;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
};

const { provider, reason } = selectProvider();

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(data);
}

function sendError(res: ServerResponse, status: number, code: string, message: string, retryable: boolean) {
  const body: ApiError = { error: { code, message, retryable } };
  sendJson(res, status, body);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new ProviderError('too_large', 'Request body is too large.', false, 413);
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ProviderError('bad_json', 'Request body is not valid JSON.', false, 400);
  }
}

async function serveStatic(res: ServerResponse, urlPath: string) {
  let base = PUBLIC_DIR;
  let rel = urlPath;
  if (urlPath.startsWith('/app/')) {
    base = CLIENT_DIR;
    rel = urlPath.slice('/app'.length);
  }
  if (rel === '/' || rel === '') rel = '/index.html';
  const target = normalize(join(base, decodeURIComponent(rel)));
  if (!target.startsWith(base + sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const st = await stat(target);
    if (!st.isFile()) throw new Error('not a file');
    const data = await readFile(target);
    res.writeHead(200, {
      'content-type': MIME[extname(target)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
      'x-content-type-options': 'nosniff',
    });
    res.end(data);
  } catch {
    // Single-page app: unknown non-asset paths fall back to index.html
    if (!extname(rel)) return serveStatic(res, '/index.html');
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  try {
    if (url.pathname === '/api/status' && req.method === 'GET') {
      const body: StatusResponse = {
        live: !!provider,
        provider: provider?.name ?? null,
        model: provider?.model ?? null,
        reason,
      };
      return sendJson(res, 200, body);
    }
    if (url.pathname === '/api/analyze' || url.pathname === '/api/analyze-answer') {
      if (req.method !== 'POST') return sendError(res, 405, 'method', 'Use POST.', false);
      if (!provider) {
        return sendError(res, 503, 'not_configured', `Live AI is not configured: ${reason}`, false);
      }
      const body = (await readJson(req)) as any;
      const abort = new AbortController();
      res.on('close', () => {
        if (!res.writableEnded) abort.abort();
      });
      const started = Date.now();
      const out =
        url.pathname === '/api/analyze'
          ? await analyzeReport(provider, body, abort.signal)
          : await analyzeAnswer(provider, body, abort.signal);
      console.log(`${url.pathname} ok in ${((Date.now() - started) / 1000).toFixed(1)}s`);
      return sendJson(res, 200, out);
    }
    if (url.pathname.startsWith('/api/')) return sendError(res, 404, 'not_found', 'Unknown endpoint.', false);
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendError(res, 405, 'method', 'Method not allowed.', false);
    await serveStatic(res, url.pathname);
  } catch (err) {
    if (err instanceof ProviderError) {
      console.warn(`${url.pathname} failed: ${err.code} ${err.message}`);
      return sendError(res, err.status, err.code, err.message, err.retryable);
    }
    console.error(err);
    return sendError(res, 500, 'internal', 'Unexpected server error.', true);
  }
});

const port = Number(process.env.PORT) || 5173;
server.listen(port, () => {
  console.log(`Second Look running at http://localhost:${port}`);
  console.log(provider ? `Live AI: ${provider.name} / ${provider.model}` : `Live AI disabled (${reason}). Demo mode only.`);
});
