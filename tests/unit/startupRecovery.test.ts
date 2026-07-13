/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for process/utils/startupRecovery — zombie single-instance lock recovery.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StartupRecovery } from '@/process/utils/startupRecovery';

describe('StartupRecovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('queues show while not ready and flushes on markStartupCompleted', () => {
    let ready = false;
    const showOrCreateMainWindow = vi.fn();
    const exitToReleaseLock = vi.fn();
    const recovery = new StartupRecovery({
      enableWatchdog: false,
      isAppReadyDone: () => ready,
      hasUsableMainWindow: () => false,
      showOrCreateMainWindow,
      exitToReleaseLock,
      log: () => {},
    });

    recovery.requestShowMainWindow('activate');
    expect(showOrCreateMainWindow).not.toHaveBeenCalled();
    expect(recovery.hasPendingShow()).toBe(true);

    ready = true;
    recovery.markStartupCompleted();
    expect(showOrCreateMainWindow).toHaveBeenCalledOnce();
    expect(recovery.hasPendingShow()).toBe(false);
  });

  it('shows immediately when already ready', () => {
    const showOrCreateMainWindow = vi.fn();
    const recovery = new StartupRecovery({
      enableWatchdog: false,
      isAppReadyDone: () => true,
      hasUsableMainWindow: () => true,
      showOrCreateMainWindow,
      exitToReleaseLock: vi.fn(),
      log: () => {},
    });

    recovery.requestShowMainWindow('second-instance');
    expect(showOrCreateMainWindow).toHaveBeenCalledOnce();
  });

  it('exits to release lock when startup hangs past watchdog', () => {
    const exitToReleaseLock = vi.fn();
    const recovery = new StartupRecovery({
      enableWatchdog: true,
      watchdogMs: 1000,
      isAppReadyDone: () => false,
      hasUsableMainWindow: () => false,
      showOrCreateMainWindow: vi.fn(),
      exitToReleaseLock,
      log: () => {},
    });

    recovery.startWatchdog();
    vi.advanceTimersByTime(999);
    expect(exitToReleaseLock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(exitToReleaseLock).toHaveBeenCalledWith('watchdog-startup-timeout');
  });

  it('does not exit watchdog after markStartupCompleted with usable window', () => {
    const exitToReleaseLock = vi.fn();
    const showOrCreateMainWindow = vi.fn();
    const recovery = new StartupRecovery({
      enableWatchdog: true,
      watchdogMs: 1000,
      isAppReadyDone: () => true,
      hasUsableMainWindow: () => true,
      showOrCreateMainWindow,
      exitToReleaseLock,
      log: () => {},
    });

    recovery.startWatchdog();
    recovery.markStartupCompleted();
    vi.advanceTimersByTime(5000);
    expect(exitToReleaseLock).not.toHaveBeenCalled();
    expect(showOrCreateMainWindow).not.toHaveBeenCalled();
  });

  it('recreates window once when ready but no usable main window at watchdog', () => {
    const exitToReleaseLock = vi.fn();
    const showOrCreateMainWindow = vi.fn();
    const recovery = new StartupRecovery({
      enableWatchdog: true,
      watchdogMs: 500,
      isAppReadyDone: () => true,
      hasUsableMainWindow: () => false,
      showOrCreateMainWindow,
      exitToReleaseLock,
      log: () => {},
    });

    // mark completed clears watchdog; start again after ready with no window
    recovery.markStartupCompleted();
    recovery.startWatchdog();
    vi.advanceTimersByTime(500);
    expect(showOrCreateMainWindow).toHaveBeenCalledOnce();
    expect(exitToReleaseLock).not.toHaveBeenCalled();
  });
});
