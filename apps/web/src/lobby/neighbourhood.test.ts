import { describe, expect, it } from "vitest";
import { frontOf, generateNeighbourhood, PLOT, ROAD } from "./neighbourhood";

const dakar = [
  { id: "sacre-coeur", demo: false },
  { id: "almadies", demo: true },
];

describe("neighbourhoods", () => {
  it("are the same for everyone: same city, same map", () => {
    expect(generateNeighbourhood("Dakar", dakar)).toEqual(generateNeighbourhood("Dakar", dakar));
  });

  it("differ from city to city", () => {
    const a = generateNeighbourhood("Dakar", dakar);
    const b = generateNeighbourhood("Lomé", dakar);
    expect(JSON.stringify(a.plots.map((p) => p.lot))).not.toBe(JSON.stringify(b.plots.map((p) => p.lot)));
  });

  it("give every house a plot, real houses nearest the market", () => {
    const n = generateNeighbourhood("Dakar", [...dakar].reverse());
    const houses = n.plots.filter((p) => p.lot.kind === "house");
    expect(houses.map((p) => (p.lot as { houseId: string }).houseId).sort()).toEqual(["almadies", "sacre-coeur"]);
    const market = n.blocks.find((b) => b.kind === "market")!;
    const dist = (id: string) => {
      const p = houses.find((h) => (h.lot as { houseId: string }).houseId === id)!;
      return Math.hypot(p.x - market.x, p.z - market.z);
    };
    expect(dist("sacre-coeur")).toBeLessThanOrEqual(dist("almadies"));
  });

  it("grow with the number of houses, and always have room to spare", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `h${i}`, demo: false }));
    const big = generateNeighbourhood("Abidjan", many);
    expect(big.plots.filter((p) => p.lot.kind === "house")).toHaveLength(30);
    expect(big.plots.length).toBeGreaterThan(30);
    expect(big.bounds.maxX - big.bounds.minX).toBeGreaterThan(generateNeighbourhood("Abidjan", dakar).bounds.maxX * 2);
  });

  it("never overlap plots, and keep them off the streets", () => {
    const n = generateNeighbourhood("Kigali", dakar);
    const keys = new Set(n.plots.map((p) => `${p.x},${p.z}`));
    expect(keys.size).toBe(n.plots.length);
    for (const p of n.plots) {
      for (const s of n.streets) {
        const insideX = Math.abs(p.x - s.x) < s.width / 2 + PLOT / 2 - 0.01;
        const insideZ = Math.abs(p.z - s.z) < s.depth / 2 + PLOT / 2 - 0.01;
        // A plot may touch a street, never sit on it.
        expect(insideX && insideZ && (s.width === ROAD ? Math.abs(p.x - s.x) < ROAD / 2 : Math.abs(p.z - s.z) < ROAD / 2)).toBe(false);
      }
    }
  });

  it("put every front door on a street", () => {
    const n = generateNeighbourhood("Tunis", dakar);
    for (const p of n.plots) {
      const door = frontOf(p, PLOT / 2 + ROAD / 2);
      const onStreet = n.streets.some((s) => Math.abs(door.x - s.x) <= s.width / 2 && Math.abs(door.z - s.z) <= s.depth / 2);
      expect(onStreet).toBe(true);
    }
  });

  it("has a market, lamps at its crossings, and a spawn point inside the town", () => {
    const n = generateNeighbourhood("Cotonou", dakar);
    expect(n.blocks.filter((b) => b.kind === "market")).toHaveLength(1);
    expect(n.lamps.length).toBe(n.intersections.length);
    expect(new Set(n.lamps.map((l) => l.id)).size).toBe(n.lamps.length);
    const { spawn, bounds } = n;
    expect(spawn.x).toBeGreaterThan(bounds.minX);
    expect(spawn.x).toBeLessThan(bounds.maxX);
    expect(spawn.z).toBeGreaterThan(bounds.minZ);
    expect(spawn.z).toBeLessThan(bounds.maxZ);
  });
});
