// Walking routes for the lobby. A grid of small cells covers the neighbourhood, each one free or blocked by a
// building; A* finds a route between two cells (eight directions, never cutting a corner past a blocked cell), and
// `smooth` pulls the staircase A* gives into a few straight legs. Pure: no three.js, so it's unit-tested on its own.

export interface Point {
  x: number;
  z: number;
}

export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const RADIUS = 0.4; // how wide a person is: ground this close to a wall can't be stood on

export interface Grid {
  cell: number; // the size of a cell, in world units
  cols: number;
  rows: number;
  minX: number;
  minZ: number;
  // One byte per cell, row by row (index = row × cols + column): 1 where you can't stand.
  blocked: Uint8Array;
}

const SQRT2 = Math.SQRT2;
// The eight steps out of a cell (columns, rows) and how far each is: a diagonal is √2 cells.
const STEP_C = [1, -1, 0, 0, 1, 1, -1, -1];
const STEP_R = [0, 0, 1, -1, 1, -1, 1, -1];
const STEP_LENGTH = [1, 1, 1, 1, SQRT2, SQRT2, SQRT2, SQRT2];

// The working arrays of a search, one entry per cell, kept from one search to the next so a search allocates
// nothing: the best known cost to reach each cell, that cost plus the guess to the goal, where we came from, and
// which cells are settled.
let scratch = { size: 0, cost: new Float64Array(0), score: new Float64Array(0), cameFrom: new Int32Array(0), done: new Uint8Array(0) };

/** A grid over `bounds`: a cell is blocked when its centre lies inside any solid box, padded by `pad`. */
export function buildGrid(bounds: Box, solids: Box[], cell = 0.5, pad = RADIUS): Grid {
  const cols = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / cell));
  const rows = Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / cell));
  const grid: Grid = { cell, cols, rows, minX: bounds.minX, minZ: bounds.minZ, blocked: new Uint8Array(cols * rows) };
  for (const s of solids) {
    // Cell centres sit at minX + (column + ½) × cell, so these are the columns and rows the padded box covers.
    const c0 = Math.max(0, Math.ceil((s.minX - pad - grid.minX) / cell - 0.5));
    const c1 = Math.min(cols - 1, Math.floor((s.maxX + pad - grid.minX) / cell - 0.5));
    const r0 = Math.max(0, Math.ceil((s.minZ - pad - grid.minZ) / cell - 0.5));
    const r1 = Math.min(rows - 1, Math.floor((s.maxZ + pad - grid.minZ) / cell - 0.5));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) grid.blocked[r * cols + c] = 1;
  }
  return grid;
}

/** The index of the cell under a point. A point outside the grid gets the nearest edge cell. */
export function cellAt(grid: Grid, x: number, z: number): number {
  const c = clamp(Math.floor((x - grid.minX) / grid.cell), 0, grid.cols - 1);
  const r = clamp(Math.floor((z - grid.minZ) / grid.cell), 0, grid.rows - 1);
  return r * grid.cols + c;
}

/** The centre of a cell, in world units. */
export function centreOf(grid: Grid, index: number): Point {
  const c = index % grid.cols;
  const r = Math.floor(index / grid.cols);
  return { x: grid.minX + (c + 0.5) * grid.cell, z: grid.minZ + (r + 0.5) * grid.cell };
}

/** Whether you can stand at a point: its cell isn't blocked. */
export function isFree(grid: Grid, x: number, z: number): boolean {
  return grid.blocked[cellAt(grid, x, z)] === 0;
}

/** The centre of the nearest free cell to a point (the point's own cell when it's free), or null when none is. */
export function nearestFree(grid: Grid, x: number, z: number): Point | null {
  const i = nearestFreeCell(grid, x, z);
  return i < 0 ? null : centreOf(grid, i);
}

