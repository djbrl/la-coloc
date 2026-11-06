import { describe, expect, it } from "vitest";
import type { HouseView, Person, Room, Viewer } from "../../../types";
import { canKnock, chatKey, crewOf, foldedRooms, footFor, liveAddress, myRooms, personActions, planGrid, roomKeys, type Situation } from "./crew";
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

  it("puts the chef first, then the rooms' order, then knocks", () => {
    const seats = crewOf(house, "awa");
    expect(seats.map((s) => s.key)).toEqual(["p:moussa", "p:awa", "p:ibou", "k:k1"]);
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

  it("says when someone with no room left stops being on the bill", () => {
    const left = viewer({ member: true, role: "flatmate", room: null, rooms: [], leavingUntil: "2026-11-30T23:59:59.999Z" });
    expect(footFor(situation({ viewer: left }))).toEqual({ kind: "say", text: houseWords.foot.leaving("30 November") });
  });

  it("knows all the rooms someone rents, from an older API too", () => {
    expect(myRooms(viewer({ room: "a", rooms: ["a", "b"] }))).toEqual(["a", "b"]);
    expect(myRooms(viewer({ room: "a" }))).toEqual(["a"]);
    expect(myRooms(null)).toEqual([]);
  });

  it("adds nothing for a flatmate in a full house: their room's square on the floor plan is the way in", () => {
    expect(footFor(situation({ viewer: viewer({ member: true, role: "flatmate", room: "two" }) }))).toEqual({ kind: "none" });
  });

  it("offers a flatmate to invite someone while a room is free, except in an example or the workshop", () => {
    const flatmate = viewer({ member: true, role: "flatmate", room: "two" });
    expect(footFor(situation({ viewer: flatmate, freeRooms: ["three"] }))).toEqual({ kind: "invite" });
    expect(footFor(situation({ viewer: flatmate, freeRooms: ["three"], demo: true }))).toEqual({ kind: "none" });
    expect(footFor(situation({ viewer: flatmate, freeRooms: ["three"], tutorial: true }))).toEqual({ kind: "none" });
  });

  it("gives lived-in rooms the space once two squares are free", () => {
    expect(planGrid(4, 0)).toBeNull();
    expect(planGrid(3, 1)).toBeNull();
    expect(planGrid(0, 4)).toBeNull();
    const alone = planGrid(1, 3)!;
    expect([alone.livedRows, alone.openRows, alone.livedSpan(0), alone.openSpan]).toEqual([1, 1, 12, 4]);
    const three = planGrid(3, 5)!;
    expect([three.livedRows, three.openRows, three.livedSpan(0), three.livedSpan(2), three.openSpan]).toEqual([2, 2, 6, 12, 3]);
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
    expect(footFor(situation({ demo: true, freeRooms: [] }))).toEqual({ kind: "askChat" });
  });

  it("offers a full house's group chat instead, and says where the request stands", () => {
    expect(footFor(situation())).toEqual({ kind: "askChat" });
    expect(footFor(situation({ viewer: viewer({ guest: "open" }) }))).toEqual({ kind: "say", text: houseWords.foot.chatAsked });
    expect(footFor(situation({ viewer: viewer({ guest: "accepted" }) }))).toEqual({ kind: "none" });
    expect(footFor(situation({ viewer: viewer({ guest: "declined" }) }))).toEqual({ kind: "say", text: houseWords.foot.full });
  });

  it("leaves the foot empty in the workshop until you have a room: its row (or the quest) offers it once", () => {
    expect(footFor(situation({ tutorial: true, freeRooms: ["three"] }))).toEqual({ kind: "none" });
  });
});

