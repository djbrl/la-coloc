import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { HouseFace } from "./windows";

// The glass of room i is instance i * 3 + 1 (see windows.ts): its colour, read back.
function glass(face: HouseFace, i: number): THREE.Color {
  const windows = face.group.children[0] as THREE.InstancedMesh;
  const c = new THREE.Color();
  windows.getColorAt(i * 3 + 1, c);
  return c;
}

describe("a house's windows", () => {
  const live = { windows: ["lit", "lit", "lit"] as const, building: false, powerCut: false, knocking: 0, openChores: 0, lateChores: 0 };

  it("flash red for a crashed room only: its neighbours stay lit", () => {
    const face = new HouseFace(3);
    face.update({ ...live, windows: [...live.windows] });
    const before = glass(face, 0).getHex();
    face.tick(10, false);
    face.flash(1, true);
    face.tick(10.5, true);
    const red = glass(face, 1);
    expect(red.r).toBeGreaterThan(red.g * 3);
    expect(glass(face, 0).getHex()).toBe(before);
    expect(glass(face, 2).getHex()).toBe(before);
  });

  it("go back to what they showed once the flash is over", () => {
    const face = new HouseFace(2);
    face.update({ ...live, windows: ["lit", "lit"] });
    const lit = glass(face, 1).getHex();
    face.tick(1, false);
    face.flash(1, false);
    face.tick(1.2, false);
    expect(glass(face, 1).getHex()).not.toBe(lit);
    face.tick(5, false);
    expect(glass(face, 1).getHex()).toBe(lit);
  });

  it("ignore a room that isn't there", () => {
    const face = new HouseFace(2);
    expect(() => face.flash(5, false)).not.toThrow();
    expect(() => face.flash(-1, false)).not.toThrow();
  });
});
