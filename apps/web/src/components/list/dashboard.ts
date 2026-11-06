// The city's Dashboard (Settings, "Show the city as"): the lobby's no-3D twin. What it shows is worked out here from
// what the page already has (the city's houses, who you are), with no DOM, so it reads the same way in tests: the city
// it opens on, the cities beside it, your own rooms, the free rooms to rent and the houses with space, each with its
// one main action.
import type { CityHouse, Me, RoomStatus } from "../../types";
import { type CityRoom, knockOn } from "../lobby/cards";
import { evenSplit } from "../lobby/house/server";
import { freeRooms } from "./city";

type Viewer = Pick<Me, "login" | "houses" | "knocks" | "homeCity"> | null;

/** "Awa" from "Awa Diop", else the login. */
export const firstName = (p: { name: string | null; login: string }) => p.name?.trim().split(/\s+/)[0] || p.login;

/** Every city with houses, the busiest first (then by name): its houses and its free rooms. */
export function citiesOf(houses: CityHouse[]): { name: string; houses: number; free: number }[] {
  const by = new Map<string, { name: string; houses: number; free: number }>();
  for (const h of houses) {
    const c = by.get(h.city) ?? { name: h.city, houses: 0, free: 0 };
    c.houses++;
    c.free += freeRooms(h).length;
    by.set(h.city, c);
  }
  return [...by.values()].sort((a, b) => b.houses - a.houses || a.name.localeCompare(b.name));
}

/**
 * The city the dashboard opens on, as the lobby picks it: the address bar's (`?city=`), else your house's city, else
 * the city you belong to, else the busiest one. An address naming a city with no houses still counts: it's a city.
 */
export function startCity(asked: string | null | undefined, houses: CityHouse[], me: Viewer): string {
  if (asked) return asked;
  const mine = me?.houses[0]?.id;
  return houses.find((h) => h.id === mine)?.city ?? me?.homeCity ?? citiesOf(houses)[0]?.name ?? "Dakar";
}

const isMine = (h: Pick<CityHouse, "id">, me: Viewer) => !!me?.houses.some((x) => x.id === h.id);
// Real houses before example ones; the city's order otherwise (the sort is stable).
const realFirst = <T extends { house: Pick<CityHouse, "demo"> }>(rows: T[]) => [...rows].sort((a, b) => Number(a.house.demo) - Number(b.house.demo));

// A free room's one action: knock (a real house, you logged in, not living there, no knock there yet), your knock
// (you knocked on this house already), log in (a visitor at a real house), or see the house (an example house).
export type FreeAction = { kind: "knock" } | { kind: "knocked"; id: string } | { kind: "login" } | { kind: "see" };

export interface FreeRoom {
  house: CityHouse;
  room: CityRoom;
  // The house's monthly cost shared evenly between its rooms, in FCFA; null when the house hasn't said.
  rent: number | null;
  action: FreeAction;
}

/** The free rooms of a city, one row each, real houses first. Your own houses' free rooms aren't for you to rent. */
export function freeRoomsIn(houses: CityHouse[], city: string, me: Viewer): FreeRoom[] {
  const rows: FreeRoom[] = [];
  for (const house of houses) {
    if (house.city !== city || isMine(house, me)) continue;
    const rent = house.monthlyCostFcfa ? evenSplit(house.monthlyCostFcfa, house.rooms.length) : null;
    const knock = knockOn(me?.knocks, house.id);
    const action: FreeAction = house.demo ? { kind: "see" } : !me ? { kind: "login" } : knock ? { kind: "knocked", id: knock.id } : { kind: "knock" };
    for (const room of freeRooms(house)) rows.push({ house, room, rent, action });
  }
  return realFirst(rows);
}

/** The houses of a city with at least one free room, real ones first; yours aren't listed (you're already in). */
export function housesWithSpace(houses: CityHouse[], city: string, me: Viewer): CityHouse[] {
  return houses.filter((h) => h.city === city && !isMine(h, me) && freeRooms(h).length).sort((a, b) => Number(a.demo) - Number(b.demo));
}

export interface MyRoom {
  houseId: string;
  houseName: string;
  // Null for a house the city doesn't list (the tutorial's workshop).
  city: string | null;
  room: string;
  project: string | null;
  status: RoomStatus;
  demo: boolean;
}

/** Your rooms, in every city, one row each: what's in them and how it's doing, as the city lists them. */
export function myRooms(houses: CityHouse[], me: Viewer): MyRoom[] {
  if (!me) return [];
  return me.houses.flatMap((h) => {
    const house = houses.find((x) => x.id === h.id);
    const names = h.rooms?.length ? h.rooms : h.room ? [h.room] : [];
    return names.map((name) => {
      const room = house?.rooms.find((r) => r.name === name);
      return {
        houseId: h.id,
        houseName: house?.name ?? h.name,
        city: house?.city ?? null,
        room: name,
        project: room?.project ?? null,
        status: room?.status ?? "empty",
        demo: !!house?.demo,
      };
    });
  });
}

/** A free room's search: the house's name, the room's, and what the room is looking for. */
export function roomMatches(row: Pick<FreeRoom, "house" | "room">, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return [row.house.name, row.house.tagline, row.room.name, row.room.ad].filter(Boolean).join(" ").toLowerCase().includes(q);
}
