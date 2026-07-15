/**
 * Bind an external Claude/Codex/Grok CLI session into AionUi (shared session_id, not a copy).
 *
 * Flow:
 *  1. POST /api/conversations  → new AionUi shell
 *  2. UPDATE acp_session.session_id = external id  (before agent opens)
 *  3. POST .../runtime/ensure  → ACP session/load of that id
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadAionUiSessionIndex } from './match-aionui.js';
import { discoverLocalWebuiBase } from './discover-webui.js';

const AGENT = {
  codex: {
    agentId: '8e1acf31',
    assistantId: 'bare:8e1acf31',
    backend: 'codex',
    providerId: 'codex',
    agentSource: 'builtin',
    createMode: 'assistant', // { assistant: { id } }
  },
  claude: {
    agentId: '2d23ff1c',
    assistantId: 'bare:2d23ff1c',
    backend: 'claude',
    providerId: 'claude',
    agentSource: 'builtin',
    createMode: 'assistant',
  },
  // Custom ACP agent registered as "Grok Build" on this machine
  grok: {
    agentId: '8a0e0d1c',
    assistantId: null,
    backend: 'acp',
    providerId: null,
    agentSource: 'custom',
    createMode: 'type_acp_custom',
  },
};

function dataDir() {
  return process.env.AIONUI_DATA_DIR || path.join(process.env.HOME || os.homedir(), '.aionui');
}

function dbPath() {
  return path.join(dataDir(), 'aionui-backend.db');
}

/**
 * aioncore 每次启动用 --port 0，端口不固定。
 * 优先环境变量；否则从最新日志 AIONCORE_LISTENING / lsof 发现。
 */
function discoverAionBase() {
  if (process.env.AIONUI_BASE_URL) {
    return process.env.AIONUI_BASE_URL.replace(/\/$/, '');
  }

  // 1) 日志：.../Library/Logs/AionUi/YYYY/MM/DD/YYYY-MM-DD.log
  try {
    const logRoot = path.join(os.homedir(), 'Library', 'Logs', 'AionUi');
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const candidates = [
      path.join(logRoot, String(y), m, d, `${y}-${m}-${d}.log`),
      path.join(logRoot, `${y}-${m}-${d}.log`),
    ];
    for (const logFile of candidates) {
      if (!fs.existsSync(logFile)) continue;
      // 读尾部避免大文件
      const st = fs.statSync(logFile);
      const fd = fs.openSync(logFile, 'r');
      const size = Math.min(st.size, 256 * 1024);
      const buf = Buffer.alloc(size);
      fs.readSync(fd, buf, 0, size, Math.max(0, st.size - size));
      fs.closeSync(fd);
      const text = buf.toString('utf8');
      const matches = [...text.matchAll(/AIONCORE_LISTENING\s*\{[^}]*"port"\s*:\s*(\d+)/g)];
      if (matches.length) {
        const port = matches[matches.length - 1][1];
        return `http://127.0.0.1:${port}`;
      }
    }
  } catch {
    /* ignore */
  }

  // 2) lsof：aioncore LISTEN
  try {
    const out = execFileSync(
      'sh',
      ['-c', "lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | awk '/aioncore/ && /LISTEN/ {print $9}' | tail -1"],
      { encoding: 'utf8', timeout: 3000 }
    ).trim();
    const m = out.match(/:(\d+)\s*$/);
    if (m) return `http://127.0.0.1:${m[1]}`;
  } catch {
    /* ignore */
  }

  // 3) 兼容旧默认（几乎总会失败，仅兜底）
  return 'http://127.0.0.1:63695';
}

function aionBase() {
  return discoverAionBase();
}

function webuiBase(override) {
  if (override) return String(override).replace(/\/$/, '');
  return discoverLocalWebuiBase();
}

