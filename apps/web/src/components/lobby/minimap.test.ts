// The minimap's logic without a canvas: its colours come from the city's own grounds, the world fits on the map and
// back, your arrow points the way you face, a hover finds the nearest house, and a click never moves you to the ground.
import { describe, expect, it } from "vitest";
import { styleFor } from "../../lobby/cityStyle";
import { clickOnMap, heading, houseOutline, mapColours, mapFrame, nearest, shade } from "./minimap";

describe("the minimap's colours", () => {
  it("are the city's day grounds: Dakar's sand, Lomé's red earth, Douala's grass", () => {
    expect(mapColours(styleFor("Dakar")).horizon).toBe("#e3cc9c");
    expect(mapColours(styleFor("Lomé")).horizon).toBe("#b45a32");
    expect(mapColours(styleFor("Douala")).horizon).toBe("#7aa063");
  });

  it("paint the shops in the city's wall colour, and the towers a shade darker", () => {
    const dakar = mapColours(styleFor("Dakar"));
    expect(dakar.shop).toBe(styleFor("Dakar").palette.walls);
    expect(dakar.tower).not.toBe(dakar.shop);
  });

  it("lighten towards white and darken towards black", () => {
    expect(shade("#808080", 1)).toBe("#ffffff");
    expect(shade("#808080", -1)).toBe("#000000");
    expect(shade("#808080", 0)).toBe("#808080");
    expect(shade("not a colour", 0.5)).toBe("not a colour");
  });
});

describe("the minimap's frame", () => {
  const bounds = { minX: -50, maxX: 50, minZ: -20, maxZ: 20 };

  it("fits the town inside the margin, north up, centred", () => {
    const f = mapFrame(bounds, 220, 100, 10);
    expect(f.toX(-50)).toBeCloseTo(10);
    expect(f.toX(50)).toBeCloseTo(210);
    // North (-z) is at the top; the town is centred top to bottom.
    expect(f.toY(-20)).toBeLessThan(f.toY(20));
    expect((f.toY(-20) + f.toY(20)) / 2).toBeCloseTo(50);
  });

  it("brings a click back to the same place in the world", () => {
    const f = mapFrame(bounds, 170, 130, 4);
    expect(f.fromX(f.toX(12.5))).toBeCloseTo(12.5);
    expect(f.fromY(f.toY(-7))).toBeCloseTo(-7);
  });
});

describe("your arrow", () => {
  it("points down the map when you face +z (south), and right when you face +x (east)", () => {
    const south = heading(0);
    expect(south.dx).toBeCloseTo(0);
    expect(south.dy).toBeCloseTo(1);
    const east = heading(Math.PI / 2);
    expect(east.dx).toBeCloseTo(1);
    expect(east.dy).toBeCloseTo(0);
  });
});

describe("a house on the map", () => {
  it("has its roof's point at the top, and stays inside its size", () => {
    const points = houseOutline(50, 50, 10);
    const top = Math.min(...points.map((p) => p.y));
    expect(points.find((p) => p.y === top)?.x).toBe(50);
    for (const p of points) {
      expect(Math.abs(p.x - 50)).toBeLessThanOrEqual(5);
      expect(Math.abs(p.y - 50)).toBeLessThanOrEqual(5);
    }
  });

  it("is found under the mouse when it's close enough, and only then", () => {
    const houses = [
      { name: "Sacré-Cœur", x: 10, y: 10 },
      { name: "Bè Kpota", x: 40, y: 10 },
    ];
    expect(nearest(houses, 38, 12, 8)?.name).toBe("Bè Kpota");
    expect(nearest(houses, 25, 30, 8)).toBeNull();
  });
});

describe("a click on the map", () => {
  it("on the small map opens the big one, wherever it lands: it never travels", () => {
    expect(clickOnMap(false, null)).toEqual({ kind: "open" });
    expect(clickOnMap(false, { id: "almadies" })).toEqual({ kind: "open" });
  });

  it("on the big map goes to the door of the house under it, and does nothing on empty ground", () => {
    expect(clickOnMap(true, { id: "almadies" })).toEqual({ kind: "go", houseId: "almadies" });
    expect(clickOnMap(true, null)).toBeNull();
  });
});
