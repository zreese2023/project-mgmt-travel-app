import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SHUTDOWN_SIGNALS, SHUTDOWN_TIMEOUT_MS, createShutdown } from '../../src/lib/shutdown.js';

describe('TECH-01: graceful shutdown on Ctrl+C / stop signals', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(close: () => Promise<void> = async () => undefined) {
    const exit = vi.fn();
    const log = vi.fn();
    const closeFn = vi.fn(close);
    return { exit, log, closeFn, shutdown: createShutdown({ close: closeFn, exit, log }) };
  }

  it('handles the signals a terminal or process manager sends, including SIGBREAK on Windows', () => {
    expect([...SHUTDOWN_SIGNALS]).toEqual(['SIGINT', 'SIGTERM', 'SIGBREAK']);
  });

  it('closes the server and exits 0, because a deliberate stop is not a failure', async () => {
    const { shutdown, closeFn, exit, log } = setup();
    await shutdown('SIGINT');
    expect(closeFn).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
    expect(log).toHaveBeenCalledWith('SIGINT received, shutting down');
  });

  it('ignores repeated signals while already shutting down', async () => {
    let finish: () => void = () => undefined;
    const { shutdown, closeFn, exit } = setup(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    const first = shutdown('SIGINT');
    await shutdown('SIGTERM');
    await shutdown('SIGINT');
    expect(closeFn).toHaveBeenCalledOnce();
    finish();
    await first;
    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
  });

  it('exits 1 and logs the reason if closing fails', async () => {
    const { shutdown, exit, log } = setup(() => Promise.reject(new Error('pool is stuck')));
    await shutdown('SIGTERM');
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(log).toHaveBeenCalledWith('shutdown failed: pool is stuck');
  });

  it('describes non-Error failures too', async () => {
    const { shutdown, log } = setup(() => Promise.reject('plain string'));
    await shutdown('SIGTERM');
    expect(log).toHaveBeenCalledWith('shutdown failed: plain string');
  });

  it('forces exit 1 if closing hangs past the timeout, and does not exit twice if it finishes later', async () => {
    let finish: () => void = () => undefined;
    const { shutdown, exit, log } = setup(() => new Promise<void>((resolve) => (finish = resolve)));
    void shutdown('SIGINT');
    await vi.advanceTimersByTimeAsync(SHUTDOWN_TIMEOUT_MS - 1);
    expect(exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(log).toHaveBeenCalledWith('shutdown timed out, forcing exit');
    finish();
  });

  it('cancels the timeout once the server has closed in time', async () => {
    const { shutdown, exit } = setup();
    await shutdown('SIGINT');
    await vi.advanceTimersByTimeAsync(SHUTDOWN_TIMEOUT_MS * 2);
    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
  });
});
