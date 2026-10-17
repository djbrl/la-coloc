import { describe, expect, it } from "vitest";
import type { HouseView, Person, Room, Viewer } from "../../../types";
import { canKnock, crewOf, footFor, personActions, rowAction, type Situation } from "./crew";
import { houseWords } from "./words";

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
    expect(footFor(situation({ viewer: viewer({ member: true, role: "flatmate", room: "two" }), making: true }))).toEqual({ kind: "say", text: houseWords.foot.waitChef });
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
    expect(footFor(situation({ demo: true, freeRooms: ["three"] }))).toEqual({ kind: "say", text: houseWords.foot.example });
    expect(footFor(situation())).toEqual({ kind: "say", text: houseWords.foot.full });
  });

  it("leaves the foot empty in the workshop until you have a room: its row (or the quest) offers it once", () => {
    expect(footFor(situation({ tutorial: true, freeRooms: ["three"] }))).toEqual({ kind: "none" });
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

describe("a person picked in the crew row", () => {
  const real: Person = { ...person("awa"), github: true };
  const seeded: Person = { ...person("ibou"), github: false };
  const city = { inCity: true };

  it("lets a flatmate reach out in the house chat, and wave from the city", () => {
    const a = personActions(real, false, situation({ viewer: viewer({ member: true, room: "jib" }) }), city);
    expect(a.reach).toEqual({ kind: "chat" });
    expect(a.wave).toBe(true);
    expect(personActions(real, false, situation({ viewer: viewer({ member: true }) }), { inCity: false }).wave).toBe(false);
  });

  it("lets an outsider knock on their house, or open the knock they already have", () => {
    expect(personActions(real, false, situation({ freeRooms: ["four"] }), city).reach).toEqual({ kind: "knock", room: "four" });
    expect(personActions(real, false, situation({ freeRooms: ["three", "four"] }), city).reach).toEqual({ kind: "pick" });
    expect(personActions(real, false, situation({ viewer: viewer({ application: "k9" }) }), city).reach).toEqual({ kind: "thread", id: "k9" });
    expect(personActions(real, false, situation({ viewer: null, freeRooms: ["four"] }), city).reach).toEqual({ kind: "login" });
  });

  it("offers no way in at a full house or an example one, and nothing to yourself", () => {
    expect(personActions(real, false, situation(), city).reach).toBeNull();
    expect(personActions(seeded, false, situation({ demo: true, freeRooms: ["four"] }), city).reach).toBeNull();
    expect(personActions(seeded, false, situation({ viewer: null, demo: true }), city).reach).toBeNull();
    expect(personActions(real, false, situation({ viewer: null }), city).reach).toBeNull();
    const you = personActions({ ...person("jib"), github: true }, false, situation(), city);
    expect(you).toEqual({ reach: null, github: "https://github.com/jib", example: false, wave: false, invite: null });
  });

  it("links a GitHub profile only for a real account, and marks made-up people as examples", () => {
    expect(personActions(real, false, situation(), city)).toMatchObject({ github: "https://github.com/awa", example: false });
    expect(personActions(seeded, false, situation(), city)).toMatchObject({ github: null, example: true });
    // An older API doesn't say: no link, and only the house's own flags make an example.
    expect(personActions(person("moussa"), false, situation(), city)).toMatchObject({ github: null, example: false });
    expect(personActions(person("ndeye"), true, situation(), city).example).toBe(true);
  });

  it("lets someone with a real house invite a newcomer they meet in the workshop, once", () => {
    const workshop = situation({ tutorial: true, viewer: viewer({ member: true, room: "jib-home" }) });
    const home = { id: "sacre-coeur", name: "Sacré-Cœur" };
    expect(personActions(real, false, workshop, { ...city, home }).invite).toEqual({ kind: "invite", houseId: "sacre-coeur", houseName: "Sacré-Cœur" });
    expect(personActions(real, false, workshop, { ...city, home, invited: true }).invite).toEqual({ kind: "invited" });
    // Not without a house of your own, not an example person, not outside the workshop, not yourself.
    expect(personActions(real, false, workshop, city).invite).toBeNull();
    expect(personActions(seeded, false, workshop, { ...city, home }).invite).toBeNull();
    expect(personActions(real, false, situation({ viewer: viewer({ member: true }) }), { ...city, home }).invite).toBeNull();
    expect(personActions({ ...person("jib"), github: true }, false, workshop, { ...city, home }).invite).toBeNull();
  });
});
