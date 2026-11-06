// The lobby's live line on the shared site (VITE_LOBBY_WS set). From the 16 Oct review: a server that accepts and
// then hangs up doesn't get a reconnect every second, and a failed pass is retried instead of making a logged-in
// person a visitor.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A socket the test scripts: what the server does once it's open.
class FakeSocket {
  static OPEN = 1;
  static all: FakeSocket[] = [];
  static script: (s: FakeSocket) => void = () => undefined;
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  constructor(public url: string) {
    FakeSocket.all.push(this);
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.();
      FakeSocket.script(this);
    }, 10);
  }
  hangUp() {
    this.readyState = 3;
    this.onclose?.();
  }
  say(msg: object) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
  send(m: string) {
    this.sent.push(m);
  }
  close() {}
}

const noop = () => undefined;
const events = { onSnapshot: noop, onJoin: noop, onMove: noop, onEmote: noop, onLeave: noop, onStatus: noop, onCensus: noop };
const ticketJson = (ticket: string | null, status = 200) => new Response(JSON.stringify({ ticket }), { status });

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  FakeSocket.all = [];
  FakeSocket.script = () => undefined;
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.stubGlobal("window", globalThis);
  vi.stubEnv("VITE_LOBBY_WS", "wss://example.test/lobby-ws");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("reconnecting", () => {
  it("backs off when the server accepts and then hangs up straight away", async () => {
    FakeSocket.script = (s) => s.hangUp();
    const tickets = vi.fn(async () => ticketJson(null));
    vi.stubGlobal("fetch", tickets);
    const { LobbyLink } = await import("./link");
    const link = new LobbyLink(events);
    await vi.advanceTimersByTimeAsync(60_000);
    link.close();
    // 1, 2, 4, 8, 15, 15, 15 s...: about 8 tries in a minute, not 60.
    expect(FakeSocket.all.length).toBeLessThanOrEqual(9);
  });

  it("starts the waits over once the server has spoken", async () => {
    // The first line is cut before the server says anything, the next one works, then drops.
    FakeSocket.script = (s) => {
      if (FakeSocket.all.length === 1) s.hangUp();
      else {
        s.say({ type: "census", counts: {} });
        setTimeout(() => s.hangUp(), 100);
      }
    };
    vi.stubGlobal("fetch", vi.fn(async () => ticketJson(null)));
    const { LobbyLink } = await import("./link");
    const link = new LobbyLink(events);
    await vi.advanceTimersByTimeAsync(4_200);
    link.close();
    // Tries at about 0, 1, 2.1 and 3.2 s: each line that spoke starts the wait over at 1 s. Without the reset the
    // waits would be 1, 2, then 4 s, and only three tries would fit.
    expect(FakeSocket.all.length).toBe(4);
  });
});

describe("the pass on the shared site", () => {
  it("doesn't connect as a visitor when the pass can't be had: it tries again, and comes in with one", async () => {
    FakeSocket.script = (s) => s.say({ type: "census", counts: {} });
    const tickets = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "core_down" }), { status: 503 }))
      .mockResolvedValue(ticketJson("t1"));
    vi.stubGlobal("fetch", tickets);
    const { LobbyLink } = await import("./link");
    const link = new LobbyLink(events);
    await vi.advanceTimersByTimeAsync(5_000);
    link.close();
    expect(tickets).toHaveBeenCalledTimes(2);
    expect(FakeSocket.all).toHaveLength(1);
  });

  it("sends the pass as the first message, never in the address, before saying where we are", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ticketJson("t1")));
    const { LobbyLink } = await import("./link");
    const link = new LobbyLink(events);
    link.enter("dakar");
    await vi.advanceTimersByTimeAsync(100);
    link.close();
    expect(FakeSocket.all.map((s) => s.url)).toEqual(["wss://example.test/lobby-ws"]);
    expect(FakeSocket.all[0].sent.map((m) => JSON.parse(m))).toEqual([
      { type: "ticket", ticket: "t1" },
      { type: "place", place: "dakar" },
    ]);
  });

  it("a visitor (no pass, but the API answered) connects without one", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ticketJson(null)));
    const { LobbyLink } = await import("./link");
    const link = new LobbyLink(events);
    await vi.advanceTimersByTimeAsync(100);
    link.close();
    expect(FakeSocket.all.map((s) => s.url)).toEqual(["wss://example.test/lobby-ws"]);
    expect(FakeSocket.all[0].sent).toEqual([]);
  });
});

describe("presence, for friends' lists", () => {
  it("says a status only when it changes, again after the line comes back, and hears the friends nudge", async () => {
    FakeSocket.script = (s) => {
      if (FakeSocket.all.length === 1) s.say({ type: "friends" });
    };
    vi.stubGlobal("fetch", vi.fn(async () => ticketJson(null)));
    const onFriends = vi.fn();
    const { LobbyLink } = await import("./link");
    const link = new LobbyLink({ ...events, onFriends });
    link.enter("Dakar");
    await vi.advanceTimersByTimeAsync(100);
    expect(onFriends).toHaveBeenCalledTimes(1);
    link.setPresence("online");
    link.setPresence("idle");
    link.setPresence("idle");
    const first = FakeSocket.all[0];
    expect(first.sent.map((m) => JSON.parse(m))).toEqual([{ type: "place", place: "Dakar" }, { type: "status", status: "idle" }]);
    first.hangUp();
    await vi.advanceTimersByTimeAsync(1_100);
    link.close();
    expect(FakeSocket.all[1].sent.map((m) => JSON.parse(m))).toEqual([{ type: "place", place: "Dakar" }, { type: "status", status: "idle" }]);
  });
});

describe("movement frames", () => {
  it("reads who moved where from 8 bytes each, and skips a number it doesn't know", async () => {
    const { readMoves } = await import("./link");
    const frame = new ArrayBuffer(24);
    const v = new DataView(frame);
    v.setUint16(0, 0x8002, true);
    v.setInt16(2, 1234, true);
    v.setInt16(4, -29999, true);
    v.setInt16(6, 3142, true);
    v.setUint16(8, 7, true);
    v.setUint16(16, 1, true);
    v.setInt16(18, -250, true);
    v.setInt16(20, 325, true);
    v.setInt16(22, -1500, true);
    const moves: unknown[] = [];
    readMoves(frame, (slot) => ({ 1: "awa", 2: "jib" })[slot], (...m) => moves.push(m));
    expect(moves).toEqual([
      ["jib", 12.34, -299.99, 3.142, true],
      ["awa", -2.5, 3.25, -1.5, false],
    ]);
  });
});
