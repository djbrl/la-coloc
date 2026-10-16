// A house in a list, at a glance, whatever language its name is in: how many people live there, how many rooms it
// has and how many are free. Shown as icon chips (HouseStats.vue) on the big map's list, the find sheet, the list
// view's rows and the street card, each chip with its sentence as a hidden name. No DOM here, so it's tested.
import { defineWords, plural, pluriel } from "../../i18n";
import type { CityHouse } from "../../types";

export interface HouseCounts {
  people: number;
  rooms: number;
  free: number;
}

/** Who lives there, how many rooms, how many free. In a house still being set up, a free room is a seat to fill. */
export function houseCounts(h: Pick<CityHouse, "rooms">): HouseCounts {
  const people = h.rooms.filter((r) => r.occupant).length;
  return { people, rooms: h.rooms.length, free: h.rooms.length - people };
}

// The chips' hidden names, and the sample marker's.
export const houseStatsWords = defineWords(
  "houseStats",
  {
    people: (n: number) => (n ? `${plural(n, "person lives", "people live")} here` : "Nobody lives here yet"),
    rooms: (n: number) => plural(n, "room", "rooms"),
    free: (n: number) => (n ? `${plural(n, "room", "rooms")} free` : "No room free"),
    sample: "An example house",
    sampleTag: "example",
  },
  {
    people: (n) => (n ? `${pluriel(n, "personne habite", "personnes habitent")} ici` : "Personne n'habite ici pour l'instant"),
    rooms: (n) => pluriel(n, "chambre", "chambres"),
    free: (n) => (n ? pluriel(n, "chambre libre", "chambres libres") : "Aucune chambre libre"),
    sample: "Une maison d'exemple",
    sampleTag: "exemple",
  },
);
