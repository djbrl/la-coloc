// "Try again until it works", slowly: the wait grows from 1 second to 15 seconds and then stays there, for ever.

/** How long to wait after the nth failure in a row: 1 s, 2 s, 4 s, 8 s, then 15 s every time. */
export function backoffMs(failures: number): number {
  return Math.min(1000 * 2 ** (failures - 1), 15_000);
}

/**
 * Runs `task` now, and again after each failure (with a growing wait) until it succeeds.
 * `done` resolves the first time it succeeds; `stop()` gives up (on shutdown).
 */
export function retryUntilItWorks(task: () => Promise<void>, onFailure: (error: unknown, failures: number, waitMs: number) => void) {
  let stopped = false;
  let failures = 0;
  let timer: NodeJS.Timeout | undefined;

  const done = new Promise<void>((resolve) => {
    const attempt = async () => {
      if (stopped) return;
      try {
        await task();
        resolve();
      } catch (error) {
        failures += 1;
        const wait = backoffMs(failures);
        try {
          onFailure(error, failures, wait);
        } catch {
          // A logging problem must never stop the retrying.
        }
        if (stopped) return;
        timer = setTimeout(attempt, wait);
        timer.unref();
      }
    };
    void attempt();
  });

  return {
    done,
    stop: () => {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
