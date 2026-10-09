import { describe, expect, it } from "vitest";
import { Presence } from "./presence";

const jib = { login: "jib", name: "Jib", avatar: "male-a" };
const awa = { login: "awa", name: "Awa", avatar: null };

describe("lobby presence", () => {
  it("shows a newcomer everyone already there, and tells the others they arrived", () => {
    const p = new Presence();
    p.join("c1", jib);
    const out = p.join("c2", awa);
    expect(out[0]).toMatchObject({ to: "one", conn: "c2", msg: { type: "snapshot", you: "awa", players: [{ login: "jib" }] } });
    expect(out[1]).toMatchObject({ to: "all-but", except: "c2", msg: { type: "join", player: { login: "awa" } } });
  });

  it("lets visitors watch without appearing or moving anyone", () => {
    const p = new Presence();
    p.join("c1", jib);
    expect(p.join("v", null)).toEqual([{ to: "one", conn: "v", msg: { type: "snapshot", you: null, players: [expect.objectContaining({ login: "jib" })] } }]);
    expect(p.receive("v", { type: "move", x: 1, z: 1, ry: 0, moving: true })).toEqual([]);
    expect(p.online()).toEqual(["jib"]);
  });

  it("relays moves and emotes to the others", () => {
    const p = new Presence();
    p.join("c1", jib);
    expect(p.receive("c1", { type: "move", x: 3, z: -2, ry: 1.5, moving: true })).toEqual([
      { to: "all-but", except: "c1", msg: { type: "move", login: "jib", x: 3, z: -2, ry: 1.5, moving: true } },
    ]);
    expect(p.receive("c1", { type: "emote", name: "yes" })[0].msg).toEqual({ type: "emote", login: "jib", name: "yes" });
  });

  it("drops nonsense: unknown messages, teleports off the map, bad emotes", () => {
    const p = new Presence();
    p.join("c1", jib);
    expect(p.receive("c1", { type: "teleport" })).toEqual([]);
    expect(p.receive("c1", { type: "move", x: 1e9, z: 0, ry: 0, moving: false })).toEqual([]);
    expect(p.receive("c1", { type: "move", x: NaN, z: 0, ry: 0, moving: false })).toEqual([]);
    expect(p.receive("c1", { type: "emote", name: "rude" })).toEqual([]);
  });

  it("brakes floods", () => {
    const p = new Presence();
    p.join("c1", jib);
    let relayed = 0;
    for (let i = 0; i < 50; i++) relayed += p.receive("c1", { type: "move", x: i, z: 0, ry: 0, moving: true }, 1000).length;
    expect(relayed).toBe(20);
    expect(p.receive("c1", { type: "move", x: 0, z: 0, ry: 0, moving: true }, 2100)).toHaveLength(1);
  });

  it("keeps someone with two tabs until their last tab closes", () => {
    const p = new Presence();
    p.join("c1", jib);
    expect(p.join("c2", jib).map((o) => o.msg.type)).toEqual(["snapshot"]);
    expect(p.leave("c1")).toEqual([]);
    expect(p.online()).toEqual(["jib"]);
    expect(p.leave("c2")).toEqual([{ to: "all-but", except: "c2", msg: { type: "leave", login: "jib" } }]);
  });
});
