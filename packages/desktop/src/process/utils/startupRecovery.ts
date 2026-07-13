/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * 启动恢复：解决「主进程占着单例锁但界面永远不出现」的僵尸态。
 *
 * 典型路径：
 * 1. requestSingleInstanceLock 成功后，handleAppReady 中途卡住（DB/网络/迁移等）
 * 2. appReadyDone 仍为 false → activate / second-instance 直接 return
 * 3. 用户反复点 Dock 无界面，只能手动杀进程
 *
 * 策略：
 * - 初始化未完成时，把「需要显示主窗口」记为 pending，ready 后补一次 show/create
 * - 启动看门狗：超时仍未 ready → 退出释放单例锁，下次冷启动可恢复
 * - ready 后若主窗口意外消失且非「关到托盘」模式，可请求重建
 */

export type StartupRecoveryOptions = {
  /** 启动看门狗超时（毫秒），默认 45s */
  watchdogMs?: number;
  /** 是否启用看门狗，E2E 可关 */
  enableWatchdog?: boolean;
  isAppReadyDone: () => boolean;
  hasUsableMainWindow: () => boolean;
  /** 初始化完成后、或二次唤起时调用：show 或 create */
  showOrCreateMainWindow: () => void;
  /** 看门狗触发：无法自愈时退出以释放单例锁 */
  exitToReleaseLock: (reason: string) => void;
  log?: (message: string) => void;
};

const DEFAULT_WATCHDOG_MS = 45_000;

export class StartupRecovery {
  private pendingShowMainWindow = false;
  private startupCompleted = false;
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly options: Required<
    Pick<StartupRecoveryOptions, 'watchdogMs' | 'enableWatchdog'>
  > &
    StartupRecoveryOptions;

  constructor(options: StartupRecoveryOptions) {
    this.options = {
      watchdogMs: options.watchdogMs ?? DEFAULT_WATCHDOG_MS,
      enableWatchdog: options.enableWatchdog ?? true,
      ...options,
    };
  }

  /** 拿到单例锁后立刻调用 */
  startWatchdog(): void {
    if (!this.options.enableWatchdog) return;
    this.clearWatchdog();
    this.watchdogTimer = setTimeout(() => {
      this.watchdogTimer = null;
      this.onWatchdogFire();
    }, this.options.watchdogMs);
  }

  /** handleAppReady 成功创建窗口并标记 appReadyDone 后调用 */
  markStartupCompleted(): void {
    this.startupCompleted = true;
    this.clearWatchdog();
    this.flushPendingShow('startup-completed');
  }

  /** 主窗口 ready-to-show / 已显示时调用，进一步取消看门狗 */
  markMainWindowVisible(): void {
    this.startupCompleted = true;
    this.clearWatchdog();
  }

  /**
   * Dock 点击 / 二次启动 / open-url 时调用。
   * - 已 ready：立即 show/create
   * - 未 ready：记 pending，ready 后补做
   */
  requestShowMainWindow(source: string): void {
    const log = this.options.log ?? console.log;
    if (this.options.isAppReadyDone()) {
      log(`[AionUi:recovery] showOrCreate requested (source=${source}, ready=true)`);
      this.options.showOrCreateMainWindow();
      return;
    }
    this.pendingShowMainWindow = true;
    log(`[AionUi:recovery] pending show queued (source=${source}, ready=false)`);
  }

  hasPendingShow(): boolean {
    return this.pendingShowMainWindow;
  }

  dispose(): void {
    this.clearWatchdog();
  }

  private flushPendingShow(reason: string): void {
    if (!this.pendingShowMainWindow) return;
    this.pendingShowMainWindow = false;
    const log = this.options.log ?? console.log;
    log(`[AionUi:recovery] flushing pending show (reason=${reason})`);
    try {
      this.options.showOrCreateMainWindow();
    } catch (error) {
      log(`[AionUi:recovery] flush pending show failed: ${error}`);
    }
  }

  private onWatchdogFire(): void {
    const log = this.options.log ?? console.error;
    if (this.startupCompleted || this.options.isAppReadyDone()) {
      // ready 了但可能没有窗口（例如创建失败）——尝试一次重建
      if (!this.options.hasUsableMainWindow()) {
        log('[AionUi:recovery] watchdog: ready but no main window, recreating once');
        try {
          this.options.showOrCreateMainWindow();
        } catch (error) {
          log(`[AionUi:recovery] watchdog recreate failed, exiting: ${error}`);
          this.options.exitToReleaseLock('watchdog-recreate-failed');
        }
      }
      return;
    }

    log(
      `[AionUi:recovery] watchdog: startup not completed within ${this.options.watchdogMs}ms; exiting to release single-instance lock`
    );
    this.options.exitToReleaseLock('watchdog-startup-timeout');
  }

  private clearWatchdog(): void {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }
}
