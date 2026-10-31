import { describe, expect, it } from "vitest";
import { headsOnPicture, opensOnLanding, PICTURE_EYE, PLANE_Z, seenOnWall, windowFrustum, windowOnPicture, WINDOW_VIEW, type Eye } from "./landing";

const at = (hours: number, minutes = 0) => new Date(2026, 9, 31, hours, minutes);

describe("opensOnLanding", () => {
  const visitor = { known: true, loggedIn: false, visiting: false, linked: false };
  it("greets someone we know is logged out", () => expect(opensOnLanding(visitor)).toBe(true));
  it("waits until the API has said who you are", () => expect(opensOnLanding({ ...visitor, known: false })).toBe(false));
  it("never stops someone logged in", () => expect(opensOnLanding({ ...visitor, loggedIn: true })).toBe(false));
  it("lets a visitor who chose the demo through", () => expect(opensOnLanding({ ...visitor, visiting: true })).toBe(false));
  it("keeps a shared link to a place working", () => expect(opensOnLanding({ ...visitor, linked: true })).toBe(false));
});

describe("the room behind the wall", () => {
  const near = 0.1;
  const toWall = (f: ReturnType<typeof windowFrustum>, eye: Eye) => {
    const scale = (eye.z - PLANE_Z) / near;
    return { left: eye.x + f.left * scale, right: eye.x + f.right * scale, top: eye.y + f.top * scale, bottom: eye.y + f.bottom * scale };
  };

  it("keeps the window's rectangle still, wherever the eye goes", () => {
    for (const eye of [PICTURE_EYE, { x: 4, y: 2, z: 20 }, { x: -1, y: 5, z: 26 }]) {
      const seen = toWall(windowFrustum(eye, near), eye);
      expect(seen.left).toBeCloseTo(WINDOW_VIEW.left);
      expect(seen.right).toBeCloseTo(WINDOW_VIEW.right);
      expect(seen.top).toBeCloseTo(WINDOW_VIEW.top);
      expect(seen.bottom).toBeCloseTo(WINDOW_VIEW.bottom);
    }
  });

  it("doesn't move what's on the wall, and moves what's deeper against the eye", () => {
    const eye = { ...PICTURE_EYE, x: PICTURE_EYE.x + 3 };
    expect(seenOnWall({ x: 1, y: 2, z: PLANE_Z }, eye).x).toBeCloseTo(1);
    expect(seenOnWall({ x: 1, y: 2, z: -2 }, eye).x).toBeGreaterThan(seenOnWall({ x: 1, y: 2, z: -2 }, PICTURE_EYE).x);
  });

  it("puts each flatmate's bubble over their own head, in the window", () => {
    const at = windowOnPicture();
    const heads = headsOnPicture();
    expect(heads[0].left).toBeLessThan(heads[1].left);
    expect(heads[1].left).toBeLessThan(heads[2].left);
    for (const head of heads) {
      expect(head.left).toBeGreaterThan(at.left);
      expect(head.left).toBeLessThan(at.left + at.width);
      expect(head.top).toBeGreaterThan(at.top);
    }
  });

  it("places the window on the picture where the render drew it", () => {
    const at = windowOnPicture();
    expect(at.left).toBeCloseTo(263.3, 0);
    expect(at.top).toBeCloseTo(370.4, 0);
    expect(at.width).toBeCloseTo(652.8, 0);
  });
});
