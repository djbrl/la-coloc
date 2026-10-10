// The list view's city page, worked out from the city's houses alone: which houses a filter and a search keep,
// what each row says, and the few faces it shows. No DOM here, so the rows read the same way in tests.
import type { CityHouse, Person } from "../../types";

export type Show = "all" | "free" | "making";
type House = Pick<CityHouse, "id" | "name" | "city" | "tagline" | "status" | "rooms">;

export const freeRooms = (h: Pick<CityHouse, "rooms">) => h.rooms.filter((r) => !r.occupant);
export const livedIn = (h: Pick<CityHouse, "rooms">) => h.rooms.filter((r) => r.occupant);

/** The numbers under the page's name: houses, free rooms, and houses still being set up. */
export function cityTotals(houses: House[]): { houses: number; free: number; making: number } {
  return {
    houses: houses.length,
    free: houses.reduce((n, h) => n + freeRooms(h).length, 0),
    making: houses.filter((h) => h.status === "making").length,
  };
}

/** Whether a house stays in the list: the filter first, then the search, which looks at what the house is about,
 *  what its rooms build, what they're looking for, and who lives there. */
export function keeps(h: House, show: Show, search: string): boolean {
  if (show === "free" && !freeRooms(h).length) return false;
  if (show === "making" && h.status !== "making") return false;
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return [h.name, h.city, h.tagline, ...h.rooms.flatMap((r) => [r.project, r.projectDescription, r.ad, r.occupant?.login, r.occupant?.name])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(q);
}

/** Your own houses first, then the city's order. The sort is stable, so everything else keeps its place. */
export function yoursFirst<T extends Pick<CityHouse, "id">>(houses: T[], mine: string[]): T[] {
  return [...houses].sort((a, b) => Number(mine.includes(b.id)) - Number(mine.includes(a.id)));
}

/** "4 rooms, 1 free"; in a house being set up nobody lives anywhere yet, so it counts who signed up instead. */
export function roomsLine(h: Pick<CityHouse, "rooms" | "status">): string {
  const n = h.rooms.length;
  const rooms = `${n} ${n === 1 ? "room" : "rooms"}`;
  if (h.status === "making") return `${rooms}, ${livedIn(h).length} signed up`;
  const free = freeRooms(h).length;
  return free ? `${rooms}, ${free} free` : `${rooms}, all taken`;
}

/** The row's line under the name: the tagline, else what a free room is looking for, else what the house is. */
export function rowLine(h: Pick<CityHouse, "tagline" | "rooms" | "demo">): string {
  if (h.tagline) return h.tagline;
  const ad = freeRooms(h).find((r) => r.ad)?.ad;
  if (ad) return ad;
  return h.demo ? "An example house." : "A server a few devs rent together.";
}

/** Up to `max` faces of the people who live there, and how many more there are. */
export function faces(h: Pick<CityHouse, "rooms">, max = 3): { people: Person[]; more: number } {
  const people = livedIn(h).map((r) => r.occupant!);
  return { people: people.slice(0, max), more: Math.max(0, people.length - max) };
}

/** A country's flag from its two-letter code ("SN" → 🇸🇳), or nothing when the code isn't two letters. */
export function flag(country: string | null | undefined): string {
  const code = (country ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** "3 houses", "1 free room": a count and its noun, singular when it's one. */
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