async function httpJson(method, urlPath, body) {
  const base = aionBase();
  const url = `${base}${urlPath}`;
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new Error(
      `无法连接 aioncore (${base}${urlPath}): ${e.message || e}。请确认 Mac 上 AionUi 已打开；若刚重启过 App，再点一次绑定。`
    );
  }
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON from ${url}: ${text.slice(0, 200)}`);
  }
  if (!data.success) {
    throw new Error(data.error || data.code || `Request failed ${res.status}`);
  }
  return data.data;
}

function sqliteRun(sql) {
  const db = dbPath();
  if (!fs.existsSync(db)) throw new Error(`AionUi DB not found: ${db}`);
  return execFileSync('sqlite3', [db, sql], { encoding: 'utf8' });
}

/**
 * Point acp_session at external session id (shared store, no file copy).
 * @param {string} conversationId
 * @param {string} sessionId
 * @param {{ agentId: string, agentSource: string }} agent
 */
export function writeAcpSessionBinding(conversationId, sessionId, agent) {
  const now = Date.now();
  const sid = sessionId.replace(/'/g, "''");
  const cid = conversationId.replace(/'/g, "''");
  const aid = agent.agentId.replace(/'/g, "''");
  const src = (agent.agentSource || 'builtin').replace(/'/g, "''");
  // create path usually inserts empty session_id row first
  sqliteRun(
    `INSERT INTO acp_session (conversation_id, agent_source, agent_id, session_id, session_status, session_config, last_active_at, suspended_at)
     VALUES ('${cid}', '${src}', '${aid}', '${sid}', 'idle', '{}', ${now}, NULL)
     ON CONFLICT(conversation_id) DO UPDATE SET
       session_id='${sid}',
       agent_id='${aid}',
       agent_source='${src}',
       session_status='idle',
       last_active_at=${now},
       suspended_at=NULL;`
  );
}

/**
 * @param {{
 *   source: 'claude'|'codex',
 *   sessionId: string,
 *   cwd?: string|null,
 *   title?: string|null,
 *   preview?: string|null,
 *   force?: boolean,
 * }} input
 */
export async function bindExternalSession(input) {
  const source = input.source;
  const sessionId = input.sessionId;
  if (!source || !sessionId) throw new Error('source and sessionId required');
  if (!AGENT[source]) {
    throw new Error(`Unsupported source: ${source} (supported: codex|claude|grok)`);
  }

  const agent = AGENT[source];
  const index = loadAionUiSessionIndex();
  const existing = index.get(sessionId);
  if (existing && !input.force) {
    return {
      alreadyBound: true,
      conversationId: existing.conversationId,
      sessionId,
      openUrl: `${webuiBase(input.webuiBase)}/#/conversation/${existing.conversationId}`,
      mode: 'shared',
      note: 'Already bound to an AionUi conversation (same session_id).',
    };
  }

  let workspace = input.cwd || process.cwd();
  // AionUi rejects missing workspace paths; fall back to home if temp/deleted cwd.
  try {
    if (!workspace || !fs.existsSync(workspace) || !fs.statSync(workspace).isDirectory()) {
      workspace = process.env.HOME || os.homedir();
    }
  } catch {
    workspace = process.env.HOME || os.homedir();
  }
  const short = sessionId.slice(0, 8);
  const name =
    (input.title && String(input.title).slice(0, 40)) ||
    `绑定·${source}·${short}`;

  const extra = {
    workspace,
    custom_workspace: true,
    backend: agent.backend,
    agent_id: agent.agentId,
    agent_source: agent.agentSource,
    external_session_id: sessionId,
    bound_external_session: true,
    bound_source: source,
  };
  if (agent.providerId) extra.provider_id = agent.providerId;

  /** @type {Record<string, unknown>} */
  let createBody;
  if (agent.createMode === 'type_acp_custom') {
    createBody = {
      type: 'acp',
      name,
      extra,
    };
  } else {
    createBody = {
      name,
      assistant: { id: agent.assistantId },
      extra,
    };
  }

  const created = await httpJson('POST', '/api/conversations', createBody);

  const conversationId = created.id;
  writeAcpSessionBinding(conversationId, sessionId, agent);

  // Trigger ACP session/load of the external id
  await httpJson('POST', `/api/conversations/${conversationId}/runtime/ensure`, {});

  // Verify session_id still points at external (not overwritten by session/new)
  const check = sqliteRun(
    `SELECT session_id FROM acp_session WHERE conversation_id='${conversationId.replace(/'/g, "''")}';`
  ).trim();
  if (check !== sessionId) {
    throw new Error(
      `Bind verification failed: expected session_id=${sessionId}, got=${check || '(empty)'}`
    );
  }

  return {
    alreadyBound: false,
    conversationId,
    sessionId,
    openUrl: `${webuiBase(input.webuiBase)}/#/conversation/${conversationId}`,
    mode: 'shared',
    workspace,
    source,
    note:
      'Shared binding: AionUi and CLI point at the same session_id (no history copy). Prefer only one writer at a time.',
  };
}
