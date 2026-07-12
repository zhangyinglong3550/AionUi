/**
 * Scan Claude Code + Codex CLI session files on disk.
 * Paths (defaults under $HOME):
 *   Claude: ~/.claude/projects/<cwd-encoded>/<sessionId>.jsonl
 *   Codex:  ~/.codex/sessions/YYYY/MM/DD/rollout-...-<sessionId>.jsonl
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * @typedef {Object} ExternalSession
 * @property {'claude'|'codex'} source
 * @property {string} sessionId
 * @property {string} filePath
 * @property {string|null} cwd
 * @property {number} mtimeMs
 * @property {number} sizeBytes
 * @property {string|null} preview
 * @property {string|null} title
 * @property {string|null} originator
 * @property {boolean} fromAionUiHint
 */

function homeDir() {
  return process.env.HOME || os.homedir();
}

/** Decode Claude project folder name to a best-effort path display. */
export function decodeClaudeProjectDir(name) {
  if (!name || name === '.') return null;
  // Claude encodes absolute paths as -Users-foo-bar → /Users/foo/bar (lossy for hyphens in path)
  if (name.startsWith('-')) {
    return '/' + name.slice(1).replace(/-/g, '/');
  }
  return name.replace(/-/g, '/');
}

function readJsonlHeadTail(filePath, maxLines = 80) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split('\n').filter(Boolean);
  const head = lines.slice(0, Math.min(40, lines.length));
  const tail = lines.slice(Math.max(0, lines.length - maxLines));
  return { lines, head, tail };
}

function tryParse(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

/**
 * Extract a short human preview from Claude session jsonl.
 * @param {string} filePath
 * @returns {{ sessionId: string|null, preview: string|null, cwd: string|null, title: string|null }}
 */
export function summarizeClaudeFile(filePath) {
  const base = path.basename(filePath, '.jsonl');
  let sessionId = base;
  let preview = null;
  let title = null;
  const projectDir = path.basename(path.dirname(filePath));
  const cwd = decodeClaudeProjectDir(projectDir);

  try {
    const { head, tail } = readJsonlHeadTail(filePath, 120);
    for (const line of head) {
      const o = tryParse(line);
      if (!o) continue;
      if (o.sessionId && typeof o.sessionId === 'string') sessionId = o.sessionId;
      if (o.type === 'last-prompt' && o.leafUuid) {
        // keep scanning for real text
      }
    }
    // Walk recent lines for user text
    for (const line of [...head, ...tail].reverse()) {
      const o = tryParse(line);
      if (!o) continue;
      if (o.type === 'user' || o.role === 'user') {
        const t =
          o.message?.content?.[0]?.text ||
          o.message?.content ||
          o.content ||
          o.text ||
          null;
        if (typeof t === 'string' && t.trim()) {
          preview = t.replace(/\s+/g, ' ').trim().slice(0, 160);
          break;
        }
      }
      // common Claude transcript shape
      if (o.message?.role === 'user') {
        const c = o.message.content;
        const t = Array.isArray(c)
          ? c.map((x) => x?.text || '').join(' ')
          : typeof c === 'string'
            ? c
            : '';
        if (t.trim()) {
          preview = t.replace(/\s+/g, ' ').trim().slice(0, 160);
          break;
        }
      }
    }
    if (preview) title = preview.slice(0, 48);
  } catch {
    // ignore corrupt files
  }

  return { sessionId, preview, cwd, title };
}

/**
 * @param {string} filePath
 */
export function summarizeCodexFile(filePath) {
  let sessionId = null;
  let cwd = null;
  let preview = null;
  let originator = null;
  let title = null;

  // filename: rollout-...-<uuid>.jsonl
  const m = path.basename(filePath).match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
  );
  if (m) sessionId = m[1];

  try {
    const { head, tail } = readJsonlHeadTail(filePath, 100);
    for (const line of head) {
      const o = tryParse(line);
      if (!o) continue;
      if (o.type === 'session_meta' && o.payload) {
        sessionId = o.payload.session_id || o.payload.id || sessionId;
        cwd = o.payload.cwd || cwd;
        originator = o.payload.originator || originator;
      }
    }
    for (const line of [...head, ...tail].reverse()) {
      const o = tryParse(line);
      if (!o) continue;
      const p = o.payload;
      if (!p) continue;
      // user message variants
      if (p.type === 'message' && p.role === 'user') {
        const parts = p.content || [];
        const text = Array.isArray(parts)
          ? parts.map((x) => x.text || x.input_text || '').join(' ')
          : '';
        if (text.trim()) {
          preview = text.replace(/\s+/g, ' ').trim().slice(0, 160);
          break;
        }
      }
      if (p.role === 'user' && typeof p.content === 'string') {
        preview = p.content.replace(/\s+/g, ' ').trim().slice(0, 160);
        break;
      }
    }
    if (preview) title = preview.slice(0, 48);
  } catch {
    // ignore
  }

  return {
    sessionId,
    cwd,
    preview,
    originator,
    title,
    fromAionUiHint: String(originator || '').toLowerCase() === 'aionui',
  };
}

