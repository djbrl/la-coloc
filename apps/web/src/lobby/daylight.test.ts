import { describe, expect, it } from "vitest";
import { styleFor } from "./cityStyle";
import { daylightAt, lightingFor, localHour, sunTimes } from "./daylight";

// 10 October 2026, at a given UTC hour.
const at = (utcHour: number) => new Date(Date.UTC(2026, 9, 10, utcHour, 0));

describe("daylight", () => {
  it("reads the local hour in a city's time zone", () => {
    expect(localHour(at(12), "Africa/Dakar")).toBe(12);
    expect(localHour(at(12), "Africa/Kigali")).toBe(14);
    expect(localHour(at(12), "Africa/Lagos")).toBe(13);
  });

  it("puts sunrise and sunset where they are in October", () => {
    // Dakar is far west of its time zone's meridian: the sun rises around 7:20 and sets around 19:10.
    const dakar = sunTimes(at(12), 14.7, -17.45, 0);
    expect(dakar.sunrise).toBeGreaterThan(7);
    expect(dakar.sunrise).toBeLessThan(7.6);
    expect(dakar.sunset).toBeGreaterThan(18.9);
    expect(dakar.sunset).toBeLessThan(19.4);
    // Kigali, on the equator: about 6:00 to 18:05.
    const kigali = sunTimes(at(12), -1.95, 30.06, 2);
    expect(kigali.sunrise).toBeGreaterThan(5.7);
    expect(kigali.sunset).toBeLessThan(18.3);
  });

  it("is day at lunch, night at midnight, with lamps on only in the dark", () => {
    const dakar = styleFor("Dakar");
    const noon = daylightAt(at(13), dakar);
    expect(noon.phase).toBe("day");
    expect(noon.lampsOn).toBe(false);
    const midnight = daylightAt(at(0), dakar);
    expect(midnight.phase).toBe("night");
    expect(midnight.lampsOn).toBe(true);
    // Around sunset: dusk, lamps coming on.
    const dusk = daylightAt(at(19), dakar);
    expect(dusk.phase).toBe("dusk");
    expect(dusk.lampsOn).toBe(true);
  });

  it("can be pinned to an hour (the dev tool)", () => {
    expect(daylightAt(at(13), styleFor("Lomé"), 23).phase).toBe("night");
  });

  it("keeps the night readable: never pitch black", () => {
    const night = lightingFor(0);
    expect(night.hemi).toBeGreaterThan(1);
    expect(lightingFor(1).hemi).toBeGreaterThan(night.hemi);
  });
});

describe("city styles", () => {
  it("give every demo city a valid time zone and its own look", () => {
    const cities = ["Dakar", "Lomé", "Cotonou", "Abidjan", "Douala", "Kigali", "Tunis", "Marrakech"];
    for (const c of cities) {
      const s = styleFor(c);
      expect(() => new Intl.DateTimeFormat("en", { timeZone: s.tz })).not.toThrow();
      expect(s.greeting.text.length).toBeGreaterThan(0);
    }
    expect(styleFor("Dakar").palette.walls).not.toBe(styleFor("Marrakech").palette.walls);
    expect(styleFor("lome").city).toBe("lome");
    expect(styleFor("lome").tz).toBe("Africa/Lome");
    // West African streets mostly have no zebra crossings.
    expect(styleFor("Lomé").zebra).toBe(false);
    expect(styleFor("Nowhere").tz).toBeTruthy();
  });
});
