import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { arcPoint, flightTime } from "./courier";

describe("the review's envelope", () => {
  const from = new THREE.Vector3(0, 1, 0);
  const to = new THREE.Vector3(4, 1, 2);

  it("leaves from the start and lands on the end", () => {
    const out = new THREE.Vector3();
    expect(arcPoint(from, to, 0, 2, out).toArray()).toEqual([0, 1, 0]);
    expect(arcPoint(from, to, 1, 2, out).toArray()).toEqual([4, 1, 2]);
  });

  it("flies highest halfway, `lift` over the straight line", () => {
    const mid = arcPoint(from, to, 0.5, 2, new THREE.Vector3());
    expect(mid.x).toBeCloseTo(2);
    expect(mid.z).toBeCloseTo(1);
    expect(mid.y).toBeCloseTo(3);
    expect(arcPoint(from, to, 0.25, 2, new THREE.Vector3()).y).toBeLessThan(mid.y);
  });

  it("takes longer to go further, never more than 1.8 s", () => {
    expect(flightTime(1)).toBeLessThan(flightTime(5));
    expect(flightTime(100)).toBe(1.8);
  });
});
