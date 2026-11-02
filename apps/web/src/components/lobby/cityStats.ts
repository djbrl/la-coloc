// What a city's houses add up to, from the city stream alone (no extra API call): the travel menu's small stats
// (houses, projects online) and the top chip's one alert. Pure, so the counting is tested without a browser.
//
// The top chip says nothing while all is well (Jib, 15 10): it speaks up only when a server you live on is down. A
// stranger's trouble is never on your screen, and a flatmate's failed build goes to the bell (Jib, 1 Nov). Example
// houses never count: nothing runs there, so nothing can break. The core being unreachable has its own banner
// (CoreStatus.vue).
import type { CityHouse } from "../../types";

// Only what the counting reads, so a test can describe a house in a line.
type Rooms = { rooms: Pick<CityHouse["rooms"][number], "status" | "occupant">[] };

export type CityAlert = { kind: "down"; houses: string[] };

/** The one thing worth saying about the houses you live in, or null when everything is fine. */
export function cityAlert(houses: Pick<CityHouse, "id" | "name" | "demo" | "status" | "agentOnline">[], mine: readonly string[]): CityAlert | null {
  const down = houses.filter((h) => mine.includes(h.id) && !h.demo && h.status === "live" && !h.agentOnline).map((h) => h.name);
  return down.length ? { kind: "down", houses: down } : null;
}

export interface CityStats {
  houses: number;
  // Projects running right now in real houses (an example project is never "online").
  online: number;
}

/** Each city's houses and projects online, by city name. */
export function cityStats(houses: (Pick<CityHouse, "city" | "demo"> & Rooms)[]): Map<string, CityStats> {
  const out = new Map<string, CityStats>();
  for (const h of houses) {
    const s = out.get(h.city) ?? { houses: 0, online: 0 };
    s.houses++;
    if (!h.demo) s.online += h.rooms.filter((r) => r.occupant && r.status === "live").length;
    out.set(h.city, s);
  }
  return out;
}
