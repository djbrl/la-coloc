// Who is in a house and what a viewer should do there, worked out from the house view alone. No DOM here, so the
// house panel's choices (the faces under its name, the one button in its foot, the one button on each room row)
// are easy to test and read the same way everywhere.
import type { HouseView, Person, Room, Viewer } from "../../../types";
import { explain } from "../panel/words";
import { houseWords } from "./words";

// One place in the crew row under the house's name: someone who lives here, someone knocking, or a free room.
export type Seat =
  | { kind: "person"; key: string; person: Person; room: string | null; chef: boolean; you: boolean }
  | { kind: "knock"; key: string; person: Person; id: string; room: string }
  | { kind: "free"; key: string; room: string };

/** The crew row: the chef first, then everyone else in room order, then anyone knocking, then the free rooms. */
export function crewOf(house: Pick<HouseView, "rooms" | "members" | "chef" | "doorbell">, me: string | null): Seat[] {
  const chef = house.chef?.login ?? null;
  const people: Seat[] = [];
  const seen = new Set<string>();
  const add = (person: Person, room: string | null) => {
    if (seen.has(person.login)) return;
    seen.add(person.login);
    people.push({ kind: "person", key: `p:${person.login}`, person, room, chef: person.login === chef, you: person.login === me });
  };
  for (const r of house.rooms) if (r.occupant) add(r.occupant, r.name);
  // A flatmate without a room (rare: between two projects) still lives here.
  for (const m of house.members) add(m, null);
  // The chef leads the line-up; the sort is stable, so everyone else keeps the rooms' order.
  people.sort((a, b) => Number(b.kind === "person" && b.chef) - Number(a.kind === "person" && a.chef));

  // Only flatmates get the doorbell; for everyone else it's null.
  const knocks: Seat[] = (house.doorbell ?? []).map((d) => ({ kind: "knock", key: `k:${d.id}`, person: d.applicant, id: d.id, room: d.room }));
  const free: Seat[] = house.rooms.filter((r) => !r.occupant).map((r) => ({ kind: "free", key: `f:${r.name}`, room: r.name }));
  return [...people, ...knocks, ...free];
}

// What the foot of the house panel offers: the one next step for this viewer, or a line saying there's none.
export type Foot =
  | { kind: "login" }
  | { kind: "rent"; waiting: boolean }
  | { kind: "room"; room: string }
  // One free room: the button knocks on it.
  | { kind: "knock"; room: string }
  // Several free rooms: the button points at their rows, and you pick one there.
  | { kind: "pick" }
  | { kind: "thread"; id: string }
  | { kind: "say"; text: string };

export interface Situation {
  viewer: Viewer | null;
  making: boolean;
  // The chef made the server's key and is waiting for it to call home.
  keyMade: boolean;
  // An example house in the city: nothing to join.
  demo: boolean;
  // The tutorial's workshop: a newcomer takes a room there instead of knocking.
  tutorial: boolean;
  freeRooms: string[];
}

// The few sentences the foot says when there's no button to press are `houseWords.foot` (house/words.ts), read
// each time so they're in the language chosen now. panel/words.ts has the rest.

/** Knocking needs a real house with a free room, and you logged in, not living there, with no knock already open. */
export function canKnock(s: Situation): boolean {
  const v = s.viewer;
  return !!v && !v.member && !v.application && !s.demo && !s.tutorial && s.freeRooms.length > 0;
}

/** The one next step for this viewer. */
export function footFor(s: Situation): Foot {
  const v = s.viewer;
  if (!v) return { kind: "login" };
  if (s.tutorial && !v.room) return { kind: "say", text: houseWords.foot.takeRoom };
  if (v.member) {
    if (v.role === "chef" && s.making) return { kind: "rent", waiting: s.keyMade };
    if (s.making) return { kind: "say", text: houseWords.foot.waitChef };
    if (v.room) return { kind: "room", room: v.room };
    return { kind: "say", text: explain.house };
  }
  if (v.application) return { kind: "thread", id: v.application };
  if (canKnock(s)) return s.freeRooms.length === 1 ? { kind: "knock", room: s.freeRooms[0] } : { kind: "pick" };
  if (s.demo) return { kind: "say", text: houseWords.foot.example };
  return { kind: "say", text: houseWords.foot.full };
}

// The one button at the end of a room's row. A row never repeats the foot: when the foot already opens your room or
// knocks on the only free one, that row offers what's left (visiting your project) or nothing.
export type RowAction = "open" | "visit" | "knock" | null;

export function rowAction(room: Pick<Room, "name" | "status" | "url" | "occupant" | "demo">, s: Situation, foot: Foot): RowAction {
  if (!room.occupant) {
    if (!canKnock(s)) return null;
    return foot.kind === "knock" && foot.room === room.name ? null : "knock";
  }
  if (s.making) return null;
  // A seeded example room shows as lived in, but nothing runs at its address.
  const visitable = !room.demo && room.status === "live" && !!room.url;
  if (s.viewer?.room === room.name) {
    if (foot.kind === "room" && foot.room === room.name) return visitable ? "visit" : null;
    return "open";
  }
  return visitable ? "visit" : null;
}

// ---- A person picked in the crew row: what you can do about them ----

// Reaching out, without direct messages (the team chose: the house chat and knock threads only). A flatmate writes to
// them in the house chat; an outsider knocks on their house (or opens the knock they have); someone logged out is
// asked to log in. Nothing when it's you, or when there's no way in (a full or example house).
export type ReachOut =
  | { kind: "chat" }
  | { kind: "knock"; room: string }
  | { kind: "pick" }
  | { kind: "thread"; id: string }
  | { kind: "login" }
  | null;

export interface PersonActions {
  reach: ReachOut;
  // Their GitHub profile, only for someone with a real GitHub account: a made-up person's login may well be a
  // stranger's handle on GitHub, so it's never linked.
  github: string | null;
  // A made-up person, seeded so the city isn't empty: said in words on their card.
  example: boolean;
  // Waving is your avatar's emote in the city: only from the lobby, logged in, at someone else.
  wave: boolean;
}

export function personActions(person: Person, roomDemo: boolean, s: Situation, opts: { inCity: boolean }): PersonActions {
  const you = s.viewer?.login === person.login;
  const example = s.demo || roomDemo || person.github === false;
  const github = person.github === true ? `https://github.com/${encodeURIComponent(person.login)}` : null;
  const wave = opts.inCity && !!s.viewer && !you;
  if (you) return { reach: null, github, example, wave: false };
  // Logged out: logging in is a way in only where there's a room to knock on.
  if (!s.viewer) return { reach: !s.demo && !s.tutorial && s.freeRooms.length ? { kind: "login" } : null, github, example, wave };
  if (s.viewer?.member) return { reach: s.making ? null : { kind: "chat" }, github, example, wave };
  const foot = footFor(s);
  const reach: ReachOut = foot.kind === "knock" || foot.kind === "pick" || foot.kind === "thread" || foot.kind === "login" ? foot : null;
  return { reach, github, example, wave };
}
