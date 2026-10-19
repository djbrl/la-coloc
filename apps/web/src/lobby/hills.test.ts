import { describe, expect, it } from "vitest";
import { HILLS, hillSpots, TERRACES } from "./hills";
import { seeded } from "./neighbourhood";

const town = { minX: -40, maxX: 40, minZ: -30, maxZ: 30 };

describe("Kigali's hills", () => {
  it("stand all round the town, beyond the skyline and the terraces", () => {
    const spots = hillSpots(town, seeded("hills:Kigali"));
    expect(spots.length).toBeGreaterThan(16);
    // Every side has some, a few to a cluster.
    for (const side of [0, 1, 2, 3]) expect(spots.some((s) => Math.floor(s.cluster / 100) === side)).toBe(true);
    for (const cluster of new Set(spots.map((s) => s.cluster))) expect(spots.filter((s) => s.cluster === cluster).length).toBeLessThanOrEqual(HILLS.perCluster);
    for (const s of spots) {
      const out = Math.max(town.minX - s.x, s.x - town.maxX, town.minZ - s.z, s.z - town.maxZ);
      // Past the top terrace's edge, and the skyline's buildings (at most about 19 units out).
      expect(out).toBeGreaterThanOrEqual(HILLS.from);
      expect(HILLS.from).toBeGreaterThan(TERRACES[TERRACES.length - 1].from);
    }
  });

  it("are the same for the same city", () => {
    expect(hillSpots(town, seeded("hills:Kigali"))).toEqual(hillSpots(town, seeded("hills:Kigali")));
  });

  it("step up gently, terrace after terrace", () => {
    for (let i = 1; i < TERRACES.length; i++) {
      expect(TERRACES[i].from).toBeGreaterThan(TERRACES[i - 1].from);
      expect(TERRACES[i].height - TERRACES[i - 1].height).toBeLessThanOrEqual(0.5);
    }
  });
});
