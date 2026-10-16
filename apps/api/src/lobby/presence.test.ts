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
    expect(p.join("c2", awa)).toEqual([{ to: "one", conn: "c2", msg: { type: "census", counts: { Dakar: 1 } } }]);
  });

  it("shows a newcomer who's in their neighbourhood, and tells that neighbourhood they arrived", () => {
    const p = new Presence();
    inDakar(p, "c1", jib);
    const out = inDakar(p, "c2", awa);
    expect(out[0]).toMatchObject({ to: "one", conn: "c2", msg: { type: "snapshot", place: "Dakar", players: [{ login: "jib" }] } });
    expect(out.find((o) => o.msg.type === "join")).toMatchObject({ to: "place", place: "Dakar", except: "c2", msg: { player: { login: "awa" } } });
    expect(out.find((o) => o.msg.type === "census")!.msg).toEqual({ type: "census", counts: { Dakar: 2 } });
  });

  it("keeps neighbourhoods apart: moving to Lomé leaves Dakar", () => {
    const p = new Presence();
    inDakar(p, "c1", jib);
    inDakar(p, "c2", awa);
    const out = p.receive("c2", { type: "place", place: "Lomé" });
    expect(types(out)).toEqual(["one:snapshot", "place:leave", "place:join", "all:census"]);
    expect(out[0].msg).toMatchObject({ place: "Lomé", players: [] });
    expect(out[1]).toMatchObject({ place: "Dakar", msg: { login: "awa" } });
    expect(p.counts()).toEqual({ Dakar: 1, Lomé: 1 });
    expect(p.receive("c1", { type: "move", x: 1, z: 1, ry: 0, moving: true })).toEqual([
      { to: "place", place: "Dakar", except: "c1", msg: { type: "move", login: "jib", x: 1, z: 1, ry: 0, moving: true } },
    ]);
  });

  it("lets visitors watch a neighbourhood without appearing or moving anyone", () => {
    const p = new Presence();
    inDakar(p, "c1", jib);
    const out = inDakar(p, "v", null);
    expect(out).toEqual([{ to: "one", conn: "v", msg: { type: "snapshot", you: null, place: "Dakar", players: [expect.objectContaining({ login: "jib" })] } }]);
    expect(p.receive("v", { type: "move", x: 1, z: 1, ry: 0, moving: true })).toEqual([]);
    expect(p.watching("Dakar").sort()).toEqual(["c1", "v"]);
    expect(p.online()).toEqual(["jib"]);
  });

  it("relays emotes within the neighbourhood", () => {
    const p = new Presence();
    inDakar(p, "c1", jib);
    expect(p.receive("c1", { type: "emote", name: "yes" })[0]).toEqual({ to: "place", place: "Dakar", except: "c1", msg: { type: "emote", login: "jib", name: "yes" } });
  });

  it("drops nonsense: unknown messages, teleports off the map, bad emotes, moving before arriving", () => {
    const p = new Presence();
    p.join("c1", jib);
    expect(p.receive("c1", { type: "move", x: 1, z: 1, ry: 0, moving: true })).toEqual([]);
    p.receive("c1", { type: "place", place: "Dakar" });
    expect(p.receive("c1", { type: "teleport" })).toEqual([]);
    expect(p.receive("c1", { type: "move", x: 1e9, z: 0, ry: 0, moving: false })).toEqual([]);
    expect(p.receive("c1", { type: "move", x: NaN, z: 0, ry: 0, moving: false })).toEqual([]);
    expect(p.receive("c1", { type: "emote", name: "rude" })).toEqual([]);
    expect(p.receive("c1", { type: "place", place: "x".repeat(200) })).toEqual([]);
  });

  it("brakes floods", () => {
    const p = new Presence();
    inDakar(p, "c1", jib);
    let relayed = 0;
    for (let i = 0; i < 50; i++) relayed += p.receive("c1", { type: "move", x: i, z: 0, ry: 0, moving: true }, 1000).length;
    expect(relayed).toBe(20);
    expect(p.receive("c1", { type: "move", x: 0, z: 0, ry: 0, moving: true }, 2100)).toHaveLength(1);
  });

  it("keeps someone with two tabs until their last tab closes", () => {
    const p = new Presence();
    inDakar(p, "c1", jib);
    inDakar(p, "c2", jib);
    expect(p.leave("c1")).toEqual([]);
    expect(p.online()).toEqual(["jib"]);
    expect(types(p.leave("c2"))).toEqual(["place:leave", "all:census"]);
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