/** Like `nearestFree`, as a cell index: rings of cells around the point's own, until one holds a free cell. */
function nearestFreeCell(grid: Grid, x: number, z: number): number {
  const { cols, rows, blocked } = grid;
  const home = cellAt(grid, x, z);
  if (!blocked[home]) return home;
  const hc = home % cols;
  const hr = Math.floor(home / cols);
  for (let ring = 1; ring < Math.max(cols, rows); ring++) {
    let best = -1;
    let bestDistance = Infinity;
    for (let r = hr - ring; r <= hr + ring; r++) {
      if (r < 0 || r >= rows) continue;
      // Only the ring's edge: every column on its top and bottom rows, just the two ends elsewhere.
      const edge = r === hr - ring || r === hr + ring;
      for (let c = hc - ring; c <= hc + ring; c += edge ? 1 : 2 * ring) {
        if (c < 0 || c >= cols) continue;
        const i = r * cols + c;
        if (blocked[i]) continue;
        const p = centreOf(grid, i);
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < bestDistance) (best = i), (bestDistance = d);
      }
    }
    if (best >= 0) return best;
  }
  return -1;
}

/**
 * A route from `from` to `to`, as points to walk through in order (the first is `from` itself), or null when
 * there's no way through. `to` is a point (a spot on the ground; up against a wall, the nearest free cell is used
 * instead) or a box: then any free cell inside the box will do, and the route ends in the one nearest by foot.
 */
export function findPath(grid: Grid, from: Point, to: Point | Box): Point[] | null {
  const { cols, rows, blocked } = grid;
  const start = nearestFreeCell(grid, from.x, from.z);
  if (start < 0) return null;

  // The goal, as a range of columns and rows: one cell for a point, every cell whose centre is in the box otherwise.
  let c0: number, c1: number, r0: number, r1: number;
  if ("minX" in to) {
    c0 = Math.max(0, Math.ceil((to.minX - grid.minX) / grid.cell - 0.5));
    c1 = Math.min(cols - 1, Math.floor((to.maxX - grid.minX) / grid.cell - 0.5));
    r0 = Math.max(0, Math.ceil((to.minZ - grid.minZ) / grid.cell - 0.5));
    r1 = Math.min(rows - 1, Math.floor((to.maxZ - grid.minZ) / grid.cell - 0.5));
    if (c0 > c1 || r0 > r1) return null;
  } else {
    const goal = nearestFreeCell(grid, to.x, to.z);
    if (goal < 0) return null;
    c0 = c1 = goal % cols;
    r0 = r1 = Math.floor(goal / cols);
  }
  const isGoal = (c: number, r: number) => c >= c0 && c <= c1 && r >= r0 && r <= r1;
  // How far a cell is from the goal at best, in steps: straight as far as possible, then diagonal. Never an
  // overestimate, which is what keeps A* exact.
  const guess = (c: number, r: number) => {
    const dc = Math.max(0, c0 - c, c - c1);
    const dr = Math.max(0, r0 - r, r - r1);
    return Math.max(dc, dr) + (SQRT2 - 1) * Math.min(dc, dr);
  };

  // A* over cell indices, with an open list ordered by cost so far + guess (a binary heap; a cell pushed twice is
  // skipped the second time).
  const n = cols * rows;
  if (scratch.size !== n) scratch = { size: n, cost: new Float64Array(n), score: new Float64Array(n), cameFrom: new Int32Array(n), done: new Uint8Array(n) };
  const { cost, score, cameFrom, done } = scratch;
  cost.fill(Infinity);
  cameFrom.fill(-1);
  done.fill(0);
  const open = new Heap(score);
  cost[start] = 0;
  score[start] = guess(start % cols, Math.floor(start / cols));
  open.push(start);
  let end = -1;
  while (open.size() && end < 0) {
    const i = open.pop();
    if (done[i]) continue;
    done[i] = 1;
    const c = i % cols;
    const r = Math.floor(i / cols);
    if (isGoal(c, r)) {
      end = i;
      break;
    }
    for (let s = 0; s < 8; s++) {
      const dc = STEP_C[s];
      const dr = STEP_R[s];
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      const j = nr * cols + nc;
      if (blocked[j] || done[j]) continue;
      // No cutting corners: a diagonal step needs both cells beside it free, or you'd brush through the wall.
      if (dc && dr && (blocked[r * cols + nc] || blocked[nr * cols + c])) continue;
      const through = cost[i] + STEP_LENGTH[s];
      if (through >= cost[j]) continue;
      cost[j] = through;
      cameFrom[j] = i;
      score[j] = through + guess(nc, nr);
      open.push(j);
    }
  }
  if (end < 0) return null;

  // Walk the chain back to the start, then turn it into points: `from` itself, then cell centres. A point goal
  // that stands on free ground is reached exactly.
  const cells: number[] = [];
  for (let i = end; i >= 0; i = cameFrom[i]) cells.push(i);
  cells.reverse();
  const path: Point[] = [from, ...cells.slice(1).map((i) => centreOf(grid, i))];
  if (!("minX" in to) && end === cellAt(grid, to.x, to.z)) path[path.length - 1] = { x: to.x, z: to.z };
  if (path.length === 1) path.push(centreOf(grid, end));
  return path;
}

