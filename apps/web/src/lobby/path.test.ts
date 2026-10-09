import { describe, expect, it } from "vitest";
import { type Box, buildGrid, distanceToBox, findPath, grow, isFree, lineFree, nearestFree, type Point, smooth } from "./path";

const bounds: Box = { minX: 0, maxX: 20, minZ: 0, maxZ: 20 };
const house: Box = { minX: 8, maxX: 12, minZ: 8, maxZ: 12 };

/** Whether a point is inside a box. */
const inside = (p: Point, b: Box) => p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ;

describe("the walk grid", () => {
  it("blocks the cells whose centre lies in a padded solid, and nothing else", () => {
    const grid = buildGrid(bounds, [house], 0.5, 0.4);
    expect(grid.cols).toBe(40);
    expect(grid.rows).toBe(40);
    expect(isFree(grid, 10, 10)).toBe(false);
    // Just inside the padding (the wall is at x = 8, the padding reaches 7.6): blocked. Well outside: free.
    expect(isFree(grid, 7.7, 10)).toBe(false);
    expect(isFree(grid, 7.2, 10)).toBe(true);
    expect(isFree(grid, 1, 1)).toBe(true);
  });
});

describe("finding a path", () => {
  const grid = buildGrid(bounds, [house]);

  it("goes around a box, every leg on free ground", () => {
    const path = findPath(grid, { x: 2, z: 10 }, { x: 18, z: 10 })!;
    expect(path).not.toBeNull();
    expect(path[0]).toEqual({ x: 2, z: 10 });
    expect(path[path.length - 1]).toEqual({ x: 18, z: 10 });
    for (const p of path) expect(inside(p, grow(house, 0.4))).toBe(false);
    for (let i = 1; i < path.length; i++) expect(lineFree(grid, path[i - 1], path[i])).toBe(true);
  });

  it("never cuts a corner past a blocked cell", () => {
    // Two boxes touching at one corner: the only way from one notch to the other is around, never between.
    const a: Box = { minX: 4, maxX: 10, minZ: 4, maxZ: 10 };
    const b: Box = { minX: 10, maxX: 16, minZ: 10, maxZ: 16 };
    const tight = buildGrid(bounds, [a, b], 0.5, 0);
    const path = findPath(tight, { x: 7, z: 13 }, { x: 13, z: 7 })!;
    expect(path).not.toBeNull();
    // A diagonal step is only taken when both cells beside it are free.
    for (let i = 1; i < path.length; i++) {
      const p = path[i - 1];
      const q = path[i];
      if (p.x !== q.x && p.z !== q.z) {
        expect(isFree(tight, q.x, p.z)).toBe(true);
        expect(isFree(tight, p.x, q.z)).toBe(true);
      }
    }
    // So the route is far longer than the straight line through the corner would be.
    let length = 0;
    for (let i = 1; i < path.length; i++) length += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
    expect(length).toBeGreaterThan(15);
  });

  it("snaps a target against a wall to the nearest free cell", () => {
    // Aim at the middle of the house: the route ends at the free cell nearest to it, just outside the padding.
    const snapped = nearestFree(grid, 10, 8.3)!;
    expect(isFree(grid, snapped.x, snapped.z)).toBe(true);
    expect(distanceToBox(snapped, house)).toBeLessThan(1);
    const path = findPath(grid, { x: 10, z: 2 }, { x: 10, z: 8.3 })!;
    expect(path[path.length - 1]).toEqual(snapped);
  });

  it("reaches a box from whichever side you're on", () => {
    // The band around the house that counts as "in reach". From the north you end up north, from the east, east.
    const band = grow(house, 1.35);
    const fromNorth = findPath(grid, { x: 10, z: 2 }, band)!;
    const fromEast = findPath(grid, { x: 18, z: 10 }, band)!;
    const endNorth = fromNorth[fromNorth.length - 1];
    const endEast = fromEast[fromEast.length - 1];
    expect(endNorth.z).toBeLessThan(house.minZ);
    expect(endEast.x).toBeGreaterThan(house.maxX);
    expect(distanceToBox(endNorth, house)).toBeLessThan(1.6);
    expect(distanceToBox(endEast, house)).toBeLessThan(1.6);
  });

  it("finds nothing to walk to on an island", () => {
    // Four walls around a courtyard, the target inside.
    const walls: Box[] = [
      { minX: 4, maxX: 16, minZ: 4, maxZ: 5 },
      { minX: 4, maxX: 16, minZ: 15, maxZ: 16 },
      { minX: 4, maxX: 5, minZ: 4, maxZ: 16 },
      { minX: 15, maxX: 16, minZ: 4, maxZ: 16 },
    ];
    const walled = buildGrid(bounds, walls);
    expect(findPath(walled, { x: 1, z: 1 }, { x: 10, z: 10 })).toBeNull();
    expect(findPath(walled, { x: 1, z: 1 }, { minX: 9, maxX: 11, minZ: 9, maxZ: 11 })).toBeNull();
    // Yet the courtyard itself is walkable from within.
    expect(findPath(walled, { x: 8, z: 8 }, { x: 12, z: 12 })).not.toBeNull();
  });

  it("stays fast on a neighbourhood-sized grid", () => {
    // 110 × 70 units, a house on every plot, a route from corner to corner.
    const town: Box = { minX: -55, maxX: 55, minZ: -35, maxZ: 35 };
    const solids: Box[] = [];
    for (let x = -48; x < 48; x += 8) for (let z = -28; z < 28; z += 13) solids.push({ minX: x, maxX: x + 5.5, minZ: z, maxZ: z + 5.5 });
    const big = buildGrid(town, solids);
    const started = performance.now();
    const path = findPath(big, { x: -54, z: -34 }, { x: 54, z: 34 });
    const route = smooth(big, path!);
    const took = performance.now() - started;
    expect(path).not.toBeNull();
    expect(route.length).toBeLessThan(path!.length);
    // A search takes about a millisecond; this only catches a blow-up, on a machine busy with other things too.
    expect(took).toBeLessThan(250);
  });
});

describe("smoothing a path", () => {
  it("drops the waypoints a straight line makes needless", () => {
    const open = buildGrid(bounds, []);
    const path = findPath(open, { x: 1, z: 1 }, { x: 15, z: 9 })!;
    expect(path.length).toBeGreaterThan(10);
    expect(smooth(open, path)).toEqual([
      { x: 1, z: 1 },
      { x: 15, z: 9 },
    ]);
  });

  it("keeps the corners that go around a building", () => {
    const grid = buildGrid(bounds, [house]);
    const path = findPath(grid, { x: 2, z: 10 }, { x: 18, z: 10 })!;
    const route = smooth(grid, path);
    expect(route.length).toBeLessThan(path.length);
    expect(route.length).toBeGreaterThan(2);
    for (let i = 1; i < route.length; i++) expect(lineFree(grid, route[i - 1], route[i])).toBe(true);
  });
});
