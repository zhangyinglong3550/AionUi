/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * 独立 OS 进程看门狗：不依赖 Electron 主线程事件循环。
 *
 * 背景：StartupRecovery 使用 setTimeout，若主线程在同步 bootstrap 中卡死，
 * 定时器永不触发，单例锁一直被占 → Dock 有图标无窗口。
 *
 * 策略：拿到单例锁后立刻 fork 一个 detached bash 子进程；
 * 超时后若 ready 文件仍未出现且父进程仍存活 → SIGTERM/SIGKILL 父进程，
 * 释放 SingletonLock，用户下次点击可冷启动。
 */

import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export type DetachedStartupWatchdogOptions = {
  /** 超时毫秒，默认 75s（略长于 StartupRecovery 的 45s） */
  timeoutMs?: number;
  /** ready 标记文件路径；默认 os.tmpdir()/aionui-startup-ready-<pid> */
  readyFile?: string;
  /** 是否启用，E2E / WebUI 模式应关闭 */
  enabled?: boolean;
  log?: (message: string) => void;
};

export type DetachedStartupWatchdogHandle = {
  markReady: () => void;
  dispose: () => void;
  readyFile: string;
};

const DEFAULT_TIMEOUT_MS = 75_000;

function writeReadyFile(readyFile: string, log?: (m: string) => void): void {
  try {
    fs.writeFileSync(readyFile, `${Date.now()}\n`, 'utf-8');
  } catch (error) {
    log?.(`[AionUi:detached-watchdog] markReady failed: ${error}`);
  }
}

/**
 * 在拿到 single-instance lock 之后尽早调用。
 * 返回的 markReady 应在主窗口可用 / startup completed 时调用。
 */
export function startDetachedStartupWatchdog(
  options: DetachedStartupWatchdogOptions = {}
): DetachedStartupWatchdogHandle {
  const log = options.log ?? console.log;
  const enabled = options.enabled ?? true;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const readyFile =
    options.readyFile ?? path.join(os.tmpdir(), `aionui-startup-ready-${process.pid}`);

  const noop: DetachedStartupWatchdogHandle = {
    markReady: () => {},
    dispose: () => {},
    readyFile,
  };

  if (!enabled) {
    return noop;
  }

  // 清理上次残留 ready 文件（同 path 复用时）
  try {
    if (fs.existsSync(readyFile)) fs.unlinkSync(readyFile);
  } catch {
    // ignore
  }

  const parentPid = process.pid;
  const timeoutSec = Math.max(1, Math.ceil(timeoutMs / 1000));

  // 纯 bash：不依赖被卡住的 Node 事件循环
  const script = `
set +e
READY_FILE="$AIONUI_WD_READY"
PARENT_PID="$AIONUI_WD_PID"
TIMEOUT_SEC="$AIONUI_WD_TIMEOUT"
sleep "$TIMEOUT_SEC"
if [ -f "$READY_FILE" ]; then
  rm -f "$READY_FILE" 2>/dev/null
  exit 0
fi
if kill -0 "$PARENT_PID" 2>/dev/null; then
  echo "[AionUi:detached-watchdog] timeout ${timeoutSec}s; killing hung parent pid=$PARENT_PID" >&2
  kill -TERM "$PARENT_PID" 2>/dev/null
  sleep 2
  if kill -0 "$PARENT_PID" 2>/dev/null; then
    kill -KILL "$PARENT_PID" 2>/dev/null
  fi
fi
rm -f "$READY_FILE" 2>/dev/null
exit 0
`.trim();

  let child: ChildProcess | null = null;
  try {
    child = spawn('/bin/bash', ['-c', script], {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        AIONUI_WD_READY: readyFile,
        AIONUI_WD_PID: String(parentPid),
        AIONUI_WD_TIMEOUT: String(timeoutSec),
      },
    });
    child.unref();
    log(
      `[AionUi:detached-watchdog] started (parent=${parentPid}, timeout=${timeoutSec}s, ready=${readyFile})`
    );
  } catch (error) {
    log(`[AionUi:detached-watchdog] failed to spawn: ${error}`);
    return noop;
  }

  let ready = false;
  const markReady = (): void => {
    if (ready) return;
    ready = true;
    writeReadyFile(readyFile, log);
    log('[AionUi:detached-watchdog] marked ready');
  };

  const dispose = (): void => {
    markReady();
    // 子进程会在 sleep 结束后自行退出；无需强制 kill child
    child = null;
  };

  return { markReady, dispose, readyFile };
}
