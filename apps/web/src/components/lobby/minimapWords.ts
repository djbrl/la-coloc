// The minimap's own words, in English and in French: the hidden names of the two small counts under the map (a
// house icon with how many people live here, a walker with how many are out walking), and the compass letter.
// The map's longer sentences (its screen-reader description, the big map's title and hint) stay in words.ts.
import { defineWords, plural, pluriel } from "../../i18n";

export const minimapWords = defineWords(
  "minimap",
  {
    liveHere: (n: number) => `${plural(n, "person lives", "people live")} here`,
    outWalking: (n: number) => `${plural(n, "person", "people")} out walking`,
    onlyYouOut: "Only you out walking",
    // The compass: the top of the map is north.
    north: "N",
    northName: "North is up",
  },
  {
    liveHere: (n) => `${pluriel(n, "personne habite", "personnes habitent")} ici`,
    outWalking: (n) => `${pluriel(n, "personne", "personnes")} en balade`,
    onlyYouOut: "Il n'y a que vous en balade",
    north: "N",
    northName: "Le nord est en haut",
  },
);
