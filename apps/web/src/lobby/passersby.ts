// Passers-by: made-up people who walk the streets so a city doesn't feel empty with only a few flatmates by their
// doors. Each has a full name fitting the city and a GitHub-style handle on their name tag (lowercase letters, digits
// and single hyphens, as GitHub allows), invented here: no real person's handle on purpose. They have no house and no
// GitHub account, and their card says they're an example person. Nothing about them goes to the API.
// Pure: no three.js. The lobby (Lobby.ts) dresses them with the same avatars as everyone and walks them around the
// blocks on the sidewalks, crossing at the zebras (`sidewalks`, `walkAhead`), a little apart from each other (`keepApart`).
import { type Block, ROAD, seeded } from "./neighbourhood";

export interface Passerby {
  // A GitHub-style handle, shown on their name tag.
  login: string;
  // Their full name, shown on their card.
  name: string;
}

// [full name, handle], by city. Names from the city's own languages; none repeats a seeded flatmate's first name in
// the same city, so a passer-by is never mistaken for someone who lives there.
const PEOPLE: Record<string, [string, string][]> = {
  dakar: [
    ["Mamadou Diop", "mdiop221"],
    ["Fatou Sow", "fatou-sow-dev"],
    ["Ousmane Fall", "ousfall"],
    ["Mariama Sarr", "msarr-sn"],
    ["Pape Seck", "pape-seck-221"],
    ["Astou Faye", "astoufaye"],
    ["Ibrahima Gueye", "ibagueye"],
    ["Rokhaya Ndour", "rokhaya-nd"],
    ["Modou Thiam", "modou-thiam"],
    ["Seynabou Kane", "seynabou-k"],
    ["Abdou Ndao", "abdou-ndao-sn"],
    ["Khadija Cissé", "kcisse-dev"],
    ["Saliou Mbengue", "saliou-mb"],
    ["Bineta Diagne", "bineta221"],
    ["Alioune Wade", "alioune-wade-codes"],
    ["Ndeye Fatou Lo", "nflo-dev"],
  ],
  lomé: [
    ["Kossi Amegah", "kossi-amegah"],
    ["Afi Mensah", "afi-mensah"],
    ["Yawo Adjovi", "yawo228"],
    ["Akossiwa Lawson", "akossiwa-l"],
    ["Sena Dossou", "sena-dossou"],
    ["Komlan Ayivi", "komlan-dev"],
    ["Ama Tsogbe", "ama-tsogbe"],
    ["Elom Atsu", "elom-atsu"],
    ["Kodjo Agbeko", "kodjo-codes"],
    ["Abla Kpodar", "abla-kp"],
    ["Mawuli Gbedemah", "mawuli228"],
    ["Dzifa Amouzou", "dzifa-am"],
    ["Selom Klu", "selomklu"],
    ["Enyonam Afatsawo", "enyo-af"],
    ["Kafui Logo", "kafui-logo"],
    ["Yao Komla Tete", "ykt-dev"],
  ],
  cotonou: [
    ["Sèna Houngbo", "sena-houngbo"],
    ["Codjo Dossa", "codjo229"],
    ["Mahugnon Akpo", "mahu-akpo"],
    ["Gildas Zinsou", "gzinsou"],
    ["Ablawa Tossou", "ablawa-t"],
    ["Romaric Ahouandjinou", "romaric-a"],
    ["Bernice Kiki", "bernice-kiki"],
    ["Brice Gbaguidi", "bgbaguidi"],
    ["Dossi Agbodjan", "dossi-ag"],
    ["Hermione Sossou", "hsossou229"],
    ["Ulrich Adjaho", "ulrich-adj"],
    ["Carmelle Houessou", "carmelle-h"],
    ["Fiacre Hounsa", "fiacre-dev"],
    ["Prudence Ahyi", "prudence-ahyi"],
    ["Wilfried Tchibozo", "wtchibozo"],
    ["Yétondé Avocè", "yetonde-av"],
  ],
  abidjan: [
    ["Konan Kouassi", "konan-kouassi"],
    ["Aya Koné", "aya-kone-dev"],
    ["Adjoua Bamba", "adjoua225"],
    ["Kader Diabaté", "kader-db"],
    ["Amenan Yapi", "amenan-yapi"],
    ["Ibrahim Doumbia", "idoumbia225"],
    ["Affoué Kra", "affoue-kra"],
    ["Didier N'Guessan", "didier-ng"],
    ["Fanta Konaté", "fanta-konate"],
    ["Hervé Gnahoré", "herve-gn-dev"],
    ["Akissi Kouadio", "akissi-k"],
    ["Souleymane Traoré", "soul-traore"],
    ["Mireille Aka", "mireille-aka"],
    ["Jean-Marc Yao Kouamé", "jmkouame"],
    ["Bintou Sangaré", "bintou225"],
    ["Wilfried Assi", "wassi-codes"],
  ],
  douala: [
    ["Franck Nkotto", "franck-nk"],
    ["Larissa Fotso", "lfotso"],
    ["Hervé Tchoua", "hervetch"],
    ["Ange-Marie Ngono", "am-ngono"],
    ["Paul Ekwalla", "pekwalla237"],
    ["Sandrine Moukoko", "sandrine-mk"],
    ["Yannick Njoya", "ynjoya"],
    ["Prisca Ewane", "prisca-ewane"],
    ["Steve Essomba", "steve-essomba"],
    ["Brenda Ngassa", "brenda237"],
    ["Rodrigue Tagne", "rtagne-dev"],
    ["Mireille Ebode", "mireille-eb"],
    ["Cédric Kamga", "ckamga"],
    ["Linda Nkwenti", "linda-nk"],
    ["Arnaud Belinga", "arnaud-bel"],
    ["Vanessa Mbarga", "vmbarga237"],
  ],
  kigali: [
    ["Divine Ingabire", "divine-ing"],
    ["Jean Bosco Niyonzima", "jbniyo"],
    ["Patrick Mugisha", "pmugisha250"],
    ["Claudine Uwimana", "claudine-uw"],
    ["Olivier Nshuti", "onshuti"],
    ["Diane Umutoni", "diane-umutoni"],
    ["Kevin Manzi", "kmanzi-dev"],
    ["Ange Uwase", "ange-uwase"],
    ["Fabrice Habimana", "fhabimana"],
    ["Sandrine Mukamana", "sandrine-mkm"],
    ["Yves Ishimwe", "yves-ishimwe"],
    ["Nadine Iradukunda", "nadine-ira"],
    ["Christian Mugabo", "cmugabo250"],
    ["Joselyne Uwera", "jose-uwera"],
    ["Emmanuel Nkusi", "emma-nkusi"],
    ["Alice Mutesi", "alice-mutesi-dev"],
  ],
  tunis: [
    ["Amine Gharbi", "amine-gh"],
    ["Ines Jebali", "ines-jebali"],
    ["Mehdi Chaabane", "mehdi-ch"],
    ["Rania Hammami", "rhammami"],
    ["Karim Mejri", "karim216"],
    ["Nour Ben Ammar", "nour-ba"],
    ["Oussama Sassi", "osassi"],
    ["Yosra Khelifi", "yosra-kh"],
    ["Skander Ayari", "skander-ayari"],
    ["Mariem Dridi", "mariem-dridi"],
    ["Firas Bouzid", "firas216"],
    ["Emna Chaari", "emna-ch-dev"],
    ["Wassim Riahi", "wriahi"],
    ["Asma Ferchichi", "asma-fer"],
    ["Hamza Mzoughi", "hmzoughi"],
    ["Sarra Belhadj", "sarra-bh"],
  ],
  marrakech: [
    ["Youssef Amrani", "yamrani"],
    ["Hajar Ouazzani", "hajar-oz"],
    ["Anas Berrada", "anas-berrada"],
    ["Imane Tazi", "imane-tazi"],
    ["Hamza Alaoui", "hamza212"],
    ["Kenza Bennani", "kbennani-dev"],
    ["Ayoub Chraibi", "ayoub-chr"],
    ["Zineb Fassi", "zineb-fassi"],
    ["Soufiane Lahlou", "soufiane-l"],
    ["Meryem Kettani", "meryem212"],
    ["Ilyas Bensouda", "ilyas-bs"],
    ["Nisrine Tahiri", "nisrine-t"],
    ["Reda Sqalli", "reda-sq"],
    ["Ghita Benjelloun", "ghita-bj"],
    ["Othmane Idrissi", "othmane-id"],
    ["Loubna Saidi", "loubna-saidi-dev"],
  ],
};

