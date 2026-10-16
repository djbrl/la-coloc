import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BACKOFF, createCore, downWords, HEARTBEAT_MS, isApiUrl, isOutageError, isOutageResponse, TOAST_MS } from "./core";

describe("isOutageResponse: what counts as the core being down", () => {
  it("counts a proxy's 502, 503 and 504, whatever they say", () => {
    for (const status of [502, 503, 504]) {
      expect(isOutageResponse(status, "")).toBe(true);
      expect(isOutageResponse(status, "<html>Bad gateway</html>")).toBe(true);
      expect(isOutageResponse(status, JSON.stringify({ message: "x" }))).toBe(true);
    }
  });

  it("counts the API's own `core_down`, on a 503 or on any other failure status", () => {
    const body = JSON.stringify({ code: "core_down", message: "The core is down." });
    expect(isOutageResponse(503, body)).toBe(true);
    expect(isOutageResponse(500, body)).toBe(true);
    expect(isOutageResponse(400, body)).toBe(true);
  });

  it("counts a 500 with an empty or non-JSON body (the dev proxy's answer when the API isn't there)", () => {
    expect(isOutageResponse(500, "")).toBe(true);
    expect(isOutageResponse(500, "   \n")).toBe(true);
    expect(isOutageResponse(500, "Internal Server Error")).toBe(true);
    expect(isOutageResponse(500, "<html></html>")).toBe(true);
  });

  it("does not count the API answering 'no' in its own words", () => {
    expect(isOutageResponse(401, JSON.stringify({ message: "Log in first." }))).toBe(false);
    expect(isOutageResponse(403, JSON.stringify({ message: "Not yours." }))).toBe(false);
    expect(isOutageResponse(404, JSON.stringify({ message: "No such house." }))).toBe(false);
    expect(isOutageResponse(409, JSON.stringify({ message: "You already knocked." }))).toBe(false);
    expect(isOutageResponse(422, JSON.stringify({ message: "Too long." }))).toBe(false);
    // Nor an ordinary bug: a 500 that carries the API's JSON message.
    expect(isOutageResponse(500, JSON.stringify({ statusCode: 500, message: "Internal server error" }))).toBe(false);
  });

  it("does not count a 4xx with no body at all, nor anything that worked", () => {
    expect(isOutageResponse(404, "")).toBe(false);
    expect(isOutageResponse(401, "")).toBe(false);
    expect(isOutageResponse(200, "")).toBe(false);
    expect(isOutageResponse(204, "")).toBe(false);
    expect(isOutageResponse(304, "")).toBe(false);
  });
});

describe("isOutageError", () => {
  it("counts a network failure, not an abort", () => {
    expect(isOutageError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isOutageError(new DOMException("The operation was aborted.", "AbortError"))).toBe(false);
  });
});

describe("isApiUrl", () => {
  it("judges same-origin /api/ requests only", () => {
    const origin = "http://localhost:5175";
    expect(isApiUrl("/api/me", origin)).toBe(true);
    expect(isApiUrl("/api/houses/x/stream", origin)).toBe(true);
    expect(isApiUrl("http://localhost:5175/api/city", origin)).toBe(true);
    expect(isApiUrl("/apiary", origin)).toBe(false);
    expect(isApiUrl("/assets/model.glb", origin)).toBe(false);
    expect(isApiUrl("https://example.com/api/me", origin)).toBe(false);
  });
});

