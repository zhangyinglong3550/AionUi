import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  decodeClaudeProjectDir,
  decodeGrokCwdDir,
  summarizeClaudeFile,
  summarizeCodexFile,
  summarizeGrokSessionDir,
  scanClaudeSessions,
  scanCodexSessions,
  scanGrokSessions,
  resumeCommand,
} from '../src/scan.js';

describe('decodeClaudeProjectDir', () => {
  it('decodes leading-dash absolute path encoding', () => {
    const d = decodeClaudeProjectDir('-Users-zhangyinglong-code');
    assert.equal(d, '/Users/zhangyinglong/code');
  });
});

describe('summarizeClaudeFile', () => {
  it('reads sessionId and user preview from fixture jsonl', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-sess-'));
    const project = path.join(dir, '.claude', 'projects', '-Users-demo-app');
    fs.mkdirSync(project, { recursive: true });
    const sid = '11111111-2222-3333-4444-555555555555';
    const file = path.join(project, `${sid}.jsonl`);
    const lines = [
      JSON.stringify({ type: 'last-prompt', sessionId: sid }),
      JSON.stringify({
        type: 'user',
        message: { role: 'user', content: [{ type: 'text', text: 'fix the login bug please' }] },
        sessionId: sid,
      }),
    ];
    fs.writeFileSync(file, lines.join('\n') + '\n');
    // summarize uses absolute path; inject by reading file with project dir name
    const s = summarizeClaudeFile(file);
    assert.equal(s.sessionId, sid);
    assert.match(s.preview || '', /login bug/i);
    assert.equal(s.cwd, '/Users/demo/app');
  });
});

describe('summarizeCodexFile', () => {
  it('reads session_meta and user message', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-sess-'));
    const sid = '019f55bd-e747-72a2-a89f-ea40f814d324';
    const file = path.join(dir, `rollout-2026-07-12T17-52-16-${sid}.jsonl`);
    const lines = [
      JSON.stringify({
        type: 'session_meta',
        payload: {
          session_id: sid,
          cwd: '/Users/demo/code',
          originator: 'AionUi',
        },
      }),
      JSON.stringify({
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'continue the debate outline' }],
        },
      }),
    ];
    fs.writeFileSync(file, lines.join('\n') + '\n');
    const s = summarizeCodexFile(file);
    assert.equal(s.sessionId, sid);
    assert.equal(s.cwd, '/Users/demo/code');
    assert.equal(s.fromAionUiHint, true);
    assert.match(s.preview || '', /debate/i);
  });
});

describe('grok session summarize', () => {
  it('decodes cwd and reads summary/title', () => {
    assert.equal(decodeGrokCwdDir('%2FUsers%2Fdemo'), '/Users/demo');
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'grok-sess-'));
    const gsid = '019f1111-2222-3333-4444-555555555555';
    const dir = path.join(home, '.grok', 'sessions', encodeURIComponent('/Users/demo/app'), gsid);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'summary.json'),
      JSON.stringify({
        info: { id: gsid, cwd: '/Users/demo/app' },
        generated_title: 'Demo Grok Session',
        updated_at: '2026-07-12T10:00:00.000Z',
      })
    );
    fs.writeFileSync(
      path.join(dir, 'chat_history.jsonl'),
      JSON.stringify({
        type: 'user',
        content: '<user_query>\nhello from grok fixture\n</user_query>',
      }) + '\n'
    );
    const s = summarizeGrokSessionDir(dir);
    assert.equal(s.sessionId, gsid);
    assert.equal(s.cwd, '/Users/demo/app');
    assert.equal(s.title, 'Demo Grok Session');
    assert.match(s.preview || '', /hello from grok/i);

    const listed = scanGrokSessions({ home, limit: 5 });
    assert.ok(listed.some((x) => x.sessionId === gsid));
    assert.match(resumeCommand(listed[0]), /grok --resume/);
  });
});

describe('scan + resumeCommand', () => {
  it('scans fixture trees', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'home-sess-'));
    const claudeProject = path.join(home, '.claude', 'projects', '-Users-demo-app');
    fs.mkdirSync(claudeProject, { recursive: true });
    const csid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    fs.writeFileSync(
      path.join(claudeProject, `${csid}.jsonl`),
      JSON.stringify({ type: 'user', message: { role: 'user', content: 'hello claude' }, sessionId: csid }) +
        '\n'
    );

    const codexDay = path.join(home, '.codex', 'sessions', '2026', '07', '12');
    fs.mkdirSync(codexDay, { recursive: true });
    const xsid = '019f0000-1111-2222-3333-444444444444';
    fs.writeFileSync(
      path.join(codexDay, `rollout-2026-07-12T10-00-00-${xsid}.jsonl`),
      JSON.stringify({
        type: 'session_meta',
        payload: { session_id: xsid, cwd: '/tmp/x', originator: 'cli' },
      }) +
        '\n' +
        JSON.stringify({
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: 'hello codex' }],
          },
        }) +
        '\n'
    );

    const claude = scanClaudeSessions({ home, limit: 10 });
    const codex = scanCodexSessions({ home, limit: 10 });
    assert.ok(claude.some((s) => s.sessionId === csid));
    assert.ok(codex.some((s) => s.sessionId === xsid));

    const r1 = resumeCommand(claude[0]);
    assert.match(r1, /claude --resume/);
    const r2 = resumeCommand(codex[0]);
    assert.match(r2, /codex resume/);
  });
});
