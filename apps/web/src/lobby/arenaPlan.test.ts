import { describe, expect, it } from "vitest";
import { arenaPlan, gapHalf, inStands, insideBowl, timeLeft } from "./arenaPlan";
import { type Facing, FACING_DIR, generateNeighbourhood } from "./neighbourhood";
import { buildGrid, distanceToBox, findPath, grow, isFree, RADIUS } from "./path";

const SITES = ([0, 1, 2, 3] as Facing[]).flatMap((facing) => [
  { x: 10, z: -4, width: 16, depth: 16, facing },
  { x: -6, z: 8, width: 24, depth: 16, facing },
]);
// The walk grid as the lobby builds it: half-unit cells, padded by a person's width and half a cell.
const gridFor = (plan: ReturnType<typeof arenaPlan>) =>
  buildGrid({ minX: plan.centre.x - 20, maxX: plan.centre.x + 20, minZ: plan.centre.z - 20, maxZ: plan.centre.z + 20 }, plan.colliders, 0.5, RADIUS + 0.25);

describe("the Arena's layout", () => {
  it("lets you walk in through the entrance, and onto the pitch all round the stage", () => {
    for (const site of SITES) {
      const plan = arenaPlan(site);
      const grid = gridFor(plan);
      expect(isFree(grid, plan.gate.door.x, plan.gate.door.z)).toBe(true);
      expect(isFree(grid, plan.gate.inside.x, plan.gate.inside.z)).toBe(true);
      for (const s of plan.spots) {
        expect(isFree(grid, s.x, s.z)).toBe(true);
        expect(findPath(grid, plan.gate.door, s)).not.toBeNull();
      }
    }
  });

  it("walls the stands: from behind the bowl, the only way in is round to the entrance", () => {
    for (const site of SITES) {
      const plan = arenaPlan(site);
      const grid = gridFor(plan);
      const d = FACING_DIR[site.facing];
      // The street behind the Arena, on the far side from its entrance.
      const along = d.x !== 0 ? site.width / 2 + 2 : site.depth / 2 + 2;
      const back = { x: plan.centre.x - d.x * along, z: plan.centre.z - d.z * along };
      const path = findPath(grid, back, plan.spots[6])!;
      expect(path).not.toBeNull();
      expect(path.some((p) => distanceToBox(p, plan.gate.box) < 0.5)).toBe(true);
      // Nothing walks across the stands.
      for (const p of path) expect(inStands(plan, p.x, p.z)).toBe(false);
    }
  });

  it("puts the entrance on the facing side, at the edge of the block, with the door in the street", () => {
    for (const site of SITES) {
      const plan = arenaPlan(site);
      const d = FACING_DIR[site.facing];
      const half = d.x !== 0 ? site.width / 2 : site.depth / 2;
      const doorAlong = (plan.gate.door.x - site.x) * d.x + (plan.gate.door.z - site.z) * d.z;
      expect(doorAlong).toBeGreaterThan(half - 0.1);
      expect(doorAlong).toBeLessThan(half + 1);
      // The door is within reach of the passage (REACH is 1.6 in the lobby).
      expect(distanceToBox(plan.gate.door, plan.gate.box)).toBeLessThan(1.6);
      expect(insideBowl(plan, plan.gate.door.x, plan.gate.door.z)).toBe(false);
      expect(insideBowl(plan, plan.gate.inside.x, plan.gate.inside.z)).toBe(true);
    }
  });

  it("seats people in the stands, never in the passage, facing the stage", () => {
    for (const site of SITES) {
      const plan = arenaPlan(site);
      expect(plan.seats.length).toBeGreaterThan(40);
      for (const s of plan.seats) {
        expect(inStands(plan, s.x, s.z)).toBe(true);
        expect(distanceToBox(s, grow(plan.gate.box, 0.3))).toBeGreaterThan(0);
        const look = { x: Math.sin(s.ry), z: Math.cos(s.ry) };
        expect(look.x * (plan.centre.x - s.x) + look.z * (plan.centre.z - s.z)).toBeGreaterThan(0);
      }
    }
  });

  it("stands its floodlights on the block's corners, outside the bowl", () => {
    for (const site of SITES) {
      const plan = arenaPlan(site);
      expect(plan.masts).toHaveLength(4);
      for (const m of plan.masts) {
        expect(insideBowl(plan, m.x, m.z)).toBe(false);
        expect(Math.abs(m.x - site.x)).toBeLessThan(site.width / 2);
        expect(Math.abs(m.z - site.z)).toBeLessThan(site.depth / 2);
      }
    }
  });

  it("cuts a wider gap in the inner ring than in the outer one, so the passage's sides are straight", () => {
    const plan = arenaPlan(SITES[0]);
    expect(gapHalf(plan.inner, 0)).toBeGreaterThan(gapHalf(plan.outer, 0));
  });

  it("fits every generated city's Arena", () => {
    for (const city of ["Dakar", "Lomé", "Cotonou", "Abidjan", "Douala", "Kigali", "Tunis", "Marrakech"]) {
      const n = generateNeighbourhood(city, []);
      const plan = arenaPlan(n.arena!);
      expect(plan.inner.rx).toBeGreaterThan(plan.stage.half * 2);
      expect(plan.colliders.length).toBeLessThan(160);
    }
  });
});

describe("the time left on the big screen", () => {
  const now = Date.parse("2026-10-17T10:00:00Z");
  it("counts whole days, hours and minutes, rounded down", () => {
    expect(timeLeft("2026-10-19T13:30:59Z", now)).toEqual({ days: 2, hours: 3, minutes: 30, over: false });
    expect(timeLeft("2026-10-17T10:00:30Z", now)).toEqual({ days: 0, hours: 0, minutes: 0, over: false });
  });
  it("says when it's over, or the date can't be read", () => {
    expect(timeLeft("2026-10-17T09:00:00Z", now).over).toBe(true);
    expect(timeLeft("whenever", now).over).toBe(true);
  });
});
