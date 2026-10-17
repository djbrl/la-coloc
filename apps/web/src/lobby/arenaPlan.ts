// The Arena's layout on its block (see docs/arena.md): an oval bowl of stands with a gap for the entrance on the side
// facing the market, a pitch inside, a boxing-ring stage in the middle and a floodlight mast on each corner. Worked
// out once per city from `Neighbourhood.arena`, and read by the model (arena.ts), by the walk grid (`colliders`: the
// stands are walls, the entrance is a gap in them), by the passers-by who come to watch (`seats`, `spots`), and by the
// crowd count (`insideBowl`). Pure: no three.js, so it's tested on its own.
import { type Facing, FACING_DIR } from "./neighbourhood";
import type { Box, Point } from "./path";

// The entrance: a straight passage this wide through the stands.
export const GATE = 3.8;
// The stands: how thick the band of seats is, how many tiers it has and how much each one rises.
export const STANDS = { thick: 2.2, tiers: 4, rise: 0.5 };
// How far the bowl's outer wall stays in from the block's edge (the block's lawn is inset 0.2, the curb beyond).
const INSET = 0.5;
// The cells the stands are cut into for the walk grid: smaller is closer to the curve, at the cost of more boxes.
const CELL = 0.5;

export interface ArenaSite {
  x: number;
  z: number;
  width: number;
  depth: number;
  facing: Facing;
}

export interface Ellipse {
  rx: number;
  rz: number;
}

export interface ArenaPlan {
  centre: Point;
  facing: Facing;
  // The bowl's outer wall and the pitch's edge (the stands' inner edge).
  outer: Ellipse;
  inner: Ellipse;
  // The entrance: its direction from the centre as an angle (x = cos, z = sin), the passage through the stands (a
  // box, where you're "at the entrance"), the point in the street in front of it, and the point just inside.
  gate: { angle: number; box: Box; door: Point; inside: Point; outerEdge: Point };
  // The boxing ring in the middle, half its side.
  stage: { half: number };
  masts: Point[];
  // What you can't walk through: the stands (cut into strips, the entrance left open), the stage and the masts.
  colliders: Box[];
  // Places to stand in the stands (each tier's middle, at its height), facing the stage, the entrance left clear.
  seats: { x: number; z: number; y: number; ry: number }[];
  // Places to stand on the pitch, in a ring round the stage: walking from one to the next never crosses it.
  spots: Point[];
}

/** The Arena on its block. */
export function arenaPlan(site: ArenaSite): ArenaPlan {
  const centre = { x: site.x, z: site.z };
  const outer = { rx: site.width / 2 - INSET, rz: site.depth / 2 - INSET };
  const inner = { rx: outer.rx - STANDS.thick, rz: outer.rz - STANDS.thick };
  const dir = FACING_DIR[site.facing];
  const angle = Math.atan2(dir.z, dir.x);
  // Along the entrance's axis, the radius of each ellipse.
  const alongX = dir.x !== 0;
  const outerAlong = alongX ? outer.rx : outer.rz;
  const innerAlong = alongX ? inner.rx : inner.rz;
  const innerAcross = alongX ? inner.rz : inner.rx;
  // Where the passage's straight sides cut the inner ellipse, along the axis.
  const innerCut = innerAlong * Math.sqrt(Math.max(0, 1 - (GATE / 2 / innerAcross) ** 2));
  const box = rect(centre, site.facing, innerCut - 0.3, outerAlong, -GATE / 2, GATE / 2);
  const at = (along: number) => ({ x: centre.x + dir.x * along, z: centre.z + dir.z * along });
  const half = Math.min(1.6, 0.28 * Math.min(inner.rx, inner.rz));

  const masts = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ x: centre.x + sx * (site.width / 2 - 1), z: centre.z + sz * (site.depth / 2 - 1) })));

  // The stands as strips one cell deep, from every cell whose centre is between the two ellipses and outside the
  // passage, merged along x.
  const colliders: Box[] = [];
  const x0 = centre.x - outer.rx;
  const z0 = centre.z - outer.rz;
  const cols = Math.ceil((2 * outer.rx) / CELL);
  const rows = Math.ceil((2 * outer.rz) / CELL);
  for (let r = 0; r < rows; r++) {
    const z = z0 + (r + 0.5) * CELL;
    let start = -1;
    for (let c = 0; c <= cols; c++) {
      const x = x0 + (c + 0.5) * CELL;
      const solid = c < cols && inStands({ centre, outer, inner, facing: site.facing }, x, z);
      if (solid && start < 0) start = c;
      if (!solid && start >= 0) {
        colliders.push({ minX: x0 + start * CELL, maxX: x0 + c * CELL, minZ: z - CELL / 2, maxZ: z + CELL / 2 });
        start = -1;
      }
    }
  }
  colliders.push({ minX: centre.x - half, maxX: centre.x + half, minZ: centre.z - half, maxZ: centre.z + half });
  for (const m of masts) colliders.push({ minX: m.x - 0.35, maxX: m.x + 0.35, minZ: m.z - 0.35, maxZ: m.z + 0.35 });

  // Seats: round each tier's middle, a step apart, none in the passage.
  const seats: ArenaPlan["seats"] = [];
  for (let k = 0; k < STANDS.tiers; k++) {
    const t = (k + 0.5) / STANDS.tiers;
    const e = { rx: inner.rx + STANDS.thick * t, rz: inner.rz + STANDS.thick * t };
    const count = Math.floor((Math.PI * (e.rx + e.rz)) / 1.4);
    for (let i = 0; i < count; i++) {
      const a = angle + Math.PI / count + (i / count) * Math.PI * 2;
      const x = centre.x + e.rx * Math.cos(a);
      const z = centre.z + e.rz * Math.sin(a);
      if (inPassage(centre, site.facing, x, z, 0.8)) continue;
      seats.push({ x, z, y: tierTop(k), ry: Math.atan2(centre.x - x, centre.z - z) });
    }
  }

  // Spots on the pitch: a ring halfway between the stage and the stands.
  const spots: Point[] = [];
  const ring = { rx: (half * 1.41 + inner.rx) / 2, rz: (half * 1.41 + inner.rz) / 2 };
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = angle + (i / n) * Math.PI * 2;
    spots.push({ x: centre.x + ring.rx * Math.cos(a), z: centre.z + ring.rz * Math.sin(a) });
  }

  return {
    centre,
    facing: site.facing,
    outer,
    inner,
    gate: { angle, box, door: at(outerAlong + 1), inside: at(innerCut - 0.9), outerEdge: at(outerAlong) },
    stage: { half },
    masts,
    colliders,
    seats,
    spots,
  };
}

