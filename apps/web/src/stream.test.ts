import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A stand-in for the browser's EventSource that the test can break by hand.
class FakeSource {
  static all: FakeSource[] = [];
  static CLOSED = 2;
  static CONNECTING = 0;
  readyState = 1;
  listeners = new Map<string, ((e: unknown) => void)[]>();
  constructor(public url: string) {
    FakeSource.all.push(this);
  }
  addEventListener(name: string, fn: (e: unknown) => void) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), fn]);
  }
  close() {
    this.readyState = 2;
  }
  emit(name: string, e: unknown = {}) {
    for (const fn of this.listeners.get(name) ?? []) fn(e);
  }
}

type Core = typeof import("./core");
type Stream = typeof import("./stream");
let core: Core;
let stream: Stream;
let health: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  FakeSource.all = [];
  vi.stubGlobal("EventSource", FakeSource);
  core = await import("./core");
  stream = await import("./stream");
  health = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  core.installCoreFetch({ fetch: health } as unknown as typeof globalThis);
});
afterEach(() => {
  core.stopCore();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("openStream", () => {
  it("hands each named event to its handler", () => {
    const got: string[] = [];
    stream.openStream("/api/city/stream", { city: (e) => got.push(String(e.data)) });
    FakeSource.all[0].emit("city", { data: "x" });
    expect(got).toEqual(["x"]);
  });

  it("leaves a stream the browser is retrying by itself alone", async () => {
    stream.openStream("/api/city/stream", {});
    const es = FakeSource.all[0];
    es.readyState = 0;
    es.emit("error");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(FakeSource.all).toHaveLength(1);
  });

  it("when the browser gave up while the core is down, it reopens the moment the core is back", async () => {
    health.mockRejectedValue(new TypeError("Failed to fetch"));
    stream.openStream("/api/city/stream", {});
    const es = FakeSource.all[0];
    es.readyState = FakeSource.CLOSED;
    es.emit("error");
    await vi.advanceTimersByTimeAsync(0);
    expect(core.core.state).toBe("down");
    expect(FakeSource.all).toHaveLength(1);
    health.mockImplementation(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await vi.advanceTimersByTimeAsync(2000);
    expect(core.core.state).toBe("up");
    expect(FakeSource.all).toHaveLength(2);
  });

  it("when it died but the core answers, it tries again in a few seconds, and gives up after a few quick deaths", async () => {
    stream.openStream("/api/x/stream", {});
    for (let i = 0; i < 6; i++) {
      const es = FakeSource.all[FakeSource.all.length - 1];
      es.readyState = FakeSource.CLOSED;
      es.emit("error");
      await vi.advanceTimersByTimeAsync(3100);
    }
    // The first plus four more, then no more.
    expect(FakeSource.all).toHaveLength(5);
  });

  it("reopens when the core comes back even if the browser never said the stream died (a proxy left it hanging)", async () => {
    health.mockRejectedValue(new TypeError("Failed to fetch"));
    stream.openStream("/api/city/stream", {});
    await core.checkCore();
    expect(core.core.state).toBe("down");
    health.mockImplementation(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await vi.advanceTimersByTimeAsync(2000);
    expect(FakeSource.all).toHaveLength(2);
    expect(FakeSource.all[0].readyState).toBe(2);
  });

  it("closing it cancels what it was waiting for", async () => {
    health.mockRejectedValue(new TypeError("Failed to fetch"));
    const s = stream.openStream("/api/x/stream", {});
    const es = FakeSource.all[0];
    es.readyState = FakeSource.CLOSED;
    es.emit("error");
    await vi.advanceTimersByTimeAsync(0);
    s.close();
    health.mockImplementation(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await vi.advanceTimersByTimeAsync(2000);
    expect(FakeSource.all).toHaveLength(1);
  });
});
