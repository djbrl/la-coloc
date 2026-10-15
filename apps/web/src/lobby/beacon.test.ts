import { describe, expect, it } from "vitest";
import { beaconPulse } from "./beacon";

describe("the quest beacon's pulse", () => {
  it("stands still with calm motion: the same glow at every moment, no wave, no bobbing", () => {
    for (const time of [0, 0.4, 1.3, 57.9]) {
      expect(beaconPulse(time, true)).toEqual(beaconPulse(0, true));
      expect(beaconPulse(time, true).wave).toBe(0);
      expect(beaconPulse(time, true).bob).toBe(0);
    }
  });

  it("breathes otherwise: the glow and the wave change over a beat, and stay within bounds", () => {
    const moments = Array.from({ length: 50 }, (_, i) => i * 0.07);
    const glows = moments.map((t) => beaconPulse(t, false).glow);
    expect(Math.max(...glows) - Math.min(...glows)).toBeGreaterThan(0.2);
    for (const t of moments) {
      const p = beaconPulse(t, false);
      expect(p.glow).toBeGreaterThan(0);
      expect(p.glow).toBeLessThanOrEqual(1);
      expect(p.wave).toBeGreaterThanOrEqual(0);
      expect(p.wave).toBeLessThanOrEqual(1);
      expect(p.waveScale).toBeGreaterThanOrEqual(1);
    }
  });

  it("sends the wave out from the ring and fades it as it grows", () => {
    const early = beaconPulse(0.1, false);
    const late = beaconPulse(1.4, false);
    expect(late.waveScale).toBeGreaterThan(early.waveScale);
    expect(late.wave).toBeLessThan(early.wave);
  });
});
