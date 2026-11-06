import { describe, expect, it } from "vitest";
import { tagLayout, type TagWords } from "./tagLayer";

// Every letter 6 pixels wide, whatever its size.
const measure = (text: string) => text.length * 6;
const awa: TagWords = { kind: "person", text: "Awa", home: { text: "Ndaje", background: "#123456", color: "#fff" }, won: { text: "Podium", tone: "gold" } };

describe("where things go in a name tag", () => {
  it("fits a plain name, padded", () => {
    expect(tagLayout({ kind: "person", text: "Awa" }, false, measure).width).toBe(9 + 18 + 9);
  });

  it("puts the title after the name, and the house after the title", () => {
    const { textAt, won, home, width } = tagLayout(awa, false, measure);
    expect(textAt).toBe(9);
    expect(won!.at).toBe(9 + 18 + 6);
    expect(home!.at).toBeGreaterThan(won!.at + won!.w);
    expect(width).toBe(home!.at + home!.w + 9);
  });

  it("puts tourist after the house, and drops it when crowded", () => {
    const { home, tourist, width } = tagLayout({ ...awa, tourist: "Tourist" }, false, measure);
    expect(tourist!.at).toBeGreaterThan(home!.at + home!.w);
    expect(width).toBe(tourist!.at + tourist!.w + 9);
    expect(tagLayout({ ...awa, tourist: "Tourist" }, true, measure).tourist).toBeNull();
    expect(tagLayout({ kind: "person", text: "Awa", tourist: "Tourist" }, false, measure).tourist!.at).toBe(9 + 18 + 6);
  });

  it("drops the house and the title's words when crowded, keeping the trophy", () => {
    const { won, home, width } = tagLayout(awa, true, measure);
    expect(home).toBeNull();
    expect(won!.withWords).toBe(false);
    expect(width).toBeLessThan(tagLayout(awa, false, measure).width);
  });

  it("makes room for a house's square before its name", () => {
    const { swatchAt, textAt } = tagLayout({ kind: "house", text: "Ndaje", swatch: "#123456" }, false, measure);
    expect(swatchAt).toBe(10);
    expect(textAt).toBe(10 + 10 + 7);
  });
});

describe("a house's flag", () => {
  it("makes room for an Arena tag after the name while someone there takes part", () => {
    const plain = tagLayout({ kind: "house", text: "Ndaje", swatch: "#123456" }, false, measure);
    const { arena, textAt, width } = tagLayout({ kind: "house", text: "Ndaje", swatch: "#123456", arena: "Arena" }, false, measure);
    expect(plain.arena).toBeNull();
    expect(arena!.at).toBe(textAt + 30 + 6);
    expect(width).toBe(arena!.at + arena!.w + 10);
    expect(width).toBeGreaterThan(plain.width);
  });
});
