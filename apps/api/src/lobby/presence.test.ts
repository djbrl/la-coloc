import { describe, expect, it } from "vitest";
import { type Out, Presence } from "./presence";

const jib = { login: "jib", name: "Jib", avatar: "male-a" };
const awa = { login: "awa", name: "Awa", avatar: null };
const types = (out: Out[]) => out.map((o) => `${o.to}:${o.msg.type}`);

function inDakar(p: Presence, conn: string, viewer: typeof jib | null) {
  p.join(conn, viewer);
  return p.receive(conn, { type: "place", place: "Dakar" });
}

describe("lobby presence", () => {
  it("starts you with the head count, and shows you nobody until you arrive somewhere", () => {
    const p = new Presence();
    inDakar(p, "c1", jib);
    expect(p.join("c2", awa)).toEqual([{ to: "one", conn: "c2", msg: { type: "census", counts: { Dakar: 1 }, lobbies: {} } }]);
  });

  it("shows a newcomer who's in their neighbourhood, and tells that neighbourhood they arrived", () => {
    const p = new Presence();
    inDakar(p, "c1", jib);
    const out = inDakar(p, "c2", awa);
    expect(out[0]).toMatchObject({ to: "one", conn: "c2", msg: { type: "snapshot", place: "Dakar", players: [{ login: "jib" }] } });
    expect(out.find((o) => o.msg.type === "join")).toMatchObject({ to: "lobby", lobby: { place: "Dakar", n: 1 }, except: "c2", msg: { player: { login: "awa", slot: 1 } } });
    expect(out.find((o) => o.msg.type === "census")!.msg).toEqual({ type: "census", counts: { Dakar: 2 }, lobbies: {} });
  });

  it("keeps neighbourhoods apart: moving to Lomé leaves Dakar", () => {
    const p = new Presence();
    inDakar(p, "c1", jib);
    inDakar(p, "c2", awa);
    const out = p.receive("c2", { type: "place", place: "Lomé" });
    expect(types(out)).toEqual(["one:snapshot", "lobby:leave", "lobby:join", "all:census"]);
    expect(out[0].msg).toMatchObject({ place: "Lomé", players: [] });
    expect(out[1]).toMatchObject({ lobby: { place: "Dakar" }, msg: { login: "awa" } });
    expect(p.counts()).toEqual({ Dakar: 1, Lomé: 1 });
    p.receive("c1", { type: "move", x: 1, z: 1, ry: 0, moving: true });
    expect(p.frames().map((f) => f.lobby.place)).toEqual(["Dakar"]);
  });

  it("lets visitors watch a neighbourhood without appearing or moving anyone", () => {
    const p = new Presence();
    inDakar(p, "c1", jib);
    const out = inDakar(p, "v", null);
    expect(out).toEqual([{ to: "one", conn: "v", msg: { type: "snapshot", you: null, place: "Dakar", lobby: 1, players: [expect.objectContaining({ login: "jib" })] } }]);
    p.receive("v", { type: "move", x: 1, z: 1, ry: 0, moving: true });
    expect(p.frames()).toEqual([]);
    expect(p.watching("Dakar").sort()).toEqual(["c1", "v"]);
    expect(p.online()).toEqual(["jib"]);
  });

  it("relays emotes within the neighbourhood", () => {
    const p = new Presence();
    inDakar(p, "c1", jib);
    expect(p.receive("c1", { type: "emote", name: "yes" })[0]).toMatchObject({ to: "lobby", lobby: { place: "Dakar" }, except: "c1", msg: { type: "emote", login: "jib", name: "yes" } });
  });

  it("drops nonsense: unknown messages, teleports off the map, bad emotes, moving before arriving", () => {
    const p = new Presence();
    p.join("c1", jib);
    p.receive("c1", { type: "move", x: 1, z: 1, ry: 0, moving: true });
    expect(p.frames()).toEqual([]);
    p.receive("c1", { type: "place", place: "Dakar" });
    expect(p.receive("c1", { type: "teleport" })).toEqual([]);
    p.receive("c1", { type: "move", x: 1e9, z: 0, ry: 0, moving: false });
    p.receive("c1", { type: "move", x: NaN, z: 0, ry: 0, moving: false });
    expect(p.frames()).toEqual([]);
    expect(p.receive("c1", { type: "emote", name: "rude" })).toEqual([]);
    expect(p.receive("c1", { type: "place", place: "x".repeat(200) })).toEqual([]);
  });

  it("brakes floods", () => {
    const p = new Presence();
    inDakar(p, "c1", jib);
    for (let i = 0; i < 50; i++) p.receive("c1", { type: "move", x: i, z: 0, ry: 0, moving: true }, 1000);
    // The twentieth was the last one heard.
    expect(p.frames()[0].frame.readInt16LE(2)).toBe(1900);
    p.receive("c1", { type: "move", x: 42, z: 0, ry: 0, moving: true }, 2100);
    expect(p.frames()[0].frame.readInt16LE(2)).toBe(4200);
  });

  it("keeps someone with two tabs until their last tab closes", () => {
    const p = new Presence();
    inDakar(p, "c1", jib);
    inDakar(p, "c2", jib);
    expect(p.leave("c1")).toEqual([]);
    expect(p.online()).toEqual(["jib"]);
    expect(types(p.leave("c2"))).toEqual(["lobby:leave", "all:census"]);
    expect(p.counts()).toEqual({});
  });
});