// A city without its own list borrows one, the same one each time.
const FALLBACK = "dakar";

// The most there can be in a city: one list's length.
export const MOST = 16;

/** How many walk around: fewer on low quality (a slow phone), and fewer on a small screen, which shows less street. */
export function passerbyCount(quality: "high" | "low", smallScreen: boolean): number {
  if (quality === "low") return smallScreen ? 4 : 6;
  return smallScreen ? 10 : MOST;
}

/** `count` passers-by for a city, in an order that's the same every time for that city. */
export function passersBy(city: string, count: number): Passerby[] {
  const list = PEOPLE[city.toLowerCase()] ?? PEOPLE[FALLBACK];
  const rand = seeded(`passersby:${city.toLowerCase()}`);
  const shuffled = list.map(([name, login]) => ({ name, login, k: rand() })).sort((a, b) => a.k - b.k);
  return shuffled.slice(0, Math.max(0, Math.min(count, list.length))).map(({ name, login }) => ({ name, login }));
}

/** Whether a handle is one GitHub would take: 1 to 39 letters, digits or single hyphens, not starting or ending in one. */
export function isGithubHandle(login: string): boolean {
  return /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/.test(login);
}

/** Every handle, for the tests: none may repeat, and each must look like a real GitHub handle. */
export function allPassersBy(): Passerby[] {
  return Object.values(PEOPLE).flatMap((list) => list.map(([name, login]) => ({ name, login })));
}

