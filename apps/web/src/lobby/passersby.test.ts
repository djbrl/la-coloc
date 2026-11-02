import { describe, expect, it } from "vitest";
import { generateNeighbourhood, ROAD, seeded } from "./neighbourhood";
import { allPassersBy, isMadeUpHandle, keepApart, laneFor, MOST, passerbyCount, passersBy, sidewalks, standAt, type Stroll, VISITORS, visitorsIn, walkAhead } from "./passersby";

describe("passers-by", () => {
  it("carry made-up handles no GitHub account can have (an underscore in each)", () => {
    expect(isMadeUpHandle("awa_ndiaye")).toBe(true);
    expect(isMadeUpHandle("mdiop_221")).toBe(true);
    // What GitHub allows (a real account could have it), or not handle-like at all.
    expect(isMadeUpHandle("awa-ndiaye")).toBe(false);
    expect(isMadeUpHandle("mdiop221")).toBe(false);
    expect(isMadeUpHandle("_awa")).toBe(false);
    expect(isMadeUpHandle("awa__n")).toBe(false);
    expect(isMadeUpHandle("Awa_N")).toBe(false);
    for (const p of allPassersBy()) expect(isMadeUpHandle(p.login), p.login).toBe(true);
  });

  it("never share a handle, and have a full name", () => {
    const all = allPassersBy();
    expect(new Set(all.map((p) => p.login)).size).toBe(all.length);
    for (const p of all) expect(p.name.split(" ").length, p.name).toBeGreaterThan(1);
  });

  it("are the same people, in the same order, every time a city is built", () => {
    expect(passersBy("Dakar", 5)).toEqual(passersBy("Dakar", 5));
    expect(passersBy("Dakar", 5)).not.toEqual(passersBy("Tunis", 5));
    expect(passersBy("Lomé", 99)).toHaveLength(MOST);
    // A city without its own list still gets people.
    expect(passersBy("Accra", 3)).toHaveLength(3);
  });

  it("are fewer on low quality and on a small screen", () => {
    expect(passerbyCount("low", true)).toBeLessThan(passerbyCount("low", false));
    expect(passerbyCount("low", false)).toBeLessThan(passerbyCount("high", true));
    expect(passerbyCount("high", true)).toBeLessThanOrEqual(passerbyCount("high", false));
  });

  describe("walking", () => {
    const n = generateNeighbourhood("Dakar", []);
    const rings = sidewalks(n.blocks);
    // On the sidewalk: within 0.8 of a block's edge, outside it (or just inside, cutting a corner).
    const onSidewalk = (p: { x: number; z: number }) =>
      n.blocks.some((b) => {
        const dx = Math.abs(p.x - b.x) - b.width / 2;
        const dz = Math.abs(p.z - b.z) - b.depth / 2;
        return Math.max(dx, dz) <= 0.8 && Math.max(dx, dz) >= -0.01;
      });

    it("stay on the sidewalks, and cross only at the zebras, straight over one street", () => {
      const rand = seeded("test");
      let s: Stroll = { block: 0, at: 0, dir: 1, lane: laneFor(1, rand) };
      let crossings = 0;
      for (let k = 0; k < 2000; k++) {
        const from = standAt(rings[s.block][s.at], s.lane);
        const next = walkAhead(rings, s, rand);
        const to = standAt(rings[next.block][next.at], next.lane);
        expect(onSidewalk(to)).toBe(true);
        if (next.block !== s.block) {
          crossings++;
          expect(s.at % 4 === 1 || s.at % 4 === 2).toBe(true);
          expect(Math.hypot(to.x - from.x, to.z - from.z)).toBeLessThan(ROAD);
        }
        s = next;
      }
      expect(crossings).toBeGreaterThan(20);
    });

    it("link every inner zebra to one across the street", () => {
      const links = rings.flat().filter((p) => p.across);
      expect(links.length).toBeGreaterThan(0);
      for (const p of links) {
        const q = rings[p.across!.block][p.across!.at];
        expect(q.across).toBeDefined();
        expect(Math.hypot(q.x - p.x, q.z - p.z)).toBeCloseTo(ROAD);
      }
    });

    it("keep to one side by direction, so people walking towards each other pass", () => {
      const rand = seeded("lanes");
      for (let k = 0; k < 50; k++) expect(laneFor(1, rand)).toBeLessThan(laneFor(-1, rand));
    });

    it("step apart when they overlap, even head-on", () => {
      const a = { x: 0, z: 0 };
      const b = { x: 0.3, z: 0 };
      keepApart([a, b], 0.8);
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.3);
      expect(a.z).not.toBe(0);
      const far = { x: 5, z: 5 };
      keepApart([a, far], 0.8);
      expect(far).toEqual({ x: 5, z: 5 });
    });
  });
});

describe("visitors", () => {
  it("come from other cities, the same ones every time, and don't double up with the locals", () => {
    const visitors = visitorsIn("Dakar", VISITORS);
    expect(visitors).toHaveLength(VISITORS);
    expect(visitors).toEqual(visitorsIn("Dakar", VISITORS));
    for (const v of visitors) expect(v.from).not.toBe("dakar");
    const locals = passersBy("Dakar", MOST - VISITORS).map((p) => p.login);
    for (const v of visitors) expect(locals).not.toContain(v.login);
  });
});
