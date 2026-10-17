// The stadium's model, built without a browser: a stand-in canvas records what the big screen draws. Checks that every
// merged mesh came together (a part with different attributes would leave a mesh without geometry), and when the
// screen is drawn again.
import * as THREE from "three";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ArenaModel } from "./arena";
import { arenaPlan } from "./arenaPlan";
import { styleFor } from "./cityStyle";

const texts: string[] = [];
let draws = 0;

function fakeCanvas() {
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get: (target, key) => {
      if (key === "measureText") return (t: string) => ({ width: t.length * 10 });
      if (key === "fillText") return (t: string) => texts.push(t);
      if (key === "fillRect") return () => draws++;
      if (key in target) return target[key];
      return () => undefined;
    },
    set: (target, key, value) => {
      target[key] = value;
      return true;
    },
  });
  return { width: 0, height: 0, getContext: () => ctx };
}

beforeAll(() => {
  vi.stubGlobal("document", { createElement: () => fakeCanvas(), documentElement: {} });
  vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => "" }));
});
afterAll(() => vi.unstubAllGlobals());

const plan = arenaPlan({ x: 10, z: -4, width: 24, depth: 16, facing: 3 });

describe("the Arena's model", () => {
  it("comes together in a handful of meshes, all with geometry, on either quality", () => {
    for (const quality of ["high", "low"] as const) {
      const model = new ArenaModel(plan, styleFor("Dakar"), quality);
      const meshes: THREE.Mesh[] = [];
      model.group.traverse((o) => (o as THREE.Mesh).isMesh && meshes.push(o as THREE.Mesh));
      expect(meshes.length).toBeLessThan(16);
      for (const m of [...meshes, model.ground]) expect(m.geometry?.attributes.position.count).toBeGreaterThan(0);
      expect(model.stands).toHaveLength(8);
      expect(model.group.userData.arena).toBe(true);
      expect(model.ground.name).toBe("ground");
      // It stands taller than the houses (about 5 units): a landmark.
      const top = new THREE.Box3().setFromObject(model.group).max.y;
      expect(top).toBeGreaterThan(8);
      model.dispose();
    }
  });

  it("shows the week's challenge on its screen, and draws it again only when it changes or a minute has passed", () => {
    const model = new ArenaModel(plan, styleFor("Dakar"), "low");
    texts.length = 0;
    const display = { title: "Eagle eye hunt", kind: "bounty" as const, endsAt: new Date(Date.now() + 3 * 86_400_000 + 3_700_000).toISOString(), champion: "@awa", entrants: 12 };
    model.setDisplay(display);
    expect(texts.join(" ")).toContain("Eagle eye hunt");
    expect(texts.join(" ")).toContain("@awa");
    expect(texts.join(" ")).toContain("12");
    expect(texts.join(" ")).toMatch(/3d 1h/);
    const before = draws;
    model.setDisplay({ ...display });
    model.tick(Date.now() + 30_000);
    expect(draws).toBe(before);
    model.tick(Date.now() + 61_000);
    expect(draws).toBeGreaterThan(before);
    model.setDisplay({ ...display, entrants: 13 });
    expect(texts.slice(-5).join(" ")).toContain("👥 13");
    model.dispose();
  });
});
