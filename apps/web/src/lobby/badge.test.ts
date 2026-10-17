import { describe, expect, it } from "vitest";
import { type Badge, badgeChip } from "./badge";

const lynx: Badge = { key: "eagle-eye", title: { en: "Eagle eye", fr: "Œil de lynx" }, place: 1, city: "Dakar", week: "2026-10-05" };

describe("a title on a name tag", () => {
  it("is in the chosen language", () => {
    expect(badgeChip(lynx, "en").text).toBe("Eagle eye");
    expect(badgeChip(lynx, "fr").text).toBe("Œil de lynx");
  });

  it("is gold, silver or bronze by place", () => {
    expect(badgeChip(lynx, "en").tone).toBe("gold");
    expect(badgeChip({ ...lynx, place: 2 }, "en").tone).toBe("silver");
    expect(badgeChip({ ...lynx, place: 3 }, "en").tone).toBe("bronze");
  });

  it("is cut short when it's long, and kept whole for its hidden name", () => {
    const podium = { ...lynx, key: "podium", place: 2 as const, title: { en: "Podium · Eagle eye", fr: "Podium · Chasse aux bugs" } };
    const chip = badgeChip(podium, "fr");
    expect(chip.text.length).toBeLessThanOrEqual(18);
    expect(chip.text.endsWith("…")).toBe(true);
    expect(chip.full).toBe("Podium · Chasse aux bugs");
  });

  it("falls back to the other language when one is missing", () => {
    expect(badgeChip({ ...lynx, title: { en: "Eagle eye", fr: "" } }, "fr").text).toBe("Eagle eye");
  });
});
