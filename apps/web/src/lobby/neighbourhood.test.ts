import { describe, expect, it } from "vitest";
import { FACING_DIR, facingTowards, frontOf, generateNeighbourhood, PLOT, ROAD, turnFacing } from "./neighbourhood";
import { tutorialNeighbourhood } from "./tutorialMap";

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

  it("keep a house on the plot it rented, and leave the others where they were", () => {
    const before = generateNeighbourhood("Dakar", dakar);
    const was = (n: ReturnType<typeof generateNeighbourhood>, id: string) => n.plots.find((p) => p.lot.kind === "house" && p.lot.houseId === id)!;
    // Rent the plot farthest from the market: nobody would be put there by distance.
    const market = before.blocks.find((b) => b.kind === "market")!;
    const far = [...before.plots].sort((a, b) => Math.hypot(b.x - market.x, b.z - market.z) - Math.hypot(a.x - market.x, a.z - market.z))[0];
    expect(far.lot.kind).not.toBe("house");
    const after = generateNeighbourhood("Dakar", [...dakar, { id: "new", demo: false, plot: far.key }]);
    expect(was(after, "new").key).toBe(far.key);
    expect(was(after, "sacre-coeur").key).toBe(was(before, "sacre-coeur").key);
    expect(was(after, "almadies").key).toBe(was(before, "almadies").key);
    // Keys are stable across runs, and every plot has one.
    expect(after.plots.map((p) => p.key)).toEqual(before.plots.map((p) => p.key));
    expect(new Set(after.plots.map((p) => p.key)).size).toBe(after.plots.length);
  });

  it("fall back to a free plot when a stored plot doesn't exist or is taken", () => {
    const n = generateNeighbourhood("Dakar", [
      { id: "a", demo: false, plot: "0.0.0.0" },
      { id: "b", demo: false, plot: "0.0.0.0" },
      { id: "c", demo: false, plot: "99.99.99.99" },
    ]);
    const houses = n.plots.filter((p) => p.lot.kind === "house");
    expect(houses.map((p) => (p.lot as { houseId: string }).houseId).sort()).toEqual(["a", "b", "c"]);
    expect(houses.find((p) => p.key === "0.0.0.0")!.lot).toEqual({ kind: "house", houseId: "a" });
  });

  it("grow with the number of houses, and always have room to spare", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `h${i}`, demo: false }));
    const big = generateNeighbourhood("Abidjan", many);
    expect(big.plots.filter((p) => p.lot.kind === "house")).toHaveLength(30);
    expect(big.plots.length).toBeGreaterThan(30);
    expect(big.bounds.maxX - big.bounds.minX).toBeGreaterThan(generateNeighbourhood("Abidjan", dakar).bounds.maxX * 2);
  });

  it("can be small: a market square and one block of four plots, for the tutorial", () => {
    const n = generateNeighbourhood("Atelier", [{ id: "atelier", demo: false }], { small: true });
    expect(n.blocks).toHaveLength(2);
    expect(n.blocks.filter((b) => b.kind === "market")).toHaveLength(1);
    expect(n.plots).toHaveLength(4);
    expect(n.plots.filter((p) => p.lot.kind === "house")).toHaveLength(1);
    expect(n.bounds.maxX - n.bounds.minX).toBeLessThan(generateNeighbourhood("Atelier", [{ id: "atelier", demo: false }]).bounds.maxX * 2);
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

  it("spawn everybody in the market square, facing the city board, with its face in the camera's view", () => {
    for (const [city, houses] of [
      ["Dakar", [...dakar].reverse()],
      ["Lomé", []],
      ["Abidjan", Array.from({ length: 30 }, (_, i) => ({ id: `h${i}`, demo: i % 2 === 0 }))],
    ] as const) {
      const n = generateNeighbourhood(city, [...houses]);
      const market = n.blocks.find((b) => b.kind === "market")!;
      const board = n.board!;
      // On the square, in front of the board, with room between the two.
      expect(Math.abs(n.spawn.x - market.x)).toBeLessThan(market.width / 2);
      expect(Math.abs(n.spawn.z - market.z)).toBeLessThan(market.depth / 2);
      const front = FACING_DIR[board.facing];
      expect(front.x * (n.spawn.x - board.x) + front.z * (n.spawn.z - board.z)).toBeGreaterThan(5);
      // An avatar faces +z turned by ry: that way is the board.
      const look = { x: Math.sin(n.spawn.ry), z: Math.cos(n.spawn.ry) };
      const toBoard = { x: board.x - n.spawn.x, z: board.z - n.spawn.z };
      expect(look.x * toBoard.x + look.z * toBoard.z).toBeGreaterThan(0);
      // The camera sits on the +x +z diagonal turned by turn × 90°: it must be on the board's face side.
      const a = (n.spawn.turn * Math.PI) / 2;
      const camera = { x: Math.cos(a) + Math.sin(a), z: -Math.sin(a) + Math.cos(a) };
      expect(camera.x * front.x + camera.z * front.z).toBeGreaterThan(0);
    }
  });

  it("spawn you in the same place whoever lives in the city", () => {
    expect(generateNeighbourhood("Dakar", dakar).spawn).toEqual(generateNeighbourhood("Dakar", [{ id: "x", demo: false, plot: "0.0.0.0" }]).spawn);
  });

  it("turn the camera the least to see a front", () => {
    // From turn 0, fronts facing +z (0) and +x (1) are already in view.
    expect(turnFacing(0, 0)).toBe(0);
    expect(turnFacing(1, 0)).toBe(0);
    // A front facing -z (2) needs a quarter turn; -x (3) a quarter turn the other way.
    expect(turnFacing(2, 0)).toBe(1);
    expect(turnFacing(3, 0)).toBe(-1);
    // Turns aren't wrapped: from turn 5 (a full turn plus one), facing +z is one turn back.
    expect(turnFacing(0, 5)).toBe(4);
  });

  it("put the city board on the market square, its face towards the square", () => {
    const n = generateNeighbourhood("Dakar", dakar);
    const market = n.blocks.find((b) => b.kind === "market")!;
    expect(Math.abs(n.board!.x - market.x)).toBeLessThan(market.width / 2);
    expect(Math.abs(n.board!.z - market.z)).toBeLessThan(market.depth / 2);
    // On the north side, facing south: the square lies in front of it.
    expect(n.board!.z).toBeLessThan(market.z);
    expect(n.board!.facing).toBe(0);
  });

  it("put the Arena on the block the park had, its entrance towards the market, and move nothing else", () => {
    // Digests of each map, with the Arena's block read back as the park: every block, plot key, house, street and
    // lamp is where it was before the Arena (17 Oct 2026). Taken again on 6 Nov 2026 without the spawn and the board,
    // which moved to the market square's middle and north edge; everything else hasn't moved since.
    const before: Record<string, string> = {
      "Dakar:few": "8bc8ac39",
      "Dakar:many": "bcecea9e",
      "Lomé:few": "b4d497b2",
      "Lomé:many": "bfe7916d",
      "Cotonou:few": "4f96c736",
      "Cotonou:many": "61f83866",
      "Abidjan:few": "3e7ee55e",
      "Abidjan:many": "d4bea2c4",
      "Douala:few": "397b9c76",
      "Douala:many": "9748b7ab",
      "Kigali:few": "72591447",
      "Kigali:many": "a93ae04b",
      "Tunis:few": "a8a26247",
      "Tunis:many": "e945ad47",
      "Marrakech:few": "268e9586",
      "Marrakech:many": "e83ba6c7",
    };
    const digest = (s: string) => {
      let h = 0x811c9dc5;
      for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
      return h.toString(16);
    };
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `h${i}`, demo: i % 3 === 0, plot: i === 4 ? "0.1.1.0" : null }));
    const sets = {
      few: [
        { id: "a", demo: false },
        { id: "b", demo: true },
      ],
      many,
    };
    for (const [key, want] of Object.entries(before)) {
      const [city, set] = key.split(":") as [string, keyof typeof sets];
      const n = generateNeighbourhood(city, sets[set]);
      const arenas = n.blocks.filter((b) => b.kind === "arena");
      expect(arenas).toHaveLength(1);
      expect(n.blocks.some((b) => b.kind === "park")).toBe(false);
      const a = n.arena!;
      expect({ x: a.x, z: a.z, width: a.width, depth: a.depth }).toEqual({ x: arenas[0].x, z: arenas[0].z, width: arenas[0].width, depth: arenas[0].depth });
      // No plot on the Arena's block.
      expect(n.plots.some((p) => Math.abs(p.x - a.x) < a.width / 2 && Math.abs(p.z - a.z) < a.depth / 2)).toBe(false);
      // The entrance's side is the one nearer the market.
      const market = n.blocks.find((b) => b.kind === "market")!;
      const out = FACING_DIR[a.facing];
      expect(out.x * (market.x - a.x) + out.z * (market.z - a.z)).toBeGreaterThan(0);
      const blocks = n.blocks.map((b) => ({ ...b, kind: b.kind === "arena" ? "park" : b.kind }));
      expect(digest(JSON.stringify([blocks, n.plots, n.streets, n.skyline, n.lamps, n.trafficLights, n.bounds]))).toBe(want);
    }
  });

  it("face a block towards another along the axis they're furthest apart on", () => {
    expect(facingTowards({ x: 0, z: 0 }, { x: 10, z: 3 })).toBe(1);
    expect(facingTowards({ x: 0, z: 0 }, { x: -10, z: 3 })).toBe(3);
    expect(facingTowards({ x: 0, z: 0 }, { x: 2, z: 9 })).toBe(0);
    expect(facingTowards({ x: 0, z: 0 }, { x: 2, z: -9 })).toBe(2);
  });

  it("leave the Arena out of the tutorial and of a small map", () => {
    const t = tutorialNeighbourhood();
    expect(t.arena).toBeUndefined();
    expect(t.blocks.some((b) => b.kind === "park")).toBe(true);
    expect(t.blocks.some((b) => b.kind === "arena")).toBe(false);
    expect(generateNeighbourhood("Atelier", [], { small: true }).arena).toBeUndefined();
  });
});