// Sidewalks. Each block is ringed by a sidewalk 0.8 wide (Lobby.ts draws the curb). A passer-by walks around a block on
// it, at their own distance from the block's edge (their lane), and now and then crosses the street at a zebra to the
// next block. Cheaper than a path search: the route is a ring of 16 points per block, worked out once per city.

// Where the zebras are, from a block's corner along its side (Lobby.streetMarkings paints them ROAD × 0.95 from the
// crossing's centre, which is ROAD / 2 from the corner on each axis).
const ZEBRA = ROAD * 0.95 - ROAD / 2;
// Corners are cut this far from the corner on each side, so nobody walks into the palm, lamp or traffic light there.
const CUT = 0.7;

export interface SidewalkPoint {
  // On the block's edge; the walker stands `lane` out along the normal (nx, nz).
  x: number;
  z: number;
  nx: number;
  nz: number;
  // A zebra: the point across the street on the next block (its block and index), when there's a block there.
  across?: { block: number; at: number };
}

/** Every block's sidewalk ring: 16 points each (two cuts per corner, two zebras per side), going round the same way. */
export function sidewalks(blocks: Pick<Block, "x" | "z" | "width" | "depth">[]): SidewalkPoint[][] {
  const rings = blocks.map((b) => {
    const [x0, x1, z0, z1] = [b.x - b.width / 2, b.x + b.width / 2, b.z - b.depth / 2, b.z + b.depth / 2];
    // The four sides, each from its start corner to its end corner, with its outward normal.
    const sides = [
      { from: [x0, z0], to: [x1, z0], n: [0, -1] },
      { from: [x1, z0], to: [x1, z1], n: [1, 0] },
      { from: [x1, z1], to: [x0, z1], n: [0, 1] },
      { from: [x0, z1], to: [x0, z0], n: [-1, 0] },
    ];
    return sides.flatMap(({ from, to, n }) => {
      const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
      const [dx, dz] = [(to[0] - from[0]) / len, (to[1] - from[1]) / len];
      return [CUT, ZEBRA, len - ZEBRA, len - CUT].map((t) => ({ x: from[0] + dx * t, z: from[1] + dz * t, nx: n[0], nz: n[1] }) as SidewalkPoint);
    });
  });
  // A zebra links to the zebra straight across the street (ROAD away, along its normal), on the block there.
  const key = (x: number, z: number) => `${Math.round(x * 100)},${Math.round(z * 100)}`;
  const zebras = new Map<string, { block: number; at: number }>();
  rings.forEach((ring, block) => ring.forEach((p, at) => at % 4 === 1 || at % 4 === 2 ? zebras.set(key(p.x, p.z), { block, at }) : undefined));
  rings.forEach((ring) =>
    ring.forEach((p, at) => {
      if (at % 4 !== 1 && at % 4 !== 2) return;
      const other = zebras.get(key(p.x + p.nx * ROAD, p.z + p.nz * ROAD));
      if (other) p.across = other;
    }),
  );
  return rings;
}