describe("a room's page: its keys", () => {
  const awa: Person = { ...person("awa"), github: true };
  const seeded: Person = { ...person("ibou"), github: false };
  const flatmate = viewer({ member: true, role: "flatmate", room: "one" });

  it("manages your own room, online or not, even while the house is being made", () => {
    const mine = room("one", person("jib"));
    expect(roomKeys(mine, situation({ viewer: flatmate })).main).toEqual({ kind: "manage" });
    expect(roomKeys(mine, situation({ viewer: viewer({ member: true, role: "chef", room: "one" }), making: true })).main).toEqual({ kind: "manage" });
  });

  it("manages your room by who lives there, also when it isn't your first one", () => {
    expect(roomKeys(room("nine", person("jib")), situation({ viewer: flatmate })).main).toEqual({ kind: "manage" });
  });

  it("chats with a flatmate, made-up or not", () => {
    expect(roomKeys(room("two", awa), situation({ viewer: flatmate }))).toEqual({ main: { kind: "chat", login: "awa" }, second: null });
    expect(roomKeys(room("two", seeded), situation({ viewer: flatmate })).main).toEqual({ kind: "chat", login: "ibou" });
    expect(roomKeys(room("two", awa, { demo: true }), situation({ viewer: flatmate })).main).toEqual({ kind: "chat", login: "awa" });
  });

  it("puts Chat first from outside, with the knock beside it", () => {
    const chat = { kind: "chat", login: "awa" };
    expect(roomKeys(room("two", awa), situation({ freeRooms: ["four"] }))).toEqual({ main: chat, second: { kind: "knock", room: "four" } });
    expect(roomKeys(room("two", awa), situation({ freeRooms: ["three", "four"] }))).toEqual({ main: chat, second: { kind: "pick" } });
    expect(roomKeys(room("two", awa), situation({ viewer: viewer({ application: "k9" }) }))).toEqual({ main: chat, second: { kind: "thread", id: "k9" } });
  });

  it("is only a chat request at a full house", () => {
    expect(roomKeys(room("two", awa), situation())).toEqual({ main: { kind: "chat", login: "awa" }, second: null });
  });

  it("knocks on a free room, or asks you to log in", () => {
    const free = room("three", null);
    expect(roomKeys(free, situation({ freeRooms: ["three"] })).main).toEqual({ kind: "knock", room: "three" });
    expect(roomKeys(free, situation({ viewer: null, freeRooms: ["three"] })).main).toEqual({ kind: "login" });
    expect(roomKeys(free, situation({ viewer: viewer({ application: "k9" }), freeRooms: ["three"] })).main).toEqual({ kind: "thread", id: "k9" });
  });

  it("lets someone who lives here take a free room, but not in an example house or the workshop", () => {
    const free = room("three", null);
    expect(roomKeys(free, situation({ viewer: flatmate, freeRooms: ["three"] }))).toEqual({ main: { kind: "take", room: "three" }, second: null });
    expect(roomKeys(free, situation({ viewer: flatmate, demo: true, freeRooms: ["three"] })).main).toBeNull();
    expect(roomKeys(free, situation({ viewer: flatmate, tutorial: true, freeRooms: ["three"] })).main).toBeNull();
    expect(roomKeys({ ...free, demo: true }, situation({ viewer: flatmate, freeRooms: ["three"] })).main).toBeNull();
  });

  it("keeps Chat on an example house's people, and nothing to press on its free rooms", () => {
    expect(roomKeys(room("two", seeded), situation({ demo: true, freeRooms: ["four"] }))).toEqual({ main: { kind: "chat", login: "ibou" }, second: null });
    expect(roomKeys(room("two", seeded), situation({ viewer: null, demo: true })).main).toEqual({ kind: "chatLogin" });
    expect(roomKeys(room("three", null), situation({ demo: true, freeRooms: ["three"] }))).toEqual({ main: null, second: null });
  });

  it("takes you to log in from Chat when you're logged out", () => {
    expect(roomKeys(room("two", awa), situation({ viewer: null })).main).toEqual({ kind: "chatLogin" });
    expect(roomKeys(room("two", awa), situation({ viewer: null, freeRooms: ["four"] })).main).toEqual({ kind: "chatLogin" });
  });

  it("shows a project's address only when something runs there", () => {
    expect(liveAddress(room("two", awa))).toBe("http://two.coloc.localhost");
    expect(liveAddress(room("two", awa, { demo: true }))).toBeNull();
    expect(liveAddress(room("two", awa, { status: "down" }))).toBeNull();
  });
});

