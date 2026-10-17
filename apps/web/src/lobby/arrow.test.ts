import { describe, expect, it } from "vitest";
import { clearOf, type EdgeArrow, placeArrow } from "./arrow";

const fresh = (): EdgeArrow => ({ shown: false, x: 0, y: 0, angle: 0 });

describe("the arrow at the screen's edge", () => {
  it("hides while the target is on screen", () => {
    expect(placeArrow(0, 0, 800, 600, 40, fresh()).shown).toBe(false);
    expect(placeArrow(0.8, -0.8, 800, 600, 40, fresh()).shown).toBe(false);
  });

  it("points right, at the right edge, for a target off to the right", () => {
    const a = placeArrow(3, 0, 800, 600, 40, fresh());
    expect(a.shown).toBe(true);
    expect(a.x).toBeCloseTo(760);
    expect(a.y).toBeCloseTo(300);
    expect(a.angle).toBeCloseTo(0);
  });

  it("points up from the top edge for a target above (screen y goes down)", () => {
    const a = placeArrow(0, 4, 800, 600, 40, fresh());
    expect(a.y).toBeCloseTo(40);
    expect(a.x).toBeCloseTo(400);
    expect(a.angle).toBeCloseTo(-Math.PI / 2);
  });

  it("stays on the line towards the target, inside the margin, at a corner", () => {
    const a = placeArrow(-5, -5, 800, 600, 40, fresh());
    expect(a.shown).toBe(true);
    expect(a.x).toBeGreaterThanOrEqual(40 - 1e-9);
    expect(a.y).toBeLessThanOrEqual(560 + 1e-9);
    // Down and to the left.
    expect(a.angle).toBeGreaterThan(Math.PI / 2);
    expect(a.angle).toBeLessThan(Math.PI);
  });

  it("writes into the object it's given", () => {
    const out = fresh();
    expect(placeArrow(2, 0, 800, 600, 40, out)).toBe(out);
  });
});

describe("the arrow and the HUD", () => {
  const minimap = { left: 1080, top: 640, right: 1260, bottom: 790 };
  it("slides up along the edge out from under the minimap", () => {
    const a = clearOf({ shown: true, x: 1224, y: 714, angle: 0.5 }, [minimap], 1280, 800, 56);
    expect(a.x).toBe(1224);
    expect(a.y).toBe(640 - 28);
    expect(a.angle).toBe(0.5);
  });

  it("stays where it is when nothing covers it", () => {
    const a = clearOf({ shown: true, x: 1224, y: 300, angle: 0 }, [minimap], 1280, 800, 56);
    expect([a.x, a.y]).toEqual([1224, 300]);
  });
});
