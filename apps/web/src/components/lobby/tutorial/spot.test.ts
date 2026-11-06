import { describe, expect, it } from "vitest";
import { placeLine, ringAround, same } from "./spot";

const view = { width: 1440, height: 900 };
const line = { width: 300, height: 80 };

describe("the spotlight", () => {
  it("rings the control a little bigger than it, in whole pixels", () => {
    expect(ringAround({ left: 100.4, top: 50, width: 80, height: 40 })).toEqual({ left: 94, top: 44, width: 92, height: 52 });
  });

  it("puts its line under the control when it fits, centred on it", () => {
    expect(placeLine({ left: 800, top: 200, width: 100, height: 50 }, line, view)).toEqual({ left: 700, top: 262 });
  });

  it("goes above when there's no room under, then beside, and never off the screen", () => {
    expect(placeLine({ left: 800, top: 760, width: 100, height: 100 }, line, view)).toEqual({ left: 700, top: 668 });
    // A tall control: beside it, on its left.
    expect(placeLine({ left: 900, top: 40, width: 400, height: 820 }, line, view)).toEqual({ left: 588, top: 410 });
    // Near the right edge, under it: pulled back inside the margin.
    expect(placeLine({ left: 1380, top: 100, width: 50, height: 40 }, line, view).left).toBe(1440 - 16 - 300);
  });

  it("goes above first when asked, so a tab's content stays in view, and under it when there's no room above", () => {
    expect(placeLine({ left: 800, top: 200, width: 100, height: 50 }, line, view, "above")).toEqual({ left: 700, top: 108 });
    expect(placeLine({ left: 800, top: 40, width: 100, height: 50 }, line, view, "above")).toEqual({ left: 700, top: 102 });
  });

  it("falls back to the bottom of the screen when nothing else fits", () => {
    const small = { width: 320, height: 300 };
    expect(placeLine({ left: 0, top: 0, width: 320, height: 300 }, { width: 200, height: 60 }, small)).toEqual({ left: 60, top: 224 });
  });

  it("tells when nothing moved, so it doesn't redraw", () => {
    expect(same({ left: 1, top: 2 }, { left: 1, top: 2 })).toBe(true);
    expect(same({ left: 1, top: 2 }, { left: 1, top: 3 })).toBe(false);
    expect(same(null, null)).toBe(true);
    expect(same({ left: 1, top: 2 }, null)).toBe(false);
  });
});
