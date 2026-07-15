/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { clearStaleMigrateLock } from '@/process/utils/staleLockCleanup';

describe('clearStaleMigrateLock', () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-lock-'));
  const lockDir = path.join(userData, 'aionui');
  const lockPath = path.join(lockDir, 'aionui-backend.db.migrate.lock');

  beforeEach(() => {
    fs.mkdirSync(lockDir, { recursive: true });
    delete process.env.AIONUI_KEEP_MIGRATE_LOCK;
  });

  afterEach(() => {
    try {
      fs.rmSync(userData, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('removes zero-byte migrate.lock', () => {
    fs.writeFileSync(lockPath, '');
    clearStaleMigrateLock(userData, () => {});
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('skips when AIONUI_KEEP_MIGRATE_LOCK=1', () => {
    fs.writeFileSync(lockPath, '');
    process.env.AIONUI_KEEP_MIGRATE_LOCK = '1';
    clearStaleMigrateLock(userData, () => {});
    expect(fs.existsSync(lockPath)).toBe(true);
  });

  it('no-ops when lock missing', () => {
    expect(() => clearStaleMigrateLock(userData, () => {})).not.toThrow();
  });
});
