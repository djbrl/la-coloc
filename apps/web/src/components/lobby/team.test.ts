import { describe, expect, it } from "vitest";
import type { Person } from "../../types";
import { canRemove, teamNames, teamUp } from "./team";

const person = (login: string, name: string | null = null): Person => ({ login, name, avatarUrl: null });
const room = (name: string, occupant: string | null, team: string[] = []) => ({ name, occupant: occupant ? person(occupant) : null, team: team.map((l) => person(l)) });
const house = (...rooms: ReturnType<typeof room>[]) => ({ demo: false, rooms });
const jib = { login: "jib" };
const awa = { login: "awa", example: false };

describe("teaming up on a flatmate's card", () => {
  it("looks at all the rooms either of you rents", () => {
    const withProject = { ...room("b", "jib"), project: "Ndaje" };
    expect(teamUp(awa, jib, house(room("a", "jib"), withProject, room("c", "awa")), "a", [])).toEqual({ kind: "offer", join: "c", bring: "b" });
    expect(teamUp(awa, jib, house(room("a", "jib"), room("b", "jib", ["awa"]), room("c", "awa")), "a", [])).toEqual({ kind: "together" });
    expect(teamUp(awa, jib, house(room("a", "jib"), room("c", "awa"), room("d", "awa", ["jib"])), "a", [])).toEqual({ kind: "together" });
  });

  it("offers both ways round between two flatmates", () => {
    expect(teamUp(awa, jib, house(room("jib", "jib"), room("ndaje", "awa")), "jib", [])).toEqual({ kind: "offer", join: "ndaje", bring: "jib" });
  });

  it("says you're together once either of you is on the other's project", () => {
    expect(teamUp(awa, jib, house(room("jib", "jib"), room("ndaje", "awa", ["jib"])), "jib", [])).toEqual({ kind: "together" });
    expect(teamUp(awa, jib, house(room("jib", "jib", ["awa"]), room("ndaje", "awa")), "jib", [])).toEqual({ kind: "together" });
  });

  it("waits for an answer, which you can take back", () => {
    const sent = [{ id: "n7", kind: "team_ask" as const, to: "awa", houseId: "sacre-coeur", room: "ndaje" }];
    expect(teamUp(awa, jib, house(room("jib", "jib"), room("ndaje", "awa")), "jib", sent)).toEqual({ kind: "waiting", requestId: "n7" });
    // A house invitation to the same person is another matter.
    const other = [{ id: "n8", kind: "house_invite" as const, to: "awa", houseId: "sacre-coeur" }];
    expect(teamUp(awa, jib, house(room("jib", "jib"), room("ndaje", "awa")), "jib", other)).toMatchObject({ kind: "offer" });
  });

  it("leaves out a full team's way, and offers nothing when both are full", () => {
    const full = ["a", "b", "c"];
    expect(teamUp(awa, jib, house(room("jib", "jib"), room("ndaje", "awa", full)), "jib", [])).toEqual({ kind: "offer", join: null, bring: "jib" });
    expect(teamUp(awa, jib, house(room("jib", "jib", full), room("ndaje", "awa", full)), "jib", [])).toBeNull();
  });

  it("is only for flatmates: not you, not someone elsewhere, not without a room, not an example", () => {
    const h = house(room("jib", "jib"), room("ndaje", "awa"));
    expect(teamUp({ login: "jib", example: false }, jib, h, "jib", [])).toBeNull();
    expect(teamUp({ login: "kofi", example: false }, jib, h, "jib", [])).toBeNull();
    expect(teamUp(awa, jib, h, null, [])).toBeNull();
    expect(teamUp(awa, null, h, "jib", [])).toBeNull();
    expect(teamUp({ ...awa, example: true }, jib, h, "jib", [])).toBeNull();
    expect(teamUp(awa, jib, { ...h, demo: true }, "jib", [])).toBeNull();
  });
});

describe("a room's people", () => {
  it("writes the occupant, then their teammates", () => {
    expect(teamNames(person("awa", "Awa Ndiaye"))).toBe("Awa Ndiaye");
    expect(teamNames(person("awa", "Awa Ndiaye"), [person("moussa", "Moussa Fall")])).toBe("Awa + Moussa");
    expect(teamNames(person("awa", "Awa"), [person("b"), person("c")])).toBe("Awa + b + c");
    expect(teamNames(person("awa", "Awa"), [person("b"), person("c"), person("d")])).toBe("Awa + b + 2");
  });

  it("lets the occupant remove a teammate, and a teammate leave", () => {
    const r = room("ndaje", "awa", ["jib", "kofi"]);
    expect(canRemove("awa", r, "jib")).toBe(true);
    expect(canRemove("jib", r, "jib")).toBe(true);
    expect(canRemove("jib", r, "kofi")).toBe(false);
    expect(canRemove("awa", r, "moussa")).toBe(false);
    expect(canRemove(null, r, "jib")).toBe(false);
  });
});
