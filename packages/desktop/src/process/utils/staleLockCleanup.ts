/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * 清理异常退出后残留的 migrate 锁，避免下次启动卡在 DB 迁移。
 * 必须在 backend 启动前调用；仅删除「当前无进程占用」的锁文件。
 */

import * as fs from 'fs';
import * as path from 'path';

export function clearStaleMigrateLock(userDataPath: string, log: (m: string) => void = console.log): void {
  const lockPath = path.join(userDataPath, 'aionui', 'aionui-backend.db.migrate.lock');
  try {
    if (!fs.existsSync(lockPath)) return;

    // 粗判：0 字节 + mtime 超过 2 分钟，或任意存在但无法确认占用时也尝试删除。
    // 同机多实例 E2E 可通过 AIONUI_KEEP_MIGRATE_LOCK=1 跳过。
    if (process.env.AIONUI_KEEP_MIGRATE_LOCK === '1') return;

    const stat = fs.statSync(lockPath);
    const ageMs = Date.now() - stat.mtimeMs;
    // 正在迁移的锁通常有写入方；残留锁常见为 0 字节且很旧
    if (stat.size === 0 || ageMs > 120_000) {
      fs.unlinkSync(lockPath);
      log(
        `[AionUi:locks] removed stale migrate.lock (size=${stat.size}, ageMs=${Math.round(ageMs)})`
      );
    }
  } catch (error) {
    log(`[AionUi:locks] clearStaleMigrateLock skipped: ${error}`);
  }
}
