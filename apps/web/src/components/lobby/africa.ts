// Africa, for the travel menu's map ("Where to?"): a hand-simplified outline of the coast, a dot for each city at
// its real place, and each city's time zone so the menu can say what time it is there. The outline was written by
// hand from about seventy approximate coastline points (longitude, latitude), going round clockwise from Tangier;
// nothing was downloaded. It's drawn with the plainest projection there is (equirectangular): x follows the
// longitude and y the latitude, in straight lines, ten map units per degree.

/** A point on Earth: [longitude, latitude], in degrees (east and north are positive). */
export type LonLat = [number, number];

// The mainland, clockwise from Tangier: the Mediterranean, the Red Sea, the Horn, the east coast, the Cape, the
// west coast, the Gulf of Guinea, the bulge of West Africa, and back up the Atlantic to Morocco.
export const MAINLAND: LonLat[] = [
  [-5.8, 35.8], [-1.9, 35.1], [3.0, 36.8], [9.8, 37.3], [11.0, 37.0], [10.8, 34.7], [10.1, 33.9], [13.2, 32.9],
  [15.2, 32.4], [18.5, 30.3], [20.1, 32.1], [24.0, 32.1], [29.9, 31.2], [32.3, 31.3], [32.5, 29.9], [33.8, 27.2],
  [35.6, 23.1], [37.2, 19.6], [39.5, 15.6], [42.7, 13.0], [43.1, 11.6], [45.0, 10.4], [51.3, 11.8], [51.3, 10.4],
  [49.8, 8.0], [48.5, 5.3], [45.3, 2.0], [42.5, -0.4], [40.9, -2.3], [39.7, -4.0], [39.3, -6.8], [39.7, -10.0],
  [40.5, -10.7], [40.5, -13.0], [40.7, -14.5], [36.9, -17.9], [34.8, -19.8], [35.4, -23.9], [32.6, -25.9],
  [31.0, -29.9], [27.9, -33.0], [25.6, -34.0], [20.0, -34.8], [18.4, -34.2], [17.9, -33.0], [16.5, -28.6],
  [15.2, -26.6], [14.5, -22.9], [12.0, -18.5], [12.2, -15.2], [13.4, -12.6], [13.2, -8.8], [12.3, -6.0],
  [11.9, -4.8], [8.7, -0.6], [9.4, 0.4], [9.7, 4.0], [8.3, 4.5], [6.0, 4.3], [3.4, 6.4], [1.2, 6.1], [-0.2, 5.6],
  [-2.1, 4.7], [-4.0, 5.3], [-7.7, 4.4], [-10.8, 6.3], [-13.2, 8.5], [-13.7, 9.5], [-15.6, 11.9], [-17.5, 14.7],
  [-16.5, 16.0], [-16.0, 18.1], [-17.05, 20.8], [-15.9, 23.7], [-14.5, 26.1], [-12.9, 27.9], [-9.6, 30.4],
  [-9.8, 31.5], [-7.6, 33.6], [-6.8, 34.0],
];

// Madagascar, clockwise from its northern tip.
export const MADAGASCAR: LonLat[] = [
  [49.3, -12.0], [50.5, -15.5], [49.8, -17.0], [48.0, -22.0], [47.1, -24.9], [45.2, -25.5], [43.7, -23.5],
  [43.3, -21.5], [44.4, -19.5], [44.0, -17.0], [46.3, -15.8], [48.0, -13.5],
];

// The cities the platform has houses in: where they are, and their time zone (IANA names, as Intl wants them).
export const CITY_SPOTS: Record<string, { at: LonLat; tz: string }> = {
  Dakar: { at: [-17.45, 14.69], tz: "Africa/Dakar" },
  Marrakech: { at: [-7.99, 31.63], tz: "Africa/Casablanca" },
  Tunis: { at: [10.18, 36.81], tz: "Africa/Tunis" },
  Abidjan: { at: [-4.01, 5.35], tz: "Africa/Abidjan" },
  Lomé: { at: [1.22, 6.13], tz: "Africa/Lome" },
  Cotonou: { at: [2.42, 6.37], tz: "Africa/Porto-Novo" },
  Douala: { at: [9.7, 4.05], tz: "Africa/Douala" },
  Kigali: { at: [30.06, -1.95], tz: "Africa/Kigali" },
};

// The map's edges, in degrees, and its scale: map units per degree.
const EDGE = { west: -19, north: 38.5, east: 53, south: -36 };
const UNIT = 10;

/** The map's size in its own units, for an SVG viewBox. */
export const MAP_SIZE = { w: (EDGE.east - EDGE.west) * UNIT, h: (EDGE.north - EDGE.south) * UNIT };

/** Where a point on Earth lands on the map: x grows eastwards, y southwards. */
export function project([lon, lat]: LonLat): { x: number; y: number } {
  return { x: (lon - EDGE.west) * UNIT, y: (EDGE.north - lat) * UNIT };
}

/** An outline as an SVG path: a straight line between each point, closed at the end. */
export function outlinePath(points: LonLat[]): string {
  return (
    points
      .map((p, i) => {
        const { x, y } = project(p);
        return `${i ? "L" : "M"}${x.toFixed(0)} ${y.toFixed(0)}`;
      })
      .join("") + "Z"
  );
}

/** The time in a city right now, as people there read a clock ("14:05"), or "" for a city we don't place. */
export function localTime(city: string, now: Date): string {
  const spot = CITY_SPOTS[city];
  if (!spot) return "";
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: spot.tz }).format(now);
}
