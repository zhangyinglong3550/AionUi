/**
 * Minimal HTTP server: list external sessions + open matched AionUi conversations.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { scanAllSessions, resumeCommand } from './scan.js';
import { loadAionUiSessionIndex, enrichWithAionUi } from './match-aionui.js';
import { bindExternalSession } from './bind.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, '..', 'public');

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function text(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function parseQuery(url) {
  const u = new URL(url, 'http://localhost');
  return u;
}

function authOk(req, url, token) {
  if (!token) return true;
  const q = url.searchParams.get('token');
  const h = req.headers['x-external-sessions-token'];
  return q === token || h === token;
}

/**
 * @param {{ host?: string, port?: number, webuiBase?: string, token?: string }} opts
 */
export function startServer(opts = {}) {
  const host = opts.host || '127.0.0.1';
  const port = opts.port || 18765;
  const webuiBase = (opts.webuiBase || process.env.AIONUI_WEBUI_BASE || 'http://127.0.0.1:25808').replace(
    /\/$/,
    ''
  );
  const token = opts.token || process.env.EXTERNAL_SESSIONS_TOKEN || crypto.randomBytes(12).toString('hex');

  const server = http.createServer((req, res) => {
    const url = parseQuery(req.url || '/');
    if (!authOk(req, url, token)) {
      return json(res, 401, { error: 'unauthorized', hint: 'pass ?token=...' });
    }

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
      return text(res, 200, html, 'text/html; charset=utf-8');
    }

    if (req.method === 'GET' && url.pathname === '/api/health') {
      return json(res, 200, { ok: true, webuiBase });
    }

    if (req.method === 'GET' && url.pathname === '/api/sessions') {
      const limit = Math.min(200, Number(url.searchParams.get('limit') || 50));
      const source = url.searchParams.get('source') || 'all';
      const q = (url.searchParams.get('q') || '').trim().toLowerCase();
      const raw = scanAllSessions({ limit: 500, source });
      const index = loadAionUiSessionIndex();
      let rows = enrichWithAionUi(raw, index, { webuiBase });
      if (q) {
        rows = rows.filter((s) => {
          const blob = [s.sessionId, s.cwd, s.preview, s.title, s.source].join(' ').toLowerCase();
          return blob.includes(q);
        });
      }
      rows = rows.slice(0, limit).map((s) => ({
        ...s,
        resumeCommand: resumeCommand(s),
        mtime: new Date(s.mtimeMs).toISOString(),
        canBind: !s.aionui.canOpenInAionUi && (s.source === 'codex' || s.source === 'claude'),
      }));
      return json(res, 200, {
        count: rows.length,
        webuiBase,
        matched: rows.filter((r) => r.aionui.canOpenInAionUi).length,
        sessions: rows,
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/bind') {
      readBody(req)
        .then(async (body) => {
          const result = await bindExternalSession({
            source: body.source,
            sessionId: body.sessionId,
            cwd: body.cwd,
            title: body.title || body.preview,
            force: !!body.force,
          });
          json(res, 200, { success: true, data: result });
        })
        .catch((e) => {
          json(res, 400, { success: false, error: String(e.message || e) });
        });
      return;
    }

    return json(res, 404, { error: 'not found' });
  });

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const base = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`;
      console.log(`[external-cli-sessions] listening on http://${host}:${port}`);
      console.log(`[external-cli-sessions] open ${base}/?token=${token}`);
      console.log(`[external-cli-sessions] AionUi WebUI base: ${webuiBase}`);
      console.log(`[external-cli-sessions] token: ${token}`);
      resolve(server);
    });
  });
}