/** Where a walker stands at a sidewalk point, in their lane. */
export const standAt = (p: SidewalkPoint, lane: number) => ({ x: p.x + p.nx * lane, z: p.z + p.nz * lane });

export interface Stroll {
  block: number;
  at: number;
  // Which way round the block: +1 or -1.
  dir: 1 | -1;
  // How far out from the block's edge they walk: those going one way keep nearer the block, the others nearer the road,
  // so people walking towards each other pass instead of bumping.
  lane: number;
  // They just crossed to this point: they walk on rather than straight back.
  crossed?: boolean;
}

/** A lane for walking `dir` round a block: 0.2 to 0.35 out one way, 0.45 to 0.6 the other (the sidewalk is 0.8). */
export const laneFor = (dir: 1 | -1, rand: () => number) => (dir === 1 ? 0.2 : 0.45) + rand() * 0.15;

/**
 * The next point on a walk: the next one round the block; at a zebra, sometimes across the street (then off round that
 * block, either way), never straight back across the street they just crossed.
 */
export function walkAhead(rings: SidewalkPoint[][], s: Stroll, rand: () => number): Stroll {
  const here = rings[s.block][s.at];
  if (here.across && !s.crossed && rand() < 0.35) {
    const dir: 1 | -1 = rand() < 0.5 ? 1 : -1;
    return { block: here.across.block, at: here.across.at, dir, lane: dir === s.dir ? s.lane : laneFor(dir, rand), crossed: true };
  }
  const n = rings[s.block].length;
  return { block: s.block, at: (s.at + s.dir + n) % n, dir: s.dir, lane: s.lane };
}

/**
 * Nudges people apart who are closer than `radius`: each moves half the overlap away from the other, turned a little
 * to the side so two walking head-on step round each other instead of pushing. In place; n² over at most 16 people.
 */
export function keepApart(points: { x: number; z: number }[], radius: number) {
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i];
      const b = points[j];
      let dx = a.x - b.x;
      let dz = a.z - b.z;
      const d = Math.hypot(dx, dz);
      if (d >= radius) continue;
      if (d < 1e-6) [dx, dz] = [1, 0];
      else [dx, dz] = [dx / d, dz / d];
      const push = (radius - d) / 2;
      // Away from each other, plus half as much to the side (each to their own right).
      const px = (dx - dz * 0.5) * push;
      const pz = (dz + dx * 0.5) * push;
      a.x += px;
      a.z += pz;
      b.x -= px;
      b.z -= pz;
    }
  }
}
