// Who is in a house and what a viewer should do there, worked out from the house view alone. No DOM here, so the
// house panel's choices (the housemates' list, the one button in its foot, the keys on a room's page) are easy to
// test and read the same way everywhere.
import type { HouseView, Person, Room, Viewer } from "../../../types";
import { messageAction } from "../../chat/chat";
import { dayName } from "./exchange";
import { explain } from "../panel/words";
import { houseWords } from "./words";

// One line of the housemates' list: someone who lives here, or someone knocking. (Free rooms are on the floor plan.)
export type Seat =
  | { kind: "person"; key: string; person: Person; room: string | null; chef: boolean; you: boolean }
  | { kind: "knock"; key: string; person: Person; id: string; room: string };

/** The housemates: the chef first, then everyone else in room order, then anyone knocking. */
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
  return [...people, ...knocks];
}

// What the foot of the house panel offers: the one next step for this viewer, or a line saying there's none.
export type Foot =
  | { kind: "login" }
  | { kind: "rent"; waiting: boolean }
  // One free room: the button knocks on it.
  | { kind: "knock"; room: string }
  // Several free rooms: the button points at their rows, and you pick one there.
  | { kind: "pick" }
  | { kind: "thread"; id: string }
  // A full house: ask to join its group chat.
  | { kind: "askChat" }
  | { kind: "say"; text: string }
  // You live here and rooms are free: bring someone in, and your rent goes down.
  | { kind: "invite" }
  // Nothing: the one next step is already on screen elsewhere (the workshop's "A room for you" row, or the quest's
  // card), so the foot doesn't say it a second time.
  | { kind: "none" };

export interface Situation {
  viewer: Viewer | null;
  making: boolean;
  // The chef made the server's key and is waiting for it to call home.
  keyMade: boolean;
  // An example house in the city: no rooms to join, though a full one lets you into its chat.
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
  if (s.tutorial && !v.room) return { kind: "none" };
  if (v.member) {
    if (v.role === "chef" && s.making) return { kind: "rent", waiting: s.keyMade };
    if (s.making) return { kind: "say", text: houseWords.foot.waitChef };
    // Your room is on the floor plan, its tile is the way in. The foot's only news is a free room to fill.
    if (v.room) return s.freeRooms.length && !s.demo && !s.tutorial ? { kind: "invite" } : { kind: "none" };
    // Their last lease here has ended: they're still on the bill and in the chat for now.
    if (v.leavingUntil) return { kind: "say", text: houseWords.foot.leaving(dayName(v.leavingUntil)) };
    return { kind: "say", text: explain.house };
  }
  if (v.application) return { kind: "thread", id: v.application };
  if (canKnock(s)) return s.freeRooms.length === 1 ? { kind: "knock", room: s.freeRooms[0] } : { kind: "pick" };
  if (s.demo && s.freeRooms.length > 0) return { kind: "say", text: houseWords.foot.example };
  if (v.guest === "accepted") return { kind: "none" };
  if (v.guest === "open") return { kind: "say", text: houseWords.foot.chatAsked };
  if (v.guest === "declined" || s.tutorial) return { kind: "say", text: houseWords.foot.full };
  return { kind: "askChat" };
}

// ---- A room's page, and a person on the housemates' list: what you can do about them ----

// One key on a room's page: manage it (yours), chat, knock, see the knock you have, or
// take the free room in a house you already live in.
export type RoomKey =
  | { kind: "manage" }
  | { kind: "login" }
  // A direct message: to a flatmate, or a chat request to someone whose house you don't live in.
  | { kind: "chat"; login: string }
  // The same key, when you're logged out: it takes you to log in.
  | { kind: "chatLogin" }
  | { kind: "knock"; room: string }
  | { kind: "pick" }
  | { kind: "thread"; id: string }
  | { kind: "take"; room: string };

const isExample = (person: Pick<Person, "github">, roomDemo: boolean, s: Situation) => s.demo || roomDemo || person.github === false;

/** The Chat key on someone in this house, the same rule as on a street card (chat/chat.ts). Only you have none. */
export function chatKey(person: Pick<Person, "login">, s: Situation): RoomKey | null {
  const action = messageAction({ isMe: s.viewer?.login === person.login }, s.viewer);
  if (action?.kind === "open") return { kind: "chat", login: person.login };
  return action?.kind === "login" ? { kind: "chatLogin" } : null;
}

