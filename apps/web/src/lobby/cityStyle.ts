// How each city looks and sounds: its colours, what its streets are made of, which street furniture it has, what
// stands around (water tanks, pirogues, a baobab…), its time zone and its greeting. Pure data, no three.js: the
// lobby reads it to tint the models, pick the ground textures and scatter the props, and Vue may read the greeting
// and the time zone. The start points come from the review's table (docs/archive/review-2026-10-10.md, section 3). Greetings
// must be checked with someone who speaks the language.

// The ground a city walks on. The road stays asphalt everywhere; this is the sidewalks, the verges and the market.
//   asphalt-sand: cement sidewalks, sand verges (Dakar).
//   laterite:     red earth sidewalks and verges (Lomé, Cotonou).
//   terracotta:   terracotta tiles, a zellige market, ochre dust (Marrakech).
//   stone:        pale stone flags (Tunis, Kigali's clean paving).
export type Ground = "asphalt-sand" | "laterite" | "terracotta" | "stone";

// The procedural props a city scatters (see props.ts). All of them are drawn in code: nothing is downloaded.
export type Prop =
  | "water-tanks" // black polytanks on flat roofs
  | "rebar" // rods sticking out of an unfinished upper floor
  | "pirogues" // painted fishing boats rocking on a strip of water (coastal cities)
  | "baobab" // one big baobab near the market
  | "palms" // coconut or date palms along the streets
  | "wax-parasols"; // the market's parasols in wax-print cloth

export interface CityStyle {
  city: string;
  // Colours as CSS hex strings. walls/roofs/trim recolour the models; ground and sidewalk tint the canvas grounds;
  // sky tints the daylight (see daylight.ts).
  palette: { walls: string; roofs: string; trim: string; ground: string; sidewalk: string; sky: string };
  ground: Ground;
  // Whether the lawns and the park stay green (humid cities), or turn to sand or earth.
  grassy: boolean;
  zebra: boolean;
  trafficLights: boolean;
  props: Prop[];
  coast: boolean;
  // Green hills all round the town and a terraced ground edge rising towards them (hills.ts): Kigali, the city of a
  // thousand hills. Left out: none.
  hills?: boolean;
  // The IANA time zone, for the light (R29), and where the sun is, for sunrise and sunset.
  tz: string;
  lat: number;
  lon: number;
  // The greeting in its own language, with the name of that language and what it means, in English and in French.
  greeting: { text: string; language: string; meaning: string; fr: { language: string; meaning: string } };
  // Mobile money (or what people pay with), as plain names: never logos.
  operators: string[];
}

// A city we have no style for yet: the neutral look the lobby had before, so nothing breaks.
const DEFAULT: Omit<CityStyle, "city"> = {
  palette: { walls: "#e9d6bd", roofs: "#c4683f", trim: "#3e7cb1", ground: "#7aa063", sidewalk: "#c9c2b5", sky: "#9d8fc6" },
  ground: "stone",
  grassy: true,
  zebra: true,
  trafficLights: true,
  props: [],
  coast: false,
  tz: "Africa/Dakar",
  lat: 14.7,
  lon: -17.4,
  greeting: { text: "Hello", language: "English", meaning: "Hello", fr: { language: "anglais", meaning: "Bonjour" } },
  operators: [],
};

