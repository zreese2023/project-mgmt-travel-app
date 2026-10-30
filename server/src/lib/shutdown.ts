/** Signals that should stop the server cleanly. SIGBREAK is what Ctrl+Break/closing a console sends on Windows. */
export const SHUTDOWN_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGBREAK'] as const;
export type ShutdownSignal = (typeof SHUTDOWN_SIGNALS)[number];

export const SHUTDOWN_TIMEOUT_MS = 5000;

export interface ShutdownOptions {
  /** Stops accepting requests and releases resources (HTTP server, database pool). */
  close: () => Promise<void>;
  exit: (code: number) => void;
  log: (message: string) => void;
  timeoutMs?: number;
}

/**
 * Returns a handler for the shutdown signals. The first signal closes the server and exits 0 (a
 * deliberate stop is not a failure); a close error or a close that hangs past the timeout exits 1.
 * Further signals while closing are ignored.
 */
export function createShutdown(
  options: ShutdownOptions,
): (signal: ShutdownSignal) => Promise<void> {
  let started = false;
  return async (signal) => {
    if (started) return;
    started = true;
    options.log(`${signal} received, shutting down`);
    const timer = setTimeout(() => {
      options.log('shutdown timed out, forcing exit');
      options.exit(1);
    }, options.timeoutMs ?? SHUTDOWN_TIMEOUT_MS);
    try {
      await options.close();
      clearTimeout(timer);
      options.exit(0);
    } catch (err) {
      clearTimeout(timer);
      options.log(`shutdown failed: ${err instanceof Error ? err.message : String(err)}`);
      options.exit(1);
    }
  };
}