describe("a housemate's Chat key", () => {
  const awa: Person = { ...person("awa"), github: true };
  const flatmate = viewer({ member: true, role: "flatmate", room: "one" });

  it("writes to real people, inside the house or out, never to yourself", () => {
    expect(chatKey(awa, situation({ viewer: flatmate }))).toEqual({ kind: "chat", login: "awa" });
    expect(chatKey(awa, situation())).toEqual({ kind: "chat", login: "awa" });
    expect(chatKey({ ...awa, login: "jib" }, situation({ viewer: flatmate }))).toBeNull();
  });

  it("takes you to log in when you're logged out", () => {
    expect(chatKey(awa, situation({ viewer: null }))).toEqual({ kind: "chatLogin" });
  });

  it("works on a made-up person too, whoever you are", () => {
    const seeded: Person = { ...person("ibou"), github: false };
    expect(chatKey(seeded, situation({ viewer: flatmate }))).toEqual({ kind: "chat", login: "ibou" });
    expect(chatKey(seeded, situation())).toEqual({ kind: "chat", login: "ibou" });
    expect(chatKey(seeded, situation({ viewer: null }))).toEqual({ kind: "chatLogin" });
    expect(chatKey(awa, situation({ demo: true }))).toEqual({ kind: "chat", login: "awa" });
  });

  it("is there on everyone but you: there's always a way to start talking", () => {
    const viewers = [flatmate, viewer(), viewer({ application: "k9" }), null];
    const people: Person[] = [awa, { ...person("ibou"), github: false }, person("moussa")];
    for (const v of viewers) for (const p of people) expect(chatKey(p, situation({ viewer: v }))).not.toBeNull();
  });
});

describe("a person on a room's page", () => {
  const real: Person = { ...person("awa"), github: true };
  const seeded: Person = { ...person("ibou"), github: false };
  const none = {};

  it("links a GitHub profile only for a real account, and marks made-up people as examples", () => {
    expect(personActions(real, false, situation(), none)).toMatchObject({ github: "https://github.com/awa", example: false });
    expect(personActions(seeded, false, situation(), none)).toMatchObject({ github: null, example: true });
    // An older API doesn't say: no link, and only the house's own flags make an example.
    expect(personActions(person("moussa"), false, situation(), none)).toMatchObject({ github: null, example: false });
    expect(personActions(person("ndeye"), true, situation(), none).example).toBe(true);
    // Someone in an example room or house stays unlinked, whatever their record says.
    expect(personActions(real, true, situation(), none).github).toBeNull();
    expect(personActions(real, false, situation({ demo: true }), none).github).toBeNull();
  });

  it("lets someone with a real house invite a newcomer they meet in the workshop, once", () => {
    const workshop = situation({ tutorial: true, viewer: viewer({ member: true, room: "jib-home" }) });
    const home = { id: "sacre-coeur", name: "Sacré-Cœur" };
    expect(personActions(real, false, workshop, { home }).invite).toEqual({ kind: "invite", houseId: "sacre-coeur", houseName: "Sacré-Cœur" });
    expect(personActions(real, false, workshop, { home, invited: true }).invite).toEqual({ kind: "invited" });
    // Not without a house of your own, not an example person, not outside the workshop, not yourself.
    expect(personActions(real, false, workshop, none).invite).toBeNull();
    expect(personActions(seeded, false, workshop, { home }).invite).toBeNull();
    expect(personActions(real, false, situation({ viewer: viewer({ member: true }) }), { home }).invite).toBeNull();
    expect(personActions({ ...person("jib"), github: true }, false, workshop, { home }).invite).toBeNull();
  });
});

describe("a long room list, folded", () => {
  const rooms = ["a", "b", "c", "d", "e", "f", "g", "h"].map((n) => room(n, n === "g" ? null : person(`p${n}`)));

  it("shows every room when they fit, or when only one would be folded", () => {
    expect(foldedRooms(rooms.slice(0, 5), [], 5)).toEqual({ shown: rooms.slice(0, 5), hidden: 0 });
    expect(foldedRooms(rooms.slice(0, 6), [], 5).hidden).toBe(0);
  });

  it("keeps what fits, yours and the free ones first, in the house's order, and counts the rest", () => {
    const { shown, hidden } = foldedRooms(rooms, ["h"], 5);
    expect(hidden).toBe(3);
    expect(shown.map((r) => r.name)).toEqual(["a", "b", "c", "g", "h"]);
  });

  it("makes room for a row above the list", () => {
    expect(foldedRooms(rooms, [], 4).shown).toHaveLength(4);
  });
});
