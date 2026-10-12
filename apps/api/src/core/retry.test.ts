import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backoffMs, retryUntilItWorks } from "./retry";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("the wait between tries", () => {
  it("grows from 1 second to 15 seconds and stays there", () => {
    expect([1, 2, 3, 4, 5, 6, 50].map(backoffMs)).toEqual([1000, 2000, 4000, 8000, 15_000, 15_000, 15_000]);
  });
});

describe("trying until it works", () => {
  it("tries at once, then after 1 s, 2 s, 4 s, and stops when it works", async () => {
    let calls = 0;
    const waits: number[] = [];
    const r = retryUntilItWorks(
      async () => {
        calls += 1;
        if (calls <= 3) throw new Error("down");
      },
      (_e, _n, wait) => waits.push(wait),
    );
    let done = false;
    void r.done.then(() => (done = true));

    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toBe(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(calls).toBe(3);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(4000);
    expect(calls).toBe(4);
    expect(done).toBe(true);
    expect(waits).toEqual([1000, 2000, 4000]);

    // It worked: nothing is scheduled any more.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toBe(4);
  });

  it("never gives up by itself, and never waits more than 15 s", async () => {
    let calls = 0;
    const waits: number[] = [];
    retryUntilItWorks(
      async () => {
        calls += 1;
        throw new Error("still down");
      },
      (_e, _n, wait) => waits.push(wait),
    );
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(calls).toBeGreaterThan(40);
    expect(Math.max(...waits)).toBe(15_000);
  });

  it("can be stopped", async () => {
    let calls = 0;
    const r = retryUntilItWorks(
      async () => {
        calls += 1;
        throw new Error("down");
      },
      () => undefined,
    );
    await vi.advanceTimersByTimeAsync(0);
    r.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toBe(1);
  });

  it("keeps going even if reporting the failure throws", async () => {
    let calls = 0;
    retryUntilItWorks(
      async () => {
        calls += 1;
        if (calls < 2) throw new Error("down");
      },
      () => {
        throw new Error("logger broke");
      },
    );
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toBe(2);
  });
});
