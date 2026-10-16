// Small helpers the lobby's cards share: what a house says about itself, and who lives where.
import type { Resident } from "../../lobby/Lobby";
import type { CityHouse, Me } from "../../types";
import type { Place } from "./place";
import { cardWords as w } from "./words";

// A room as the city lists it (fewer fields than the house page's Room).
export type CityRoom = CityHouse["rooms"][number];

// Where someone lives, plus the city, for the person card's "Lives in … , Dakar." line.
export type Home = Resident & { city: string };

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const nameOf = (p: { name: string | null; login: string }) => p.name ?? p.login;

export const freeRooms = (h: CityHouse): CityRoom[] => h.rooms.filter((r) => !r.occupant);

/** Ends a phrase with a full stop, unless it already has one. */
export const sentence = (s: string) => (/[.!?…]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

/** "Fatou", "Fatou and Moussa", "Fatou, Moussa and Awa". */
export function listNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} ${w.and} ${names[names.length - 1]}`;
}

/** "4 rooms, 1 free" / "4 rooms, full" / "1 room, free": how big a house is, and whether there's space. */
export function roomsLine(h: Pick<CityHouse, "rooms">): string {
  const total = h.rooms.length;
  const free = h.rooms.filter((r) => !r.occupant).length;
  if (total === 1) return w.oneRoom(free > 0);
  return w.rooms(total, free);
}

/** "@moussa · lives in Sacré-Cœur, Dakar", or null for someone just visiting (the card says so in words). */
export function homeLine(login: string, home: Pick<Home, "houseName" | "city"> | null): string | null {
  return home ? w.livesIn(login, home.houseName, home.city) : null;
}

/** Someone's room in their house, as the city lists it: where their project's name, words and state live. */
export function roomOf(house: Pick<CityHouse, "rooms"> | null, room: string | null | undefined): CityRoom | null {
  if (!house || !room) return null;
  return house.rooms.find((r) => r.name === room) ?? null;
}

/** The empty plot nearest to (x, z), for "Find a plot" when two people will rent together: its key, or null. */
export function nearestEmptyPlot(plots: { key: string; x: number; z: number; lot: { kind: string } }[], at: { x: number; z: number }): string | null {
  let best: { key: string; d: number } | null = null;
  for (const p of plots) {
    if (p.lot.kind === "house") continue;
    const d = (p.x - at.x) ** 2 + (p.z - at.z) ** 2;
    if (!best || d < best.d) best = { key: p.key, d };
  }
  return best?.key ?? null;
}

// ---- Your knocks ----

/** Your open knock on a house, if you have one. `me.knocks` is missing on an API that doesn't send it yet: no
 *  knock known then, and the knock dialog finds out from the API's answer instead. */
export function knockOn(knocks: Me["knocks"] | null | undefined, houseId: string | null | undefined): { id: string; houseId: string; room: string } | null {
  if (!houseId || !Array.isArray(knocks)) return null;
  return knocks.find((k) => k.houseId === houseId) ?? null;
}

/** A repo link as people read it: "djbrl/app" for GitHub, "gitlab.com/djbrl/app" for anywhere else. */
export function shortRepo(url: string): string {
  const bare = url.replace(/^https?:\/\//, "").replace(/\/+$/, "").replace(/\.git$/, "");
  return bare.replace(/^(www\.)?github\.com\//, "");
}

// ---- Where you are "inside": the house, application or room open over the city ----

// The Inside sheet shows a place (see place.ts) without leaving the lobby. The URL keeps it as
// `?in=house:sacre-coeur`, `in=application:<id>` or `in=room:<houseId>:<room>`, so a link can open the city
// straight onto it.

/** The `in` query parameter for a place: "house:sacre-coeur", "room:sacre-coeur:room-4". */
export function placeParam(p: Place): string {
  return p.kind === "room" ? `room:${p.houseId}:${p.room}` : `${p.kind}:${p.id}`;
}

/** The place an `in` parameter names, or null when it's missing or malformed. */
export function parsePlace(param: unknown): Place | null {
  if (typeof param !== "string") return null;
  const [kind, ...rest] = param.split(":");
  if (kind === "house" && rest.length === 1 && rest[0]) return { kind, id: rest[0] };
  if (kind === "application" && rest.length === 1 && rest[0]) return { kind, id: rest[0] };
  if (kind === "room" && rest.length === 2 && rest[0] && rest[1]) return { kind, houseId: rest[0], room: rest[1] };
  return null;
}

// What the engine tells the minimap, five times a second: where you stand and face, who else is around, and the
// camera's angle (radians, the engine's own).
export interface MapState {
  you: { x: number; z: number; ry: number };
  people: { login: string; x: number; z: number }[];
  angle: number;
}
