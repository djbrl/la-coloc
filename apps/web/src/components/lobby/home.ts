// Your way home, and finding a house, for the lobby (LobbyView.vue). Pure, so the rules are tested.
//
// - Your room: the one in your house, else the one you took in the tutorial's workshop (L'Atelier). The HUD's home
//   button opens it (`?in=room:<house>:<room>`).
// - The workshop isn't on the city's list (the API keeps it off the map), so for someone who lives there it's
//   added to "Find a house", built from its house view.
// - Find matches a house by its name, city, tagline, its rooms' projects and ads, and the people living there, by
//   login or by name: what the city's list already says, no extra request.
import type { CityHouse, HouseView, Me } from "../../types";
import type { Place } from "./place";

/** Where the home button takes you: your room, in your house or else in the workshop; null when you have none. */
export function homePlace(me: Pick<Me, "houses"> | null, workshop: Pick<HouseView, "id" | "viewer"> | null): Extract<Place, { kind: "room" }> | null {
  const house = me?.houses.find((h) => h.room);
  if (house?.room) return { kind: "room", houseId: house.id, room: house.room };
  const room = workshop?.viewer?.room;
  return workshop && room ? { kind: "room", houseId: workshop.id, room } : null;
}

/** The workshop as a row of the city's list, for Find: only for someone who has a room in it. */
export function workshopRow(view: HouseView | null): CityHouse | null {
  if (!view?.viewer?.room) return null;
  return {
    id: view.id,
    name: view.name,
    city: view.city,
    country: view.country,
    tagline: view.tagline,
    status: view.status,
    demo: false,
    agentOnline: view.agentOnline,
    monthlyCostFcfa: view.monthlyCostFcfa,
    plot: null,
    rooms: view.rooms.map((r) => ({ name: r.name, status: r.status, url: r.url, project: r.project, projectDescription: r.projectDescription, ad: r.ad, occupant: r.occupant, building: false })),
    openChores: 0,
    lateChores: 0,
    knocking: 0,
    reviewsThisMonth: view.reviewsThisMonth ?? 0,
    tontine: null,
  };
}

/** The houses Find shows for what you typed: all of them for nothing, else those whose words contain it. */
export function findHouses<H extends Pick<CityHouse, "name" | "city" | "tagline" | "rooms">>(houses: H[], query: string): H[] {
  const q = query.trim().toLowerCase();
  if (!q) return houses;
  return houses.filter((h) =>
    [h.name, h.city, h.tagline, ...h.rooms.flatMap((r) => [r.project, r.ad, r.occupant?.login, r.occupant?.name])].join(" ").toLowerCase().includes(q),
  );
}
