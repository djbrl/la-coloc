// stream.ts in polling mode (the shared build: VITE_LOBBY_WS set). From the 16 Oct review: no pile-up on a slow API,
// quiet while the core is down, a refresh as soon as the tab is back, one poller per address.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Core = typeof import("./core");
type Stream = typeof import("./stream");
let core: Core;
let stream: Stream;

// Just enough of a document: its visibility, and the visibilitychange listeners.
const doc = {
  visibilityState: "visible" as "visible" | "hidden",
  listeners: new Set<() => void>(),
  addEventListener(_: string, fn: () => void) {
    this.listeners.add(fn);
  },
  removeEventListener(_: string, fn: () => void) {
    this.listeners.delete(fn);
  },
  show() {
    this.visibilityState = "visible";
    for (const fn of this.listeners) fn();
  },
};

const ok = () => new Response("{}", { status: 200 });

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  vi.stubEnv("VITE_LOBBY_WS", "wss://example.test/lobby-ws");
  core = await import("./core");
  stream = await import("./stream");
  // After the import: Vue's runtime looks for a real document when it loads.
  vi.stubGlobal("document", doc);
  doc.visibilityState = "visible";
  doc.listeners.clear();
});
afterEach(() => {
  core.stopCore();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("polling mode", () => {
  it("waits for a slow answer instead of asking again on top of it", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 15_000)); // a slow tunnel
        inFlight--;
        return ok();
      }),
    );
    const s = stream.openStream("/api/city/stream", { city: () => undefined });
    await vi.advanceTimersByTimeAsync(40_000);
    s.close();
    expect(maxInFlight).toBe(1);
  });

  it("stops asking while the core is down, fires no nudges, and asks once when it's back", async () => {
    let up = false;
    const fetchMock = vi.fn(async (url: string) => {
      if (!up) throw new TypeError("Failed to fetch");
      return url === "/api/health" ? new Response(JSON.stringify({ ok: true }), { status: 200 }) : ok();
    });
    vi.stubGlobal("fetch", fetchMock);
    const house = vi.fn();
    const nudges = vi.fn();
    const s = stream.openStream("/api/houses/h1/stream", { house });
    const b = stream.openStream("/api/cities/Dakar/stream", { board: nudges });
    await vi.advanceTimersByTimeAsync(4_000);
    expect(core.core.state).toBe("down");
    const houseAsks = () => fetchMock.mock.calls.filter(([url]) => url === "/api/houses/h1").length;
    const before = houseAsks();
    nudges.mockClear();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(houseAsks()).toBe(before); // only health probes while down
    expect(nudges).not.toHaveBeenCalled();
    up = true;
    await vi.advanceTimersByTimeAsync(30_000); // the next health probe finds it back
    expect(core.core.state).toBe("up");
    expect(house).toHaveBeenCalled();
    s.close();
    b.close();
  });

  it("does nothing while hidden, and asks the moment the tab is visible again", async () => {
    const fetchMock = vi.fn(async () => ok());
    vi.stubGlobal("fetch", fetchMock);
    const s = stream.openStream("/api/city/stream", { city: () => undefined });
    doc.visibilityState = "hidden";
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetchMock).toHaveBeenCalledTimes(0);
    doc.show();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    s.close();
  });

  it("shares one poller between panels on the same address, until the last one closes", async () => {
    const fetchMock = vi.fn(async () => ok());
    vi.stubGlobal("fetch", fetchMock);
    const a = vi.fn();
    const b = vi.fn();
    const one = stream.openStream("/api/houses/h1/stream", { house: a });
    const two = stream.openStream("/api/houses/h1/stream", { house: b });
    await vi.advanceTimersByTimeAsync(4_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    one.close();
    await vi.advanceTimersByTimeAsync(4_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(a).toHaveBeenCalledTimes(1);
    two.close();
    await vi.advanceTimersByTimeAsync(8_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