/** What a room's page offers: the main key, and a second one when there's more to do. Chat comes first on anyone else. */
export function roomKeys(room: Pick<Room, "name" | "occupant" | "demo">, s: Situation): { main: RoomKey | null; second: RoomKey | null } {
  const v = s.viewer;
  const one = (main: RoomKey | null) => ({ main, second: null });
  const canLogIn = !s.demo && !s.tutorial && s.freeRooms.length > 0;
  if (!room.occupant) {
    if (!v) return one(canLogIn ? { kind: "login" } : null);
    // You live here already: no vote needed, it's another room for you.
    if (v.member) return one(!s.demo && !s.tutorial && !room.demo ? { kind: "take", room: room.name } : null);
    if (v.application) return one({ kind: "thread", id: v.application });
    return one(canKnock(s) ? { kind: "knock", room: room.name } : null);
  }
  const chat = chatKey(room.occupant, s);
  if (!v) return one(chat);
  if (room.occupant.login === v.login) return one({ kind: "manage" });
  if (v.member) return one(chat);
  if (v.application) return { main: chat, second: { kind: "thread", id: v.application } };
  if (canKnock(s)) return { main: chat, second: s.freeRooms.length === 1 ? { kind: "knock", room: s.freeRooms[0] } : { kind: "pick" } };
  return one(chat);
}

/** A room's project address, when something runs there. A seeded example room shows as lived in, but nothing does. */
export function liveAddress(room: Pick<Room, "status" | "url" | "demo">): string | null {
  return !room.demo && room.status === "live" ? room.url : null;
}

export interface PersonActions {
  // Their GitHub profile, only for someone with a real GitHub account: a made-up person's login may well be a
  // stranger's handle on GitHub, so it's never linked.
  github: string | null;
  // A made-up person, seeded so the city isn't empty: said in words on their page.
  example: boolean;
  // In the workshop, a newcomer has no real house yet: someone who lives in one can invite them to it (the API picks
  // its first free room, and says so if there's none). Then "Invited", until they answer.
  invite: { kind: "invite"; houseId: string; houseName: string } | { kind: "invited" } | null;
}

export function personActions(
  person: Person,
  roomDemo: boolean,
  s: Situation,
  // `home`: your own real house (the workshop isn't one), if you have one; `invited`: you've invited them already.
  opts: { home?: { id: string; name: string } | null; invited?: boolean },
): PersonActions {
  const example = isExample(person, roomDemo, s);
  const github = person.github === true && !example ? `https://github.com/${encodeURIComponent(person.login)}` : null;
  if (s.tutorial && s.viewer && s.viewer.login !== person.login && !example && opts.home) {
    return { github, example, invite: opts.invited ? { kind: "invited" } : { kind: "invite", houseId: opts.home.id, houseName: opts.home.name } };
  }
  return { github, example, invite: null };
}

/** The rooms a viewer rents in this house: someone may have several. */
export function myRooms(v: Pick<Viewer, "room" | "rooms"> | null | undefined): string[] {
  return v?.rooms ?? (v?.room ? [v.room] : []);
}

// How many squares the floor plan shows before folding the rest behind a "+N" square, so the panel fits without
// scrolling (Jib, 10 10).
export const ROWS_SHOWN = 8;

// How the floor plan shares its space, on a grid of 12 columns: lived-in rooms hold what people are making, while a
// free room only has to say it's free. So with two or more squares that are free (or the "+N" square), the lived-in
// rooms take the height and the free ones wait in a low row under them. Null: every square gets the same size.
export interface PlanGrid {
  livedRows: number;
  openRows: number;
  livedSpan: (index: number) => number;
  openSpan: number;
}

export function planGrid(lived: number, open: number): PlanGrid | null {
  if (lived < 1 || open < 2) return null;
  return {
    livedRows: Math.ceil(lived / 2),
    openRows: Math.ceil(open / 4),
    // Two side by side, and the last one alone takes the whole row.
    livedSpan: (index) => (lived % 2 && index === lived - 1 ? 12 : 6),
    openSpan: 12 / Math.min(open, 4),
  };
}

/**
 * The rooms the list shows while it's folded, in the house's order: your own rooms first in priority, then the free
 * ones (what a visitor came for), then the rest, up to `max` rows. When only one would be left over, it shows too:
 * a "+1" row takes the same space as the room itself. `hidden` is how many wait behind the "+N" row.
 */
export function foldedRooms<R extends Pick<Room, "name" | "occupant">>(rooms: R[], mine: readonly string[], max = ROWS_SHOWN): { shown: R[]; hidden: number } {
  if (rooms.length <= max + 1) return { shown: rooms, hidden: 0 };
  const rank = (r: R) => (mine.includes(r.name) ? 0 : !r.occupant ? 1 : 2);
  const keep = new Set([...rooms].sort((a, b) => rank(a) - rank(b)).slice(0, Math.max(0, max)));
  return { shown: rooms.filter((r) => keep.has(r)), hidden: rooms.length - keep.size };
}
