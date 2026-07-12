/**
 * Match external CLI session IDs to AionUi conversations via acp_session table.
 * Uses sqlite3 CLI if available, otherwise a minimal pure-JS reader for the simple query.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

function defaultDataDir() {
  return process.env.AIONUI_DATA_DIR || path.join(process.env.HOME || os.homedir(), '.aionui');
}

/**
 * @param {string} [dataDir]
 * @returns {Map<string, { conversationId: string, agentId: string, sessionStatus: string }>}
 */
export function loadAionUiSessionIndex(dataDir = defaultDataDir()) {
  const dbPath = path.join(dataDir, 'aionui-backend.db');
  /** @type {Map<string, { conversationId: string, agentId: string, sessionStatus: string }>} */
  const map = new Map();
  if (!fs.existsSync(dbPath)) return map;

  // Prefer sqlite3 binary (available on most macOS dev machines via brew or system)
  try {
    const sql =
      "SELECT conversation_id, agent_id, session_id, session_status FROM acp_session WHERE session_id IS NOT NULL AND session_id != '';";
    const out = execFileSync('sqlite3', ['-readonly', '-separator', '\t', dbPath, sql], {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    });
    for (const line of out.split('\n')) {
      if (!line.trim()) continue;
      const [conversationId, agentId, sessionId, sessionStatus] = line.split('\t');
      if (sessionId) {
        map.set(sessionId, {
          conversationId,
          agentId: agentId || '',
          sessionStatus: sessionStatus || '',
        });
      }
    }
    return map;
  } catch {
    // fallback: empty — still allow listing without match
    return map;
  }
}

/**
 * @param {import('./scan.js').ExternalSession[]} sessions
 * @param {Map<string, { conversationId: string, agentId: string, sessionStatus: string }>} index
 * @param {{ webuiBase?: string }} [opts]
 */
export function enrichWithAionUi(sessions, index, opts = {}) {
  const webuiBase = (opts.webuiBase || process.env.AIONUI_WEBUI_BASE || 'http://127.0.0.1:25808').replace(
    /\/$/,
    ''
  );
  return sessions.map((s) => {
    const hit = index.get(s.sessionId) || null;
    return {
      ...s,
      aionui: hit
        ? {
            conversationId: hit.conversationId,
            agentId: hit.agentId,
            sessionStatus: hit.sessionStatus,
            openUrl: `${webuiBase}/#/conversation/${hit.conversationId}`,
            canOpenInAionUi: true,
          }
        : {
            conversationId: null,
            agentId: null,
            sessionStatus: null,
            openUrl: null,
            canOpenInAionUi: false,
          },
    };
  });
}
