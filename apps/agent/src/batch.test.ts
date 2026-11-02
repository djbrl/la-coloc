import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { batched } from "./batch";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("batched", () => {
  it("waits a moment, then sends what came in together", () => {
    const send = vi.fn();
    const b = batched(send, 400, 10);
    b.add(["a"]);
    b.add(["b"]);
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(send.mock.calls).toEqual([[["a", "b"]]]);
  });

  it("sends a flood at once, in pieces of the most it may", () => {
    const send = vi.fn();
    batched(send, 400, 2).add(["a", "b", "c"]);
    expect(send.mock.calls).toEqual([[["a", "b"]], [["c"]]]);
  });

  it("flushes whatever is left when the build ends", () => {
    const send = vi.fn();
    const b = batched(send);
    b.add(["last"]);
    b.flush();
    expect(send.mock.calls).toEqual([[["last"]]]);
    vi.advanceTimersByTime(1000);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
