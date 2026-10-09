// A neighbourhood, generated from its city's name: blocks of plots between streets, a market square, maybe a
// park, filler buildings on the empty plots and a skyline beyond the last street. The same name always gives the
// same map, so everyone walks the same streets. Pure: no three.js, no randomness that isn't seeded.

export const PLOT = 8; // a plot is PLOT × PLOT units
export const ROAD = 5; // a street, sidewalks included

// Which way a plot's front faces. A model faces +z; it's turned by `facing × 90°` around y.
export type Facing = 0 | 1 | 2 | 3;

export type Lot =
  | { kind: "house"; houseId: string }
  | { kind: "shop"; variant: number }
  | { kind: "tower"; variant: number }
  | { kind: "trees"; count: number };

export interface Plot {
  // Stable name for this plot: "block column.block row.plot column.plot row". A house that rents a plot keeps its
  // key in the database, so it stays put even when the houses around it change.
  key: string;
  x: number;
  z: number;
  facing: Facing;
  lot: Lot;
}

export interface Block {
  x: number;
  z: number;
  width: number;
  depth: number;
  kind: "homes" | "market" | "park";
}

export interface Neighbourhood {
  city: string;
  blocks: Block[];
  plots: Plot[];
  // Street rectangles (centre and size), for drawing.
  streets: { x: number; z: number; width: number; depth: number }[];
  intersections: { x: number; z: number }[];
  lamps: { id: string; x: number; z: number }[];
  trafficLights: { x: number; z: number; facing: Facing }[];
  // Low buildings beyond the last street: the rest of the city, seen but not walked.
  skyline: { x: number; z: number; variant: number; facing: Facing; scale: number }[];
  spawn: { x: number; z: number };
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

export const SHOP_VARIANTS = 14;
export const TOWER_VARIANTS = 5;
export const SKYLINE_VARIANTS = 16;

/** A small, fast, seeded random generator (mulberry32). */
export function seeded(text: string): () => number {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface HouseOnMap {
  id: string;
  demo: boolean;
  // The plot it rented (a plot key), or null for a house that takes the next free plot near the market.
  plot?: string | null;
}

/**
 * Lays out a neighbourhood for `city`, with a plot for each of its houses. A house that rented a plot stands on it;
 * the others take the plots nearest the market (real houses first). Bigger cities get more blocks; every
 * neighbourhood has room to spare, filled with shops, towers and trees, all of them empty and up for rent.
 */
export function generateNeighbourhood(city: string, houses: HouseOnMap[], opts: { small?: boolean } = {}): Neighbourhood {
  const rand = seeded(city.toLowerCase());
  const pick = (n: number) => Math.floor(rand() * n);

  // Enough plots for everyone, plenty of filler, and at least a 3 × 2 grid of blocks. `small` (the tutorial) is
  // just a market square and one block of four plots: nowhere to get lost.
  const wanted = Math.max(14, houses.length * 3);
  const columns = Array.from({ length: 6 }, () => (opts.small ? 2 : 2 + pick(2))); // plots per block, along x
  let bx = opts.small ? 2 : 3;
  let bz = opts.small ? 1 : 2;
  while (!opts.small && bx * bz * 5 < wanted) bx * bz < 2 * bx ? bz++ : bx <= bz ? bx++ : bz++;
  bx = Math.min(bx, 6);

  // Street lines and block extents, along each axis.
  const xs: { start: number; size: number }[] = [];
  let cursor = ROAD;
  for (let i = 0; i < bx; i++) {
    const size = columns[i] * PLOT;
    xs.push({ start: cursor, size });
    cursor += size + ROAD;
  }
  const width = cursor;
  const zs: { start: number; size: number }[] = [];
  cursor = ROAD;
  for (let j = 0; j < bz; j++) {
    zs.push({ start: cursor, size: 2 * PLOT });
    cursor += 2 * PLOT + ROAD;
  }
  const depth = cursor;
  const ox = -width / 2;
  const oz = -depth / 2;

  // The market is the most central block; a park sits elsewhere, when there's room.
  const centre = { i: Math.floor((bx - 1) / 2), j: Math.floor((bz - 1) / 2) };
  const parkAt = bx * bz >= 6 ? { i: (centre.i + 1 + pick(bx - 1)) % bx, j: pick(bz) } : null;

  const blocks: Block[] = [];
  const plots: Plot[] = [];
  for (let i = 0; i < bx; i++) {
    for (let j = 0; j < bz; j++) {
      const kind: Block["kind"] = i === centre.i && j === centre.j ? "market" : parkAt && parkAt.i === i && parkAt.j === j ? "park" : "homes";
      const b = { x: ox + xs[i].start + xs[i].size / 2, z: oz + zs[j].start + zs[j].size / 2, width: xs[i].size, depth: zs[j].size, kind };
      blocks.push(b);
      if (kind !== "homes") continue;
      // Two rows back to back: the north row faces the street to its north, the south row the one to its south.
      for (let c = 0; c < columns[i]; c++) {
        const x = ox + xs[i].start + c * PLOT + PLOT / 2;
        plots.push({ key: `${i}.${j}.${c}.0`, x, z: b.z - PLOT / 2, facing: 2, lot: { kind: "trees", count: 0 } });
        plots.push({ key: `${i}.${j}.${c}.1`, x, z: b.z + PLOT / 2, facing: 0, lot: { kind: "trees", count: 0 } });
      }
    }
  }

  // Houses that rented a plot stand on it. The others take the plots nearest the market (real houses before demo
  // ones), and the rest of the street fills in with shops, towers and trees.
  const market = blocks.find((b) => b.kind === "market")!;
  const byKey = new Map(plots.map((p) => [p.key, p]));
  const unplaced: HouseOnMap[] = [];
  for (const h of houses) {
    const p = h.plot ? byKey.get(h.plot) : undefined;
    if (p && p.lot.kind !== "house") p.lot = { kind: "house", houseId: h.id };
    else unplaced.push(h);
  }
  const byDistance = plots
    .filter((p) => p.lot.kind !== "house")
    .sort((a, b) => Math.hypot(a.x - market.x, a.z - market.z) - Math.hypot(b.x - market.x, b.z - market.z));
  const ordered = [...unplaced].sort((a, b) => Number(a.demo) - Number(b.demo));
  ordered.forEach((h, k) => {
    if (byDistance[k]) byDistance[k].lot = { kind: "house", houseId: h.id };
  });
  for (const p of byDistance.slice(ordered.length)) {
    const r = rand();
    const nearMarket = Math.hypot(p.x - market.x, p.z - market.z) < PLOT * 2.5;
    p.lot = r < 0.18 ? { kind: "trees", count: 2 + pick(3) } : r < 0.28 && !nearMarket ? { kind: "tower", variant: pick(TOWER_VARIANTS) } : { kind: "shop", variant: pick(SHOP_VARIANTS) };
  }

  // Streets: one along every line between (and around) blocks.
  const streets: Neighbourhood["streets"] = [];
  const lineX = [0, ...xs.map((s) => s.start + s.size)].map((v) => ox + v + ROAD / 2);
  const lineZ = [0, ...zs.map((s) => s.start + s.size)].map((v) => oz + v + ROAD / 2);
  for (const x of lineX) streets.push({ x, z: 0, width: ROAD, depth });
  for (const z of lineZ) streets.push({ x: 0, z, width, depth: ROAD });

  const intersections = lineX.flatMap((x) => lineZ.map((z) => ({ x, z })));
  // A lamp at a corner of every crossing, and traffic lights at a few.
  const lamps = intersections.map((p, k) => ({ id: `${city}:${k}`, x: p.x + ROAD / 2 - 0.5, z: p.z + ROAD / 2 - 0.5 }));
  const trafficLights = intersections
    .filter(() => rand() < 0.3)
    .map((p) => ({ x: p.x - ROAD / 2 + 0.5, z: p.z - ROAD / 2 + 0.5, facing: pick(4) as Facing }));

  // The skyline: a ring of low buildings beyond the outer streets.
  const skyline: Neighbourhood["skyline"] = [];
  const ring = (along: number, fixed: number, horizontal: boolean, facing: Facing) => {
    for (let t = -along / 2 - 6; t < along / 2 + 6; t += 5 + rand() * 4) {
      const d = fixed + Math.sign(fixed) * (4 + rand() * 10);
      skyline.push({ x: horizontal ? t : d, z: horizontal ? d : t, variant: pick(SKYLINE_VARIANTS), facing, scale: 4 + rand() * 4 });
    }
  };
  ring(width, -depth / 2, true, 0);
  ring(width, depth / 2, true, 2);
  ring(depth, -width / 2, false, 1);
  ring(depth, width / 2, false, 3);

  return {
    city,
    blocks,
    plots,
    streets,
    intersections,
    lamps,
    trafficLights,
    skyline,
    // Start on the street just south of the market, facing into the neighbourhood.
    spawn: { x: market.x, z: market.z + market.depth / 2 + ROAD / 2 },
    bounds: { minX: -width / 2, maxX: width / 2, minZ: -depth / 2, maxZ: depth / 2 },
  };
}

/** Where to stand to go into a plot's building: on the sidewalk in front of it. */
export function frontOf(p: { x: number; z: number; facing: Facing }, distance: number): { x: number; z: number } {
  const dir = FACING_DIR[p.facing];
  return { x: p.x + dir.x * distance, z: p.z + dir.z * distance };
}

// Unit vectors for each facing: 0 → +z, 1 → +x, 2 → -z, 3 → -x (a +z model turned by facing × 90°).
export const FACING_DIR: Record<Facing, { x: number; z: number }> = {
  0: { x: 0, z: 1 },
  1: { x: 1, z: 0 },
  2: { x: 0, z: -1 },
  3: { x: -1, z: 0 },
};