describe("the core's state machine", () => {
  let probe: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
  let core: ReturnType<typeof createCore>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-12T10:00:00Z"));
    probe = vi.fn<() => Promise<boolean>>().mockResolvedValue(false);
    core = createCore({ probe });
  });
  afterEach(() => {
    core.stop();
    vi.useRealTimers();
  });

  it("starts up, and stays up on an answer", () => {
    expect(core.store.state).toBe("up");
    core.reportOk();
    expect(core.store.state).toBe("up");
    expect(probe).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("goes down on the first failure, with a countdown to the first try", () => {
    core.reportFailure();
    expect(core.store.state).toBe("down");
    expect(core.store.since).toBe(Date.now());
    expect(core.store.attempt).toBe(0);
    expect(core.store.retryIn).toBe(BACKOFF[0]);
    expect(core.store.nextTryAt).toBe(Date.now() + BACKOFF[0] * 1000);
    expect(core.store.recovered).toBe(false);
  });

  it("counts the seconds down", async () => {
    core.reportFailure();
    expect(core.store.retryIn).toBe(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(core.store.retryIn).toBe(1);
    expect(probe).not.toHaveBeenCalled();
  });

  it("probes on the backoff 2, 4, 8, 15, 30, 30 seconds", async () => {
    core.reportFailure();
    const seen: number[] = [];
    for (let i = 0; i < 6; i++) {
      seen.push(core.store.retryIn);
      await vi.advanceTimersByTimeAsync(core.store.retryIn * 1000);
      expect(probe).toHaveBeenCalledTimes(i + 1);
    }
    expect(seen).toEqual([2, 4, 8, 15, 30, 30]);
    expect(core.store.state).toBe("down");
    expect(core.store.probing).toBe(false);
  });

  it("does not probe early", async () => {
    core.reportFailure();
    await vi.advanceTimersByTimeAsync(1999);
    expect(probe).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("a failure while it's down changes nothing", async () => {
    core.reportFailure();
    const since = core.store.since;
    await vi.advanceTimersByTimeAsync(1000);
    core.reportFailure();
    expect(core.store.since).toBe(since);
    expect(core.store.retryIn).toBe(1);
  });

  it("flips up on the first probe that answers, runs the recovery callbacks, and raises the toast flag", async () => {
    const a = vi.fn();
    const b = vi.fn();
    core.onRecovered(a);
    core.onRecovered(b);
    core.reportFailure();
    await vi.advanceTimersByTimeAsync(2000); // fails
    expect(a).not.toHaveBeenCalled();
    probe.mockResolvedValue(true);
    await vi.advanceTimersByTimeAsync(4000);
    expect(core.store.state).toBe("up");
    expect(core.store.since).toBeNull();
    expect(core.store.nextTryAt).toBeNull();
    expect(core.store.recovered).toBe(true);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    // The toast goes after a few seconds, and no timer is left running.
    await vi.advanceTimersByTimeAsync(TOAST_MS);
    expect(core.store.recovered).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a callback that unsubscribes stops hearing, and one that throws doesn't stop the others", async () => {
    const stays = vi.fn();
    const throws = vi.fn(() => {
      throw new Error("boom");
    });
    const gone = vi.fn();
    core.onRecovered(throws);
    const off = core.onRecovered(gone);
    core.onRecovered(stays);
    off();
    probe.mockResolvedValue(true);
    core.reportFailure();
    await vi.advanceTimersByTimeAsync(2000);
    expect(throws).toHaveBeenCalledTimes(1);
    expect(stays).toHaveBeenCalledTimes(1);
    expect(gone).not.toHaveBeenCalled();
  });

  it("a callback may unsubscribe itself while the others are being called", async () => {
    const second = vi.fn();
    const off = core.onRecovered(() => off());
    core.onRecovered(second);
    probe.mockResolvedValue(true);
    core.reportFailure();
    await vi.advanceTimersByTimeAsync(2000);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("treats a probe that throws as 'still down'", async () => {
    probe.mockRejectedValue(new Error("network"));
    core.reportFailure();
    await vi.advanceTimersByTimeAsync(2000);
    expect(core.store.state).toBe("down");
    expect(core.store.attempt).toBe(1);
    expect(core.store.retryIn).toBe(4);
  });

  it("Try now asks at once and starts the waits over from the shortest", async () => {
    core.reportFailure();
    for (let i = 0; i < 3; i++) await vi.advanceTimersByTimeAsync(core.store.retryIn * 1000);
    expect(core.store.attempt).toBe(3);
    expect(core.store.retryIn).toBe(15);
    const ok = await core.retryNow();
    expect(ok).toBe(false);
    expect(probe).toHaveBeenCalledTimes(4);
    expect(core.store.attempt).toBe(0);
    expect(core.store.retryIn).toBe(2);
    expect(core.store.state).toBe("down");
  });

  it("Try now brings it back when the core answers", async () => {
    const back = vi.fn();
    core.onRecovered(back);
    core.reportFailure();
    probe.mockResolvedValue(true);
    expect(await core.retryNow()).toBe(true);
    expect(core.store.state).toBe("up");
    expect(core.store.recovered).toBe(true);
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("never runs two probes at once", async () => {
    let finish!: (ok: boolean) => void;
    probe.mockImplementation(() => new Promise<boolean>((r) => (finish = r)));
    core.reportFailure();
    const first = core.retryNow();
    expect(core.store.probing).toBe(true);
    expect(await core.retryNow()).toBe(false);
    await core.nudge();
    expect(probe).toHaveBeenCalledTimes(1);
    finish(true);
    expect(await first).toBe(true);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("an answer while down only nudges the probe (at most every five seconds), and a nudge that finds nothing keeps the countdown", async () => {
    core.reportFailure();
    await vi.advanceTimersByTimeAsync(2000); // first auto try fails: next in 4 s
    expect(core.store.retryIn).toBe(4);
    await vi.advanceTimersByTimeAsync(1000);
    core.reportOk(); // too soon after the last probe
    await vi.advanceTimersByTimeAsync(0);
    expect(probe).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4000); // the auto try at 4 s fails: next in 8 s
    expect(probe).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(5000); // 6 s after that probe, 2 s before the next
    expect(core.store.retryIn).toBe(2);
    core.reportOk(); // more than 5 s since the last probe: it asks
    await vi.advanceTimersByTimeAsync(0);
    expect(probe).toHaveBeenCalledTimes(3);
    expect(core.store.attempt).toBe(2);
    expect(core.store.retryIn).toBe(2);
    // And it flips up only if the probe says so.
    expect(core.store.state).toBe("down");
  });

  it("a nudge that finds the core flips it up", async () => {
    core.reportFailure();
    await vi.advanceTimersByTimeAsync(1000);
    probe.mockResolvedValue(true);
    expect(await core.nudge()).toBe(true);
    expect(core.store.state).toBe("up");
  });

  it("falling again clears the toast, and the countdown starts over", async () => {
    probe.mockResolvedValue(true);
    core.reportFailure();
    await vi.advanceTimersByTimeAsync(2000);
    expect(core.store.recovered).toBe(true);
    core.reportFailure();
    expect(core.store.recovered).toBe(false);
    expect(core.store.state).toBe("down");
    expect(core.store.retryIn).toBe(2);
  });

  it("check(): one probe on demand; a failure takes it down, an answer changes nothing", async () => {
    probe.mockResolvedValueOnce(true);
    expect(await core.check()).toBe(true);
    expect(core.store.state).toBe("up");
    probe.mockResolvedValueOnce(false);
    expect(await core.check()).toBe(false);
    expect(core.store.state).toBe("down");
    // Already down: it doesn't probe again, it just says no.
    probe.mockClear();
    expect(await core.check()).toBe(false);
    expect(probe).not.toHaveBeenCalled();
  });

  it("stop() leaves no timer behind and forgets the callbacks", async () => {
    const back = vi.fn();
    core.onRecovered(back);
    core.reportFailure();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    core.stop();
    expect(vi.getTimerCount()).toBe(0);
    expect(core.store.state).toBe("up");
    probe.mockResolvedValue(true);
    core.reportFailure();
    await vi.advanceTimersByTimeAsync(2000);
    expect(back).not.toHaveBeenCalled();
  });

  it("an answer from a probe that was overtaken by stop() is dropped", async () => {
    let finish!: (ok: boolean) => void;
    probe.mockImplementation(() => new Promise<boolean>((r) => (finish = r)));
    const back = vi.fn();
    core.onRecovered(back);
    core.reportFailure();
    void core.retryNow();
    core.stop();
    finish(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(back).not.toHaveBeenCalled();
    expect(core.store.recovered).toBe(false);
  });
});

describe("the fetch wrapper", () => {
  type Mod = typeof import("./core");
  let mod: Mod;
  let original: ReturnType<typeof vi.fn>;
  let target: { fetch: typeof fetch };

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    mod = await import("./core");
    original = vi.fn();
    target = { fetch: original as unknown as typeof fetch };
    mod.installCoreFetch(target as unknown as typeof globalThis);
  });
  afterEach(() => {
    mod.stopCore();
    vi.useRealTimers();
  });

  it("passes everything that isn't /api/ through untouched, and never judges it", async () => {
    original.mockResolvedValue(new Response("nope", { status: 503 }));
    const res = await target.fetch("/assets/model.glb", { method: "GET" });
    expect(res.status).toBe(503);
    expect(original).toHaveBeenCalledWith("/assets/model.glb", { method: "GET" });
    original.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(target.fetch("https://example.com/api/x")).rejects.toThrow("Failed to fetch");
    expect(mod.core.state).toBe("up");
  });

  it("a network error is an outage, and the caller still gets the original error", async () => {
    const err = new TypeError("Failed to fetch");
    original.mockRejectedValue(err);
    await expect(target.fetch("/api/city")).rejects.toBe(err);
    expect(mod.core.state).toBe("down");
  });

  it("an aborted request is not an outage", async () => {
    original.mockRejectedValue(new DOMException("aborted", "AbortError"));
    await expect(target.fetch("/api/city")).rejects.toThrow();
    expect(mod.core.state).toBe("up");
  });

  it("a 503 is an outage, and the caller can still read the body", async () => {
    original.mockResolvedValue(json({ code: "core_down", message: "The core is down." }, 503));
    const res = await target.fetch("/api/me");
    expect(mod.core.state).toBe("down");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ code: "core_down", message: "The core is down." });
  });

  it("an empty 500 is an outage", async () => {
    original.mockResolvedValue(new Response("", { status: 500, headers: { "Content-Type": "text/plain" } }));
    await target.fetch("/api/health");
    expect(mod.core.state).toBe("down");
  });

  it("401, 404, 409 and a 500 with a JSON message are not outages", async () => {
    for (const [status, body] of [[401, { message: "Log in first." }], [404, { message: "No such house." }], [409, { message: "Taken." }], [500, { message: "Internal server error" }]] as const) {
      original.mockResolvedValue(json(body, status));
      const res = await target.fetch("/api/houses/x");
      expect(res.status).toBe(status);
      expect(mod.core.state).toBe("up");
    }
  });

  it("probes /api/health with the original fetch, and comes back on its 200", async () => {
    original.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(target.fetch("/api/me")).rejects.toThrow();
    expect(mod.core.state).toBe("down");
    const back = vi.fn();
    mod.onRecovered(back);
    original.mockClear();
    original.mockResolvedValue(json({ ok: true }));
    await vi.advanceTimersByTimeAsync(2000);
    expect(original).toHaveBeenCalledTimes(1);
    expect(original.mock.calls[0][0]).toBe("/api/health");
    expect(mod.core.state).toBe("up");
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("a health answer that isn't a clean 200 {ok:true} keeps it down", async () => {
    original.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(target.fetch("/api/me")).rejects.toThrow();
    for (const answer of [json({ ok: false, code: "core_down" }, 503), new Response("", { status: 500 }), json({ hello: "world" }), json({ ok: true }, 404)]) {
      original.mockResolvedValue(answer);
      await mod.retryNow();
      expect(mod.core.state).toBe("down");
    }
  });

  it("asks the core now and then while it is up, so a fall is noticed without a click", async () => {
    original.mockImplementation(async () => json({ ok: true }));
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    expect(original).toHaveBeenCalledTimes(1);
    expect(original.mock.calls[0][0]).toBe("/api/health");
    expect(mod.core.state).toBe("up");
    original.mockImplementation(async () => json({ ok: false, code: "core_down" }, 503));
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    expect(mod.core.state).toBe("down");
  });

  it("downWords.write is the words the page promised", () => {
    expect(downWords.write).toBe("The city isn't answering, so that wasn't sent. Nothing was lost; try again in a moment.");
  });
});
