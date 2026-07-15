/**
 * Resolve which AionUi WebUI base URL to put in openUrl links.
 * Mac desktop (iframe on 127.0.0.1:18765) must use local WebUI, not Tailscale/Caddy.
 */

import { execFileSync } from 'node:child_process';

const LOCAL_DEFAULT = 'http://127.0.0.1:25808';
const REMOTE_DEFAULT = 'https://zhangyinglongmacbook-pro.tail2ec02b.ts.net:8443';

function stripSlash(url) {
  return String(url || '').replace(/\/$/, '');
}

function isLocalHost(host) {
  if (!host) return false;
  const h = host.split(':')[0].toLowerCase();
  return h === '127.0.0.1' || h === 'localhost' || h === '[::1]';
}

function isRemoteHost(host) {
  if (!host) return false;
  return host.includes('ts.net') || host.includes('tailscale');
}

/**
 * Detect local AionUi WebUI port (default 25808).
 * @returns {string}
 */
export function discoverLocalWebuiBase() {
  if (process.env.AIONUI_LOCAL_WEBUI_BASE) {
    return stripSlash(process.env.AIONUI_LOCAL_WEBUI_BASE);
  }
  try {
    const out = execFileSync(
      'sh',
      [
        '-c',
        "lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | awk '/AionUi/ && /LISTEN/ && /:25808/ {print $9; exit}'",
      ],
      { encoding: 'utf8', timeout: 2000 }
    ).trim();
    const m = out.match(/:(\d+)\s*$/);
    if (m) return `http://127.0.0.1:${m[1]}`;
  } catch {
    /* ignore */
  }
  return LOCAL_DEFAULT;
}

/**
 * Pick openUrl base from HTTP request context.
 * @param {import('node:http').IncomingMessage | undefined} req
 * @param {{ fallback?: string }} [opts]
 * @returns {string}
 */
export function resolveWebuiBase(req, opts = {}) {
  const env = process.env.AIONUI_WEBUI_BASE ? stripSlash(process.env.AIONUI_WEBUI_BASE) : '';
  const host = req?.headers?.host || '';
  const origin = req?.headers?.origin || '';
  const referer = req?.headers?.referer || '';

  const localCtx =
    isLocalHost(host) ||
    origin.includes('127.0.0.1') ||
    origin.includes('localhost') ||
    referer.includes('127.0.0.1') ||
    referer.includes('localhost');

  if (localCtx) {
    return discoverLocalWebuiBase();
  }

  if (isRemoteHost(host)) {
    return `https://${host.split('/')[0]}`;
  }
  if (origin.includes('ts.net')) {
    try {
      return stripSlash(new URL(origin).origin);
    } catch {
      /* ignore */
    }
  }
  if (referer.includes('ts.net')) {
    try {
      return stripSlash(new URL(referer).origin);
    } catch {
      /* ignore */
    }
  }

  if (opts.fallback) return stripSlash(opts.fallback);
  if (env) return env;
  return discoverLocalWebuiBase();
}

export { LOCAL_DEFAULT, REMOTE_DEFAULT };