const STYLES: Record<string, Omit<CityStyle, "city">> = {
  dakar: {
    // Ochre walls, sand, shutter blue, car-rapide yellow trim.
    palette: { walls: "#d9a55b", roofs: "#c9b9a0", trim: "#3e7cb1", ground: "#e8d3a9", sidewalk: "#cfc6b4", sky: "#f2c230" },
    ground: "asphalt-sand",
    grassy: false,
    zebra: false,
    trafficLights: true,
    props: ["water-tanks", "rebar", "pirogues", "baobab", "wax-parasols"],
    coast: true,
    tz: "Africa/Dakar",
    lat: 14.7,
    lon: -17.45,
    greeting: { text: "Nanga def ?", language: "Wolof", meaning: "How are you?", fr: { language: "wolof", meaning: "Comment ça va ?" } },
    operators: ["Wave", "Orange Money", "Free Money"],
  },
  lomé: {
    // Laterite, palm green, faded pastel shopfronts, tôle roofs.
    palette: { walls: "#e3c9a8", roofs: "#9aa3a8", trim: "#3c8d2f", ground: "#b5552b", sidewalk: "#a95a36", sky: "#f0a35e" },
    ground: "laterite",
    grassy: false,
    zebra: false,
    trafficLights: false,
    props: ["palms", "pirogues", "wax-parasols", "water-tanks"],
    coast: true,
    tz: "Africa/Lome",
    lat: 6.13,
    lon: 1.22,
    greeting: { text: "Woezɔ", language: "Ewe", meaning: "Welcome", fr: { language: "éwé", meaning: "Bienvenue" } },
    operators: ["T-Money", "Flooz"],
  },
  cotonou: {
    palette: { walls: "#e6cfa0", roofs: "#a3a9ad", trim: "#f4c20d", ground: "#a9472a", sidewalk: "#9e4a2c", sky: "#f2b15a" },
    ground: "laterite",
    grassy: false,
    zebra: false,
    trafficLights: false,
    props: ["palms", "pirogues", "wax-parasols", "rebar"],
    coast: true,
    tz: "Africa/Lagos",
    lat: 6.37,
    lon: 2.42,
    greeting: { text: "A fɔ́n ganjí à ?", language: "Fon", meaning: "Did you wake up well?", fr: { language: "fon", meaning: "Bien réveillé ?" } },
    operators: ["MTN MoMo", "Moov Money"],
  },
  abidjan: {
    // Lagoon teal, taxi orange, glass towers.
    palette: { walls: "#e8d8c0", roofs: "#b55d3a", trim: "#f28c28", ground: "#b5603a", sidewalk: "#c4bdb0", sky: "#7fb3d5" },
    ground: "asphalt-sand",
    grassy: true,
    zebra: true,
    trafficLights: true,
    props: ["pirogues", "water-tanks", "palms", "wax-parasols"],
    coast: true,
    tz: "Africa/Abidjan",
    lat: 5.35,
    lon: -4.0,
    greeting: { text: "Akwaba", language: "Baoulé", meaning: "Welcome", fr: { language: "baoulé", meaning: "Bienvenue" } },
    operators: ["Orange Money", "MTN MoMo", "Moov Money", "Wave"],
  },
  douala: {
    // Ochre façades, humid green, taxi yellow.
    palette: { walls: "#c98b3a", roofs: "#8c4a2f", trim: "#f5c518", ground: "#2f6b3a", sidewalk: "#a8a196", sky: "#8fa89a" },
    ground: "asphalt-sand",
    grassy: true,
    zebra: false,
    trafficLights: true,
    props: ["pirogues", "water-tanks", "palms", "wax-parasols"],
    coast: true,
    tz: "Africa/Douala",
    lat: 4.05,
    lon: 9.7,
    greeting: { text: "On dit quoi ?", language: "Camfranglais", meaning: "What's up?", fr: { language: "camfranglais", meaning: "Quoi de neuf ?" } },
    operators: ["MTN MoMo", "Orange Money"],
  },
  kigali: {
    // Red brick on green hills, very clean streets.
    palette: { walls: "#9c3d2c", roofs: "#5a4a42", trim: "#e9e2d0", ground: "#4f8a3b", sidewalk: "#c8c3b8", sky: "#a8c4d8" },
    ground: "stone",
    grassy: true,
    zebra: true,
    trafficLights: true,
    props: ["water-tanks"],
    coast: false,
    hills: true,
    tz: "Africa/Kigali",
    lat: -1.95,
    lon: 30.06,
    greeting: { text: "Muraho", language: "Kinyarwanda", meaning: "Hello", fr: { language: "kinyarwanda", meaning: "Bonjour" } },
    operators: ["MTN MoMo", "Airtel Money"],
  },
  tunis: {
    // Whitewash and door blue.
    palette: { walls: "#f4f4f0", roofs: "#e8e4da", trim: "#1f5fa8", ground: "#d9cdb4", sidewalk: "#e3dccd", sky: "#9cc3e6" },
    ground: "stone",
    grassy: false,
    zebra: true,
    trafficLights: true,
    props: ["palms"],
    coast: true,
    tz: "Africa/Tunis",
    lat: 36.8,
    lon: 10.18,
    greeting: { text: "Aslema", language: "Tunisian Arabic", meaning: "Hello", fr: { language: "arabe tunisien", meaning: "Bonjour" } },
    operators: ["D17", "Flouci"],
  },
  marrakech: {
    // The red city: terracotta pink, zellige green and blue.
    palette: { walls: "#c66b4e", roofs: "#b85a3e", trim: "#1e7b6a", ground: "#d8a47a", sidewalk: "#b8664a", sky: "#e9a66b" },
    ground: "terracotta",
    grassy: false,
    zebra: false,
    trafficLights: true,
    props: ["palms"],
    coast: false,
    tz: "Africa/Casablanca",
    lat: 31.63,
    lon: -8.0,
    greeting: { text: "Marhba bik", language: "Darija", meaning: "Welcome", fr: { language: "darija", meaning: "Bienvenue" } },
    operators: ["Card", "Bank transfer"],
  },
};

// The quest's street (tutorialMap.ts, the city "Atelier") is dressed as Dakar: its ochre walls, sand, sky, the
// baobab in the park and the wax-print parasols on the square. Not its sea: the workshop's street is inland, and the
// lesson keeps the eye on the street. Its greeting stays the plain one, so arriving there says nothing extra.
STYLES.atelier = {
  ...STYLES.dakar,
  props: STYLES.dakar.props.filter((p) => p !== "pirogues"),
  coast: false,
  greeting: DEFAULT.greeting,
};

/** The style of a city, by name (any case, accents as written: "Lomé"). An unknown city gets a neutral look. */
export function styleFor(city: string): CityStyle {
  const key = city.trim().toLowerCase();
  // "Lome" without its accent is still Lomé.
  const found = STYLES[key] ?? STYLES[key.normalize("NFD").replace(/[̀-ͯ]/g, "") === "lome" ? "lomé" : ""];
  return { city, ...(found ?? DEFAULT) };
}
