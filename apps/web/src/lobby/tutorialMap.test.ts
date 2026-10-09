import { describe, expect, it } from "vitest";
import { frontOf, PLOT, ROAD } from "./neighbourhood";
import { type Box, buildGrid, findPath, grow, smooth } from "./path";
import { tutorialNeighbourhood, WORKSHOP_ID } from "./tutorialMap";

const SPEED = 6; // the lobby's walking speed, in units a second

describe("the tutorial's map", () => {
  it("is always the same", () => {
    expect(tutorialNeighbourhood()).toEqual(tutorialNeighbourhood());
    expect(tutorialNeighbourhood().city).toBe("Atelier");
  });

  it("has one house, the workshop, and nothing for rent", () => {
    const n = tutorialNeighbourhood();
    const houses = n.plots.filter((p) => p.lot.kind === "house");
    expect(houses).toHaveLength(1);
    expect(houses[0].lot).toEqual({ kind: "house", houseId: WORKSHOP_ID });
    expect(n.plots.every((p) => p.lot.kind === "house" || p.lot.kind === "trees")).toBe(true);
    // Keys in the generator's format, and no two alike.
    for (const p of n.plots) expect(p.key).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    expect(new Set(n.plots.map((p) => p.key)).size).toBe(n.plots.length);
  });

  it("starts you inside the town, on open ground", () => {
    const { spawn, bounds, blocks } = tutorialNeighbourhood();
    expect(spawn.x).toBeGreaterThan(bounds.minX);
    expect(spawn.x).toBeLessThan(bounds.maxX);
    expect(spawn.z).toBeGreaterThan(bounds.minZ);
    expect(spawn.z).toBeLessThan(bounds.maxZ);
    for (const b of blocks) expect(Math.abs(spawn.x - b.x) < b.width / 2 && Math.abs(spawn.z - b.z) < b.depth / 2).toBe(false);
  });

  it("puts every front door on a street", () => {
    const n = tutorialNeighbourhood();
    for (const p of n.plots) {
      const door = frontOf(p, PLOT / 2 + ROAD / 2);
      const onStreet = n.streets.some((s) => Math.abs(door.x - s.x) <= s.width / 2 && Math.abs(door.z - s.z) <= s.depth / 2);
      expect(onStreet).toBe(true);
    }
  });

  it("can walk you from the square to the workshop, in a few seconds", () => {
    const n = tutorialNeighbourhood();
    // Every plot as something you can't walk through: a plot-sized box, one unit in from each side.
    const solid = (p: { x: number; z: number }): Box => ({ minX: p.x - PLOT / 2 + 1, maxX: p.x + PLOT / 2 - 1, minZ: p.z - PLOT / 2 + 1, maxZ: p.z + PLOT / 2 - 1 });
    const grid = buildGrid(n.bounds, n.plots.map(solid));
    const workshop = n.plots.find((p) => p.lot.kind === "house")!;
    // Anywhere within reach of its walls will do, as in the lobby.
    const route = findPath(grid, n.spawn, grow(solid(workshop), 1.5));
    expect(route).not.toBeNull();
    const legs = smooth(grid, route!);
    let length = 0;
    for (let k = 1; k < legs.length; k++) length += Math.hypot(legs[k].x - legs[k - 1].x, legs[k].z - legs[k - 1].z);
    // Far enough that a dash and the camera's tour make sense, near enough not to bore.
    expect(length / SPEED).toBeGreaterThan(6);
    expect(length / SPEED).toBeLessThan(8);
  });
});