/** How high tier `k` (0 the lowest, by the pitch) stands. */
export const tierTop = (k: number) => (k + 1) * STANDS.rise;

/** Whether a point is in the stands: between the two ellipses, and not in the entrance's passage. */
export function inStands(p: Pick<ArenaPlan, "centre" | "outer" | "inner" | "facing">, x: number, z: number): boolean {
  const dx = x - p.centre.x;
  const dz = z - p.centre.z;
  const out = (dx / p.outer.rx) ** 2 + (dz / p.outer.rz) ** 2;
  const inn = (dx / p.inner.rx) ** 2 + (dz / p.inner.rz) ** 2;
  return out < 1 && inn >= 1 && !inPassage(p.centre, p.facing, x, z, 0);
}

/** Whether a point is inside the bowl (the pitch, the stands or the entrance's passage): for the crowd count. */
export function insideBowl(p: Pick<ArenaPlan, "centre" | "outer">, x: number, z: number): boolean {
  return ((x - p.centre.x) / p.outer.rx) ** 2 + ((z - p.centre.z) / p.outer.rz) ** 2 < 1;
}

/** Whether a point is in the entrance's passage (on its side of the centre, within half the gate's width plus `margin`). */
function inPassage(centre: Point, facing: Facing, x: number, z: number, margin: number): boolean {
  const d = FACING_DIR[facing];
  const along = (x - centre.x) * d.x + (z - centre.z) * d.z;
  const across = (x - centre.x) * d.z - (z - centre.z) * d.x;
  return along > 0 && Math.abs(across) < GATE / 2 + margin;
}

/**
 * The half-angle of the entrance's gap on an ellipse: the passage's sides are straight, `GATE` apart, so the gap is
 * wider (in angle) on the inner ellipse than on the outer one. The model cuts each ring of the stands with it.
 */
export function gapHalf(e: Ellipse, facing: Facing): number {
  const across = FACING_DIR[facing].x !== 0 ? e.rz : e.rx;
  return Math.asin(Math.min(1, GATE / 2 / across));
}

/** A box from a centre, `along` the facing's direction from a0 to a1 and across it from t0 to t1. */
function rect(c: Point, facing: Facing, a0: number, a1: number, t0: number, t1: number): Box {
  const d = FACING_DIR[facing];
  const xs: number[] = [];
  const zs: number[] = [];
  for (const a of [a0, a1])
    for (const t of [t0, t1]) {
      xs.push(c.x + d.x * a + d.z * t);
      zs.push(c.z + d.z * a - d.x * t);
    }
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

// ---- The big screen over the entrance ----

/** How long until a challenge ends, in whole days, hours and minutes (rounded down); `over` once it has. */
export function timeLeft(endsAt: string, now: number): { days: number; hours: number; minutes: number; over: boolean } {
  const ms = Date.parse(endsAt) - now;
  if (!(ms > 0)) return { days: 0, hours: 0, minutes: 0, over: true };
  const minutes = Math.floor(ms / 60000);
  return { days: Math.floor(minutes / 1440), hours: Math.floor((minutes % 1440) / 60), minutes: minutes % 60, over: false };
}
