#!/usr/bin/env node
/**
 * CLI: list / serve external Claude Code & Codex sessions.
 *
 *   node src/cli.js list [--limit N] [--source all|claude|codex]
 *   node src/cli.js serve [--port 18765] [--host 127.0.0.1] [--webui-base URL]
 */

import { scanAllSessions, resumeCommand } from './scan.js';
import { loadAionUiSessionIndex, enrichWithAionUi } from './match-aionui.js';
import { bindExternalSession } from './bind.js';
import { startServer } from './server.js';

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit') args.limit = Number(argv[++i]);
    else if (a === '--source') args.source = argv[++i];
    else if (a === '--port') args.port = Number(argv[++i]);
    else if (a === '--host') args.host = argv[++i];
    else if (a === '--webui-base') args.webuiBase = argv[++i];
    else if (a === '--token') args.token = argv[++i];
    else if (a === '--session-id') args.sessionId = argv[++i];
    else if (a === '--cwd') args.cwd = argv[++i];
    else if (a === '--force') args.force = true;
    else if (a === '--json') args.json = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (!a.startsWith('-')) args._.push(a);
  }
  return args;
}

function printHelp() {
  console.log(`aionui-external-sessions

Commands:
  list   Scan Claude/Codex sessions and show AionUi matches
  serve  Start a small web UI (mobile-friendly)
  bind   Bind a CLI session into AionUi (shared session_id, not a copy)

Options:
  --limit N
  --source all|claude|codex
  --session-id UUID
  --cwd PATH
  --force
  --port 18765
  --host 127.0.0.1
  --webui-base http://127.0.0.1:25808
  --token SECRET
  --json

Examples:
  node src/cli.js bind --source codex --session-id 019f... --cwd /path/to/project
  node src/cli.js serve --port 18765
`);
}

function listCmd(args) {
  const limit = args.limit || 40;
  const source = args.source || 'all';
  const webuiBase = args.webuiBase || process.env.AIONUI_WEBUI_BASE;
  const raw = scanAllSessions({ limit: limit * 2, source });
  const index = loadAionUiSessionIndex();
  const rows = enrichWithAionUi(raw, index, { webuiBase }).slice(0, limit);

  if (args.json) {
    console.log(JSON.stringify({ count: rows.length, sessions: rows }, null, 2));
    return;
  }

  console.log(`Found ${rows.length} session(s) (source=${source})\n`);
  for (const s of rows) {
    const when = new Date(s.mtimeMs).toLocaleString();
    const match = s.aionui.canOpenInAionUi ? `AionUi:${s.aionui.conversationId}` : 'CLI-only';
    console.log(`[${s.source}] ${s.sessionId}`);
    console.log(`  time: ${when}  match: ${match}${s.fromAionUiHint ? '  (origin AionUi)' : ''}`);
    if (s.cwd) console.log(`  cwd:  ${s.cwd}`);
    if (s.preview) console.log(`  preview: ${s.preview}`);
    if (s.aionui.openUrl) console.log(`  open: ${s.aionui.openUrl}`);
    else console.log(`  resume: ${resumeCommand(s)}`);
    console.log('');
  }
}

async function bindCmd(args) {
  const source = args.source;
  const sessionId = args.sessionId || args._[1];
  if (!source || (source !== 'codex' && source !== 'claude')) {
    console.error('bind requires --source codex|claude');
    process.exit(1);
  }
  if (!sessionId) {
    console.error('bind requires --session-id');
    process.exit(1);
  }
  // Prefer cwd from scan if not provided
  let cwd = args.cwd;
  let title = null;
  if (!cwd) {
    const hit = scanAllSessions({ source, limit: 500 }).find((s) => s.sessionId === sessionId);
    if (hit) {
      cwd = hit.cwd;
      title = hit.preview || hit.title;
    }
  }
  if (args.webuiBase) process.env.AIONUI_WEBUI_BASE = args.webuiBase;
  const result = await bindExternalSession({
    source,
    sessionId,
    cwd,
    title,
    force: !!args.force,
  });
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(result.alreadyBound ? 'Already bound' : 'Bound (shared session_id)');
    console.log(`  conversation: ${result.conversationId}`);
    console.log(`  session:      ${result.sessionId}`);
    console.log(`  open:         ${result.openUrl}`);
    console.log(`  note:         ${result.note}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.length === 0) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }
  const cmd = args._[0];
  if (cmd === 'list') listCmd(args);
  else if (cmd === 'serve') {
    await startServer({
      host: args.host || '127.0.0.1',
      port: args.port || 18765,
      webuiBase: args.webuiBase || process.env.AIONUI_WEBUI_BASE,
      token: args.token || process.env.EXTERNAL_SESSIONS_TOKEN,
    });
  } else if (cmd === 'bind') {
    await bindCmd(args);
  } else {
    console.error(`Unknown command: ${cmd}`);
    printHelp();
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
