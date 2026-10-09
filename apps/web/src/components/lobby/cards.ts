// Small helpers the lobby's cards share: what a house says about itself, and who lives where.
import type { Resident } from "../../lobby/Lobby";
import type { CityHouse } from "../../types";
import type { Place } from "./place";

// A room as the city lists it (fewer fields than the house page's Room).
export type CityRoom = CityHouse["rooms"][number];

// Where someone lives, plus the city, for the person card's "Lives in … , Dakar." line.
export type Home = Resident & { city: string };

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const nameOf = (p: { name: string | null; login: string }) => p.name ?? p.login;

export const freeRooms = (h: CityHouse): CityRoom[] => h.rooms.filter((r) => !r.occupant);

/** "Still finding its flatmates." / "2 rooms free." / "Full." */
export function statusLine(h: CityHouse): string {
  if (h.status === "making") return "Still finding its flatmates.";
  const n = freeRooms(h).length;
  return n ? `${plural(n, "room", "rooms")} free.` : "Full.";
}

/** Ends a phrase with a full stop, unless it already has one. */
export const sentence = (s: string) => (/[.!?…]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

/** "Fatou", "Fatou and Moussa", "Fatou, Moussa and Awa". */
export function listNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
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
