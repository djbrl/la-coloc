// The arena store against a stand-in API: what it fetches when a city is followed, what an outage, a missing arena
// and a newer view do to it, and that the city's "arena" word refreshes it and bumps the room's tick.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ArenaView } from "../../types";

const streams: { url: string; events: Record<string, (e: MessageEvent) => void>; closed: boolean }[] = [];
vi.mock("../../stream", () => ({
  openStream: (url: string, events: Record<string, (e: MessageEvent) => void>) => {
    const s = { url, events, closed: false };
    streams.push(s);
    return { close: () => (s.closed = true) };
  },
}));

const { arena, followArena, leaveArena, loadArena, showArena } = await import("./store");

const view = (city: string, entrants = 3) => ({ city, entrants, joined: false, mine: [], leaderboard: [], champion: null, challenge: { id: "c" } }) as unknown as ArenaView;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let answer: (url: string) => Response | Promise<Response>;
const fetchMock = vi.fn(async (url: string) => answer(url));

beforeEach(() => {
  streams.length = 0;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  leaveArena();
  vi.unstubAllGlobals();
});

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("the arena store", () => {
  it("fetches the city's arena and listens to its stream", async () => {
    answer = () => json(view("Dakar"));
    followArena("Dakar");
    await settle();
    expect(fetchMock).toHaveBeenCalledWith("/api/cities/Dakar/arena");
    expect(streams[0].url).toBe("/api/cities/Dakar/stream");
    expect(arena.view?.entrants).toBe(3);
    expect(arena.loaded).toBe(true);
  });

  it("asks again, and bumps the room's tick, on the stream's arena word", async () => {
    answer = () => json(view("Dakar"));
    followArena("Dakar");
    await settle();
    answer = () => json(view("Dakar", 9));
    streams[0].events.arena(new MessageEvent("arena", { data: "arena" }));
    await settle();
    expect(arena.tick).toBe(1);
    expect(arena.view?.entrants).toBe(9);
  });

  it("has no arena where the API has none, and none in the workshop", async () => {
    answer = () => json({ message: "Not found" }, 404);
    followArena("Kigali");
    await settle();
    expect(arena.view).toBeNull();
    expect(arena.loaded).toBe(true);
    followArena(null);
    expect(streams[0].closed).toBe(true);
    expect(arena.city).toBeNull();
  });

  it("keeps the last view while the core is down, and says it's waiting", async () => {
    answer = () => json(view("Dakar"));
    followArena("Dakar");
    await settle();
    answer = () => new Response("", { status: 502 });
    await loadArena(true);
    expect(arena.waiting).toBe(true);
    expect(arena.view?.entrants).toBe(3);
  });

  it("shows a newer view at once, but never another city's", async () => {
    answer = () => json(view("Dakar"));
    followArena("Dakar");
    await settle();
    showArena(view("Dakar", 4));
    expect(arena.view?.entrants).toBe(4);
    showArena(view("Abidjan", 50));
    expect(arena.view?.entrants).toBe(4);
  });

  it("drops a slow answer for the city you just left", async () => {
    let release: (r: Response) => void = () => undefined;
    answer = () => new Promise<Response>((r) => (release = r));
    followArena("Dakar");
    answer = () => json(view("Abidjan", 7));
    followArena("Abidjan");
    await settle();
    release(json(view("Dakar", 1)));
    await settle();
    expect(arena.view?.city).toBe("Abidjan");
  });
});
