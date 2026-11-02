// Passers-by: made-up people who walk the streets so a city doesn't feel empty with only a few flatmates by their
// doors. Each has a full name fitting the city and a handle on their name tag, invented here. Each handle has an
// underscore, which GitHub never allows in a login: it reads like a handle, but no real person on GitHub can have it
// (in the 16 Oct review, 36 of the earlier hyphenated ones turned out to be real accounts). They have no house and no
// GitHub account, and their card says they're an example person. The API only hears of one when someone writes to them.
// Pure: no three.js. The lobby (Lobby.ts) dresses them with the same avatars as everyone and walks them around the
// blocks on the sidewalks, crossing at the zebras (`sidewalks`, `walkAhead`), a little apart from each other (`keepApart`).
import people from "../../../../packages/domain/src/passersby.json";
import { type Block, ROAD, seeded } from "./neighbourhood";

export interface Passerby {
  // A made-up handle, shown on their name tag: never one GitHub would give (see isMadeUpHandle).
  login: string;
  // Their full name, shown on their card.
  name: string;
  // A visitor: the city they come from, so their tag says they're a tourist.
  from?: string;
}

// [full name, handle], by city. Names from the city's own languages; none repeats a seeded flatmate's first name in
// the same city, so a passer-by is never mistaken for someone who lives there.
const PEOPLE = people as unknown as Record<string, [string, string][]>;

// A city without its own list borrows one, the same one each time.
const FALLBACK = "dakar";

// The most there can be in a city: one list's length.
export const MOST = 16;
// How many of them are from another city, so a city always has a tourist or two walking around.
export const VISITORS = 2;

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

/** `count` people from other cities, visiting this one: the tourists a city always has. Same ones every time. */
export function visitorsIn(city: string, count: number): Passerby[] {
  const here = city.toLowerCase();
  const rand = seeded(`visitors:${here}`);
  const elsewhere = Object.entries(PEOPLE)
    .filter(([from]) => from !== here)
    .map(([from, list]) => ({ from, who: list[Math.floor(rand() * list.length)], k: rand() }))
    .sort((a, b) => a.k - b.k);
  return elsewhere.slice(0, count).map(({ from, who: [name, login] }) => ({ name, login, from }));
}

/**
 * Whether a handle is safely made up: lowercase letters and digits in words joined by single underscores, at most 39
 * long. GitHub logins can't contain an underscore, so no GitHub account can ever be this handle.
 */
export function isMadeUpHandle(login: string): boolean {
  return login.length <= 39 && /^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(login);
}

/** Every handle, for the tests: none may repeat, and none may be a handle GitHub could give someone. */
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
