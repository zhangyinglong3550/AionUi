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

function aionBase() {
  return (process.env.AIONUI_BASE_URL || 'http://127.0.0.1:63695').replace(/\/$/, '');
}

function webuiBase() {
  return (process.env.AIONUI_WEBUI_BASE || 'http://127.0.0.1:25808').replace(/\/$/, '');
}

async function httpJson(method, urlPath, body) {
  const url = `${aionBase()}${urlPath}`;
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
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
      openUrl: `${webuiBase()}/#/conversation/${existing.conversationId}`,
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
    openUrl: `${webuiBase()}/#/conversation/${conversationId}`,
    mode: 'shared',
    workspace,
    source,
    note:
      'Shared binding: AionUi and CLI point at the same session_id (no history copy). Prefer only one writer at a time.',
  };
}
