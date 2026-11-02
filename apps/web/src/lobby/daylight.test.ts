import { describe, expect, it } from "vitest";
import { styleFor } from "./cityStyle";
import { daylight } from "./daylight";

describe("daylight", () => {
  it("is dusk, with a touch of the city's sky on the horizon only", () => {
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

describe("the workshop's street and Kigali", () => {
  it("dress the quest's street (the city \"Atelier\") as Dakar, without its sea or its greeting", () => {
    const atelier = styleFor("Atelier");
    const dakar = styleFor("Dakar");
    expect(atelier.palette).toEqual(dakar.palette);
    expect(atelier.ground).toBe(dakar.ground);
    expect(atelier.props).toContain("baobab");
    expect(atelier.props).toContain("wax-parasols");
    expect(atelier.props).not.toContain("pirogues");
    expect(atelier.coast).toBe(false);
    expect(atelier.greeting.language).toBe("English");
    // Dakar itself keeps its sea.
    expect(dakar.props).toContain("pirogues");
  });

  it("give Kigali its hills, and nobody else", () => {
    expect(styleFor("Kigali").hills).toBe(true);
    for (const c of ["Dakar", "Lomé", "Tunis", "Atelier", "Nowhere"]) expect(styleFor(c).hills ?? false).toBe(false);
  });
});