describe("what the lobby says about each person", () => {
  it("passes on whether they have a real GitHub account and whether they're an example person", () => {
    const p = new Presence();
    p.join("c1", { ...jib, github: true, example: false });
    p.receive("c1", { type: "place", place: "Dakar" });
    const out = inDakar(p, "c2", awa);
    expect(out[0].msg).toMatchObject({ type: "snapshot", players: [{ login: "jib", github: true, example: false }] });
  });

  it("finds every tab one person has open, for the bell's nudge", () => {
    const p = new Presence();
    inDakar(p, "c1", jib);
    inDakar(p, "c2", jib);
    inDakar(p, "c3", awa);
    expect(p.connectionsOf("jib")).toEqual(["c1", "c2"]);
    expect(p.connectionsOf("nobody")).toEqual([]);
  });
});

const people = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ login: `p${from + i}`, name: null, avatar: null }));
const lobbyOf = (out: Out[]) => (out[0].msg as { lobby: number }).lobby;

describe("lobbies: a city holds as many as it needs", () => {
  it("opens a second lobby when the first is full, and only people count", () => {
    const p = new Presence(2);
    expect(people(3).map((v) => lobbyOf(inDakar(p, v.login, v)))).toEqual([1, 1, 2]);
    expect(lobbyOf(inDakar(p, "v", null))).toBe(1);
    expect(p.counts()).toEqual({ Dakar: 3 });
    expect(p.census()).toMatchObject({ lobbies: { Dakar: [{ n: 1, people: 2 }, { n: 2, people: 1 }] } });
  });

  it("holds 32 people by default", () => {
    const p = new Presence();
    const seats = people(33).map((v) => lobbyOf(inDakar(p, v.login, v)));
    expect(seats.filter((n) => n === 1)).toHaveLength(32);
    expect(seats[32]).toBe(2);
  });

  it("only tells you about your own lobby", () => {
    const p = new Presence(1);
    inDakar(p, "c1", jib);
    const out = inDakar(p, "c2", awa);
    expect(out[0].msg).toMatchObject({ lobby: 2, players: [] });
    p.receive("c1", { type: "move", x: 1, z: 2, ry: 0, moving: true });
    const [frame] = p.frames();
    expect([...frame.lobby.watchers]).toEqual(["c1"]);
  });

  it("gives a freed place to the next person, and closes an empty lobby", () => {
    const p = new Presence(1);
    inDakar(p, "c1", jib);
    inDakar(p, "c2", awa);
    p.leave("c2");
    expect(p.census()).toMatchObject({ lobbies: {} });
    p.leave("c1");
    expect(lobbyOf(inDakar(p, "c3", awa))).toBe(1);
  });

  it("lets you change lobby if the other has room, and keeps you where you stand", () => {
    const p = new Presence(2);
    for (const v of people(3)) inDakar(p, v.login, v);
    p.receive("p0", { type: "move", x: 5, z: 6, ry: 0, moving: false });
    const out = p.receive("p0", { type: "place", place: "Dakar", lobby: 2 }, Date.now() + 10_000);
    expect(lobbyOf(out)).toBe(2);
    expect(out.find((o) => o.msg.type === "join")).toMatchObject({ lobby: { n: 2 }, msg: { player: { login: "p0", x: 5, z: 6 } } });
    expect(out.find((o) => o.msg.type === "leave")).toMatchObject({ lobby: { n: 1 } });
    // That one is full now: you stay where you are.
    inDakar(p, "c9", jib);
    expect(p.receive("p1", { type: "place", place: "Dakar", lobby: 2 }, Date.now() + 20_000)).toEqual([]);
  });

  it("puts your second tab in the lobby your first is in", () => {
    const p = new Presence(1);
    inDakar(p, "c1", jib);
    inDakar(p, "c2", awa);
    expect(lobbyOf(inDakar(p, "c3", awa))).toBe(2);
    expect(p.online()).toHaveLength(2);
  });

  it("gives everyone in a lobby their own number, and reuses the numbers that free up", () => {
    const p = new Presence();
    inDakar(p, "c1", jib);
    inDakar(p, "c2", awa);
    p.leave("c1");
    const out = inDakar(p, "c3", { login: "moussa", name: null, avatar: null });
    expect(out.find((o) => o.msg.type === "join")).toMatchObject({ msg: { player: { login: "moussa", slot: 0 } } });
  });
});