/** Whether you can walk straight from `a` to `b`: the ground is free at every quarter cell along the way. */
export function lineFree(grid: Grid, a: Point, b: Point): boolean {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (grid.cell / 4)));
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    if (!isFree(grid, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
  }
  return true;
}

/** Pulls a route taut: from each kept point, skip ahead as far as a straight free line goes, and keep that point. */
export function smooth(grid: Grid, path: Point[]): Point[] {
  if (path.length < 3) return path.slice();
  const out = [path[0]];
  let i = 0;
  while (i < path.length - 1) {
    let j = i + 1;
    while (j + 1 < path.length && lineFree(grid, path[i], path[j + 1])) j++;
    out.push(path[j]);
    i = j;
  }
  return out;
}

// ---- Boxes ----

/** A box grown by `by` on every side. */
export function grow(box: Box, by: number): Box {
  return { minX: box.minX - by, maxX: box.maxX + by, minZ: box.minZ - by, maxZ: box.maxZ + by };
}

/** The point of a box nearest to `p` (`p` itself when it's inside). */
export function nearestOnBox(p: Point, box: Box): Point {
  return { x: clamp(p.x, box.minX, box.maxX), z: clamp(p.z, box.minZ, box.maxZ) };
}

/** How far a point is from a box's edge: zero inside it. */
export function distanceToBox(p: Point, box: Box): number {
  const q = nearestOnBox(p, box);
  return Math.hypot(p.x - q.x, p.z - q.z);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** A binary min-heap of cell indices, ordered by their entry in `score`. */
class Heap {
  private items: number[] = [];

  constructor(private score: Float64Array) {}

  size(): number {
    return this.items.length;
  }

  push(i: number) {
    const items = this.items;
    items.push(i);
    // Bubble up while cheaper than the parent.
    let k = items.length - 1;
    while (k > 0) {
      const parent = (k - 1) >> 1;
      if (this.score[items[parent]] <= this.score[i]) break;
      items[k] = items[parent];
      k = parent;
    }
    items[k] = i;
  }

  pop(): number {
    const items = this.items;
    const top = items[0];
    const last = items.pop()!;
    if (!items.length) return top;
    // Sink the last item down from the top until both children cost more.
    let k = 0;
    for (;;) {
      const left = 2 * k + 1;
      if (left >= items.length) break;
      const right = left + 1;
      const child = right < items.length && this.score[items[right]] < this.score[items[left]] ? right : left;
      if (this.score[items[child]] >= this.score[last]) break;
      items[k] = items[child];
      k = child;
    }
    items[k] = last;
    return top;
  }
}
