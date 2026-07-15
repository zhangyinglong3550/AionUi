/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { startDetachedStartupWatchdog } from '@/process/utils/detachedStartupWatchdog';

const spawnMock = vi.fn();

vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

describe('startDetachedStartupWatchdog', () => {
  const tmpReady = path.join(os.tmpdir(), `aionui-wd-test-${process.pid}-${Date.now()}`);

  beforeEach(() => {
    spawnMock.mockReset();
    spawnMock.mockReturnValue({ unref: vi.fn() });
    try {
      if (fs.existsSync(tmpReady)) fs.unlinkSync(tmpReady);
    } catch {
      // ignore
    }
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tmpReady)) fs.unlinkSync(tmpReady);
    } catch {
      // ignore
    }
  });

  it('does not spawn when disabled', () => {
    const handle = startDetachedStartupWatchdog({ enabled: false, readyFile: tmpReady });
    expect(spawnMock).not.toHaveBeenCalled();
    handle.markReady();
    expect(fs.existsSync(tmpReady)).toBe(false);
  });

  it('spawns detached bash watchdog and markReady writes file', () => {
    const handle = startDetachedStartupWatchdog({
      enabled: true,
      timeoutMs: 5000,
      readyFile: tmpReady,
      log: () => {},
    });

    expect(spawnMock).toHaveBeenCalledOnce();
    const [cmd, args, opts] = spawnMock.mock.calls[0];
    expect(cmd).toBe('/bin/bash');
    expect(args[0]).toBe('-c');
    expect(opts.detached).toBe(true);
    expect(opts.env.AIONUI_WD_PID).toBe(String(process.pid));
    expect(opts.env.AIONUI_WD_READY).toBe(tmpReady);
    expect(opts.env.AIONUI_WD_TIMEOUT).toBe('5');

    handle.markReady();
    expect(fs.existsSync(tmpReady)).toBe(true);
    handle.markReady(); // idempotent
    handle.dispose();
  });
});
