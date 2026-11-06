import { describe, expect, it } from "vitest";
import { cityHandle, madeUpFlatmate } from "./handle";

describe("how someone in the city is named", () => {
  it("gives a real account its handle, with an @", () => {
    expect(cityHandle({ login: "fatou", name: "Fatou Sow" })).toBe("@fatou");
    expect(cityHandle({ login: "fatou", name: null, example: false })).toBe("@fatou");
  });

  it("gives a made-up person their name, never an @", () => {
    expect(cityHandle({ login: "awa", name: "Awa Diop", example: true })).toBe("Awa Diop");
    expect(cityHandle({ login: "kofi-dev", name: "  ", example: true })).toBe("kofi-dev");
    expect(cityHandle({ login: "kofi-dev", example: true })).toBe("kofi-dev");
  });

  it("knows a seeded flatmate from what the city lists", () => {
    expect(madeUpFlatmate({ demo: true }, { github: true })).toBe(true);
    expect(madeUpFlatmate({ demo: false }, { github: false })).toBe(true);
    expect(madeUpFlatmate({ demo: false }, { github: true })).toBe(false);
    // An older API says nothing: taken as real.
    expect(madeUpFlatmate({ demo: false }, {})).toBe(false);
  });
});
