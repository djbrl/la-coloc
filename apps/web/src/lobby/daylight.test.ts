import { describe, expect, it } from "vitest";
import { styleFor } from "./cityStyle";
import { daylight } from "./daylight";

describe("daylight", () => {
  it("is full day, with a touch of the city's sky on the horizon only", () => {
    const plain = daylight();
    const dakar = daylight(0xf2d48a);
    expect(dakar.hemi).toBe(plain.hemi);
    expect(dakar.top).toBe(plain.top);
    expect(dakar.bottom).not.toBe(plain.bottom);
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