function walkFiles(root, predicate, out, maxFiles = 5000) {
  if (!fs.existsSync(root) || out.length >= maxFiles) return;
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (out.length >= maxFiles) break;
    const full = path.join(root, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === '.git') continue;
      walkFiles(full, predicate, out, maxFiles);
    } else if (ent.isFile() && predicate(full, ent.name)) {
      out.push(full);
    }
  }
}

/**
 * @param {{ home?: string, limit?: number }} [opts]
 * @returns {ExternalSession[]}
 */
export function scanClaudeSessions(opts = {}) {
  const home = opts.home || homeDir();
  const root = path.join(home, '.claude', 'projects');
  /** @type {string[]} */
  const files = [];
  walkFiles(root, (_p, name) => name.endsWith('.jsonl') && !name.includes('subagents'), files);
  const sessions = [];
  for (const filePath of files) {
    // skip agent subagent dirs already filtered; skip empty
    let st;
    try {
      st = fs.statSync(filePath);
    } catch {
      continue;
    }
    if (st.size < 20) continue;
    const s = summarizeClaudeFile(filePath);
    if (!s.sessionId) continue;
    sessions.push({
      source: 'claude',
      sessionId: s.sessionId,
      filePath,
      cwd: s.cwd,
      mtimeMs: st.mtimeMs,
      sizeBytes: st.size,
      preview: s.preview,
      title: s.title || s.sessionId.slice(0, 8),
      originator: null,
      fromAionUiHint: filePath.includes('AionUi') || filePath.includes('aionui'),
    });
  }
  sessions.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return typeof opts.limit === 'number' ? sessions.slice(0, opts.limit) : sessions;
}

/**
 * @param {{ home?: string, limit?: number }} [opts]
 * @returns {ExternalSession[]}
 */
export function scanCodexSessions(opts = {}) {
  const home = opts.home || homeDir();
  const root = path.join(home, '.codex', 'sessions');
  /** @type {string[]} */
  const files = [];
  walkFiles(root, (_p, name) => name.startsWith('rollout-') && name.endsWith('.jsonl'), files);
  const sessions = [];
  for (const filePath of files) {
    let st;
    try {
      st = fs.statSync(filePath);
    } catch {
      continue;
    }
    if (st.size < 20) continue;
    const s = summarizeCodexFile(filePath);
    if (!s.sessionId) continue;
    sessions.push({
      source: 'codex',
      sessionId: s.sessionId,
      filePath,
      cwd: s.cwd,
      mtimeMs: st.mtimeMs,
      sizeBytes: st.size,
      preview: s.preview,
      title: s.title || s.sessionId.slice(0, 8),
      originator: s.originator,
      fromAionUiHint: s.fromAionUiHint,
    });
  }
  sessions.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return typeof opts.limit === 'number' ? sessions.slice(0, opts.limit) : sessions;
}

/**
 * @param {{ home?: string, limit?: number, source?: 'all'|'claude'|'codex' }} [opts]
 */
export function scanAllSessions(opts = {}) {
  const source = opts.source || 'all';
  /** @type {ExternalSession[]} */
  let all = [];
  if (source === 'all' || source === 'claude') {
    all = all.concat(scanClaudeSessions({ home: opts.home }));
  }
  if (source === 'all' || source === 'codex') {
    all = all.concat(scanCodexSessions({ home: opts.home }));
  }
  all.sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (typeof opts.limit === 'number') all = all.slice(0, opts.limit);
  return all;
}

/**
 * Build shell resume command for a session.
 * @param {ExternalSession} s
 */
export function resumeCommand(s) {
  if (s.source === 'claude') {
    const cwdPart = s.cwd ? `cd ${shellQuote(s.cwd)} && ` : '';
    return `${cwdPart}claude --resume ${shellQuote(s.sessionId)}`;
  }
  const cwdPart = s.cwd ? `cd ${shellQuote(s.cwd)} && ` : '';
  return `${cwdPart}codex resume ${shellQuote(s.sessionId)}`;
}

function shellQuote(s) {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(s)) return s;
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}
