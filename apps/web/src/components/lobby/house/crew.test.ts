import { describe, expect, it } from "vitest";
import type { HouseView, Person, Room, Viewer } from "../../../types";
import { canKnock, crewOf, footFor, footLines, rowAction, type Situation } from "./crew";

const person = (login: string): Person => ({ login, name: login[0].toUpperCase() + login.slice(1), avatarUrl: null });
const room = (name: string, occupant: Person | null, extra: Partial<Room> = {}): Room => ({
  name,
  limits: { memoryMb: 256, cpus: 0.5 },
  status: occupant ? "live" : "empty",
  url: occupant ? `http://${name}.coloc.localhost` : null,
  project: occupant ? "A project" : null,
  projectDescription: null,
  ad: null,
  occupant,
  usage: null,
  ...extra,
});
const viewer = (v: Partial<Viewer> = {}): Viewer => ({ login: "jib", member: false, role: null, room: null, application: null, ...v });
const situation = (s: Partial<Situation> = {}): Situation => ({ viewer: viewer(), making: false, keyMade: false, demo: false, tutorial: false, freeRooms: [], ...s });

describe("the crew row", () => {
  const awa = person("awa");
  const moussa = person("moussa");
  const fatou = person("fatou");
  const house: Pick<HouseView, "rooms" | "members" | "chef" | "doorbell"> = {
    chef: moussa,
    rooms: [room("one", awa), room("two", moussa), room("three", null)],
    members: [
      { ...moussa, role: "chef" },
      { ...awa, role: "flatmate" },
      { ...person("ibou"), role: "flatmate" },
    ],
    doorbell: [{ id: "k1", room: "three", applicant: fatou, tally: { flatmates: 2, yes: 0, no: 0, needed: 2 }, createdAt: "" }],
  };

  it("puts the chef first, then the rooms' order, then knocks, then free rooms", () => {
    const seats = crewOf(house, "awa");
    expect(seats.map((s) => s.key)).toEqual(["p:moussa", "p:awa", "p:ibou", "k:k1", "f:three"]);
  });

  it("knows each person's room, the chef, and you", () => {
    const [chef, you, roomless] = crewOf(house, "awa");
    expect(chef).toMatchObject({ kind: "person", room: "two", chef: true, you: false });
    expect(you).toMatchObject({ kind: "person", room: "one", chef: false, you: true });
    expect(roomless).toMatchObject({ kind: "person", room: null });
  });

  it("shows no knocks to someone who can't see the doorbell", () => {
    expect(crewOf({ ...house, doorbell: null }, null).some((s) => s.kind === "knock")).toBe(false);
  });
});

describe("the foot's one next step", () => {
  it("asks a stranger to log in", () => {
    expect(footFor(situation({ viewer: null }))).toEqual({ kind: "login" });
  });

  it("sends the chef of a house being made to rent its server, once", () => {
    const chef = viewer({ member: true, role: "chef", room: "one" });
    expect(footFor(situation({ viewer: chef, making: true }))).toEqual({ kind: "rent", waiting: false });
    expect(footFor(situation({ viewer: chef, making: true, keyMade: true }))).toEqual({ kind: "rent", waiting: true });
    expect(footFor(situation({ viewer: viewer({ member: true, role: "flatmate", room: "two" }), making: true }))).toEqual({ kind: "say", text: footLines.waitChef });
  });

  it("opens a flatmate's room", () => {
    expect(footFor(situation({ viewer: viewer({ member: true, role: "flatmate", room: "two" }) }))).toEqual({ kind: "room", room: "two" });
  });

  it("knocks on the only free room, or points at the rows when there are several", () => {
    expect(footFor(situation({ freeRooms: ["three"] }))).toEqual({ kind: "knock", room: "three" });
    expect(footFor(situation({ freeRooms: ["three", "four"] }))).toEqual({ kind: "pick" });
  });

  it("shows a visitor their knock instead of a second one", () => {
    const s = situation({ viewer: viewer({ application: "k1" }), freeRooms: ["three"] });
    expect(footFor(s)).toEqual({ kind: "thread", id: "k1" });
    expect(canKnock(s)).toBe(false);
  });

  it("says why there's nothing to press", () => {
    expect(footFor(situation({ demo: true, freeRooms: ["three"] }))).toEqual({ kind: "say", text: footLines.example });
    expect(footFor(situation())).toEqual({ kind: "say", text: footLines.full });
    expect(footFor(situation({ tutorial: true, freeRooms: ["three"] }))).toEqual({ kind: "say", text: footLines.takeRoom });
  });
});

describe("a room row's one button", () => {
  const awa = person("awa");
  const mine = room("one", person("jib"));

  it("never repeats the foot", () => {
    const s = situation({ viewer: viewer({ member: true, role: "flatmate", room: "one" }) });
    // The foot opens your room, so your row offers your project's address instead.
    expect(rowAction(mine, s, footFor(s))).toBe("visit");
    expect(rowAction({ ...mine, status: "empty", url: null }, s, footFor(s))).toBe(null);

    const one = situation({ freeRooms: ["three"] });
    expect(rowAction(room("three", null), one, footFor(one))).toBe(null);
    const two = situation({ freeRooms: ["three", "four"] });
    expect(rowAction(room("three", null), two, footFor(two))).toBe("knock");
  });

  it("visits someone else's live room, but never an example one", () => {
    const s = situation();
    expect(rowAction(room("two", awa), s, footFor(s))).toBe("visit");
    expect(rowAction(room("two", awa, { demo: true }), s, footFor(s))).toBe(null);
    expect(rowAction(room("two", awa, { status: "down" }), s, footFor(s))).toBe(null);
  });

  it("offers nothing while the house is being made", () => {
    const s = situation({ viewer: viewer({ member: true, role: "chef", room: "one" }), making: true });
    expect(rowAction(mine, s, footFor(s))).toBe(null);
  });
});