describe("movement frames", () => {
  it("says each mover once, in 8 bytes, with their latest position", () => {
    const p = new Presence();
    inDakar(p, "c1", jib);
    inDakar(p, "c2", awa);
    p.receive("c1", { type: "move", x: 1, z: 1, ry: 0, moving: true });
    p.receive("c2", { type: "move", x: -2.5, z: 3.25, ry: -1.5, moving: false });
    p.receive("c1", { type: "move", x: 12.34, z: -299.99, ry: 3.142, moving: true });
    const [{ frame }] = p.frames();
    expect(frame).toHaveLength(16);
    expect(frame.readUInt16LE(0)).toBe(0x8000);
    expect(frame.readInt16LE(2)).toBe(1234);
    expect(frame.readInt16LE(4)).toBe(-29999);
    expect(frame.readInt16LE(6)).toBe(3142);
    expect(frame.readUInt16LE(8)).toBe(1);
    expect(frame.readInt16LE(10)).toBe(-250);
    expect(frame.readInt16LE(12)).toBe(325);
    expect(frame.readInt16LE(14)).toBe(-1500);
    expect(p.frames()).toEqual([]);
  });

  it("forgets the moves of someone who left, so their number can't be misread", () => {
    const p = new Presence();
    inDakar(p, "c1", jib);
    inDakar(p, "c2", awa);
    p.receive("c1", { type: "move", x: 1, z: 1, ry: 0, moving: true });
    p.leave("c1");
    expect(p.frames()).toEqual([]);
  });
});

describe("status, for friends' lists", () => {
  it("is online once connected, with the city once in one, and offline once gone", () => {
    const p = new Presence();
    expect(p.statusOf("jib")).toBe("offline");
    p.join("c1", jib);
    expect(p.statusOf("jib")).toBe("online");
    expect(p.cityOf("jib")).toBeNull();
    p.receive("c1", { type: "place", place: "Dakar" });
    expect(p.cityOf("jib")).toBe("Dakar");
    p.leave("c1");
    expect(p.statusOf("jib")).toBe("offline");
    expect(p.cityOf("jib")).toBeNull();
  });

  it("follows what the tab says: idle, away, online again", () => {
    const p = new Presence();
    inDakar(p, "c1", jib);
    expect(p.receive("c1", { type: "status", status: "idle" })).toEqual([]);
    expect(p.statusOf("jib")).toBe("idle");
    p.receive("c1", { type: "status", status: "away" });
    expect(p.statusOf("jib")).toBe("away");
    p.receive("c1", { type: "status", status: "online" });
    expect(p.statusOf("jib")).toBe("online");
  });

  it("counts the most present of someone's tabs", () => {
    const p = new Presence();
    inDakar(p, "c1", jib);
    inDakar(p, "c2", jib);
    p.receive("c1", { type: "status", status: "away" });
    expect(p.statusOf("jib")).toBe("online");
    p.receive("c2", { type: "status", status: "idle" });
    expect(p.statusOf("jib")).toBe("idle");
    p.leave("c2");
    expect(p.statusOf("jib")).toBe("away");
  });

  it("names whose status or city changed since last asked, once each, and only real changes", () => {
    const p = new Presence();
    p.join("c1", jib);
    p.receive("c1", { type: "place", place: "Dakar" });
    expect(p.statusChanges()).toEqual(["jib"]);
    expect(p.statusChanges()).toEqual([]);
    // Saying the same again changes nothing.
    p.receive("c1", { type: "status", status: "online" });
    expect(p.statusChanges()).toEqual([]);
    p.receive("c1", { type: "status", status: "idle" });
    p.receive("c1", { type: "place", place: "Lomé" });
    inDakar(p, "c2", awa);
    expect(p.statusChanges().sort()).toEqual(["awa", "jib"]);
    // A second tab, online while the first is idle: news. Its going: news again.
    p.join("c3", jib);
    expect(p.statusChanges()).toEqual(["jib"]);
    p.leave("c3");
    expect(p.statusChanges()).toEqual(["jib"]);
    p.leave("c1");
    expect(p.statusChanges()).toEqual(["jib"]);
  });

  it("ignores visitors, the workshop's city, bad statuses and floods", () => {
    const p = new Presence();
    inDakar(p, "v", null);
    p.receive("v", { type: "status", status: "idle" });
    expect(p.statusChanges()).toEqual([]);
    p.join("c1", jib);
    p.receive("c1", { type: "place", place: "tutorial:jib" });
    expect(p.cityOf("jib")).toBeNull();
    p.receive("c1", { type: "status", status: "busy" });
    p.receive("c1", { type: "status" });
    expect(p.statusOf("jib")).toBe("online");
    // Six changes in ten seconds, then the rest are dropped until the window passes.
    for (let i = 0; i < 6; i++) p.receive("c1", { type: "status", status: i % 2 ? "online" : "away" }, 1000 + i);
    p.receive("c1", { type: "status", status: "idle" }, 2000);
    expect(p.statusOf("jib")).toBe("online");
    p.receive("c1", { type: "status", status: "idle" }, 12_000);
    expect(p.statusOf("jib")).toBe("idle");
  });
});
