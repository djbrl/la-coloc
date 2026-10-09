// Small helpers the lobby's cards share: what a house says about itself, and who lives where.
import type { Resident } from "../../lobby/Lobby";
import type { CityHouse } from "../../types";

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
