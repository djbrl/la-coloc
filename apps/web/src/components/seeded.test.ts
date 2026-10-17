import { afterEach, describe, expect, it } from "vitest";
import city from "../../../api/src/seed/city.ts?raw";
import tutorial from "../../../api/src/tutorial/tutorial.service.ts?raw";
import { language } from "../i18n";
import { SEEDED_FR, seeded } from "./seeded";

afterEach(() => {
  language.lang = "en";
});

describe("the made-up city's words", () => {
  it("say the seed's own sentences in French, and leave anyone's own words alone", () => {
    expect(seeded("Where newcomers take their first room.")).toBe("Where newcomers take their first room.");
    language.lang = "fr";
    expect(seeded("Where newcomers take their first room.")).toBe("Là où les nouveaux venus prennent leur première chambre.");
    expect(seeded("My first project: a small page that says hello.")).toBe("Mon premier projet : une petite page qui dit bonjour.");
    expect(seeded("My own bot, in English.")).toBe("My own bot, in English.");
    expect(seeded(null)).toBeNull();
  });

  // Reads the seed's source, so a new house or project can't land in English only.
  it("know every tagline, project line and ad the seed writes, and the tutorial's ready-made page", () => {
    const written = [...city.matchAll(/\b(?:tagline|description|ad): "([^"]+)"/g), ...tutorial.matchAll(/SAMPLE_PROJECT = \{[^}]*description: "([^"]+)"/g)].map((m) => m[1]);
    expect(written.length).toBeGreaterThan(40);
    expect(written.filter((text) => !Object.hasOwn(SEEDED_FR, text))).toEqual([]);
  });
});
