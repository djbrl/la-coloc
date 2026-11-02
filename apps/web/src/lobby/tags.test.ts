import { describe, expect, it } from "vitest";
import { declutter, isTourist, type TagSpot } from "./tags";

const spot = (name: string, x: number, y: number, d: number, keep = false): TagSpot & { name: string } => ({ name, x, y, w: 80, d, keep, shown: false, crowded: false, tag: null });
const names = (spots: (TagSpot & { name?: string })[], pick: (s: TagSpot) => boolean) => spots.filter(pick).map((s) => (s as { name: string }).name).sort();

describe("name tags in a pile-up", () => {
  it("leaves tags that don't overlap alone", () => {
    const spots = [spot("awa", 100, 100, 3), spot("moussa", 300, 100, 2), spot("jib", 100, 300, 1)];
    declutter(spots, 3, Infinity);
    expect(names(spots, (s) => s.crowded)).toEqual([]);
    expect(names(spots, (s) => s.shown)).toEqual(["awa", "jib", "moussa"]);
  });

  it("keeps the nearest of a pile clear and fades the others", () => {
    const spots = [spot("far", 110, 100, 5), spot("near", 100, 104, 1), spot("mid", 95, 96, 3), spot("apart", 400, 100, 4)];
    declutter(spots, 4, Infinity);
    expect(names(spots, (s) => s.crowded)).toEqual(["far", "mid"]);
    expect(names(spots, (s) => !s.crowded)).toEqual(["apart", "near"]);
  });

  it("never fades yours: it counts as the nearest", () => {
    const spots = [spot("near", 100, 104, 1), spot("you", 105, 98, -1, true)];
    declutter(spots, 2, Infinity);
    expect(names(spots, (s) => s.crowded)).toEqual(["near"]);
  });

  it("doesn't blink: a faded tag stays faded until there's clear space around it", () => {
    const near = spot("near", 100, 100, 1);
    const far = spot("far", 170, 100, 5);
    declutter([near, far], 2, Infinity);
    expect(far.crowded).toBe(true);
    far.x = 185;
    declutter([near, far], 2, Infinity);
    expect(far.crowded).toBe(true);
    far.x = 200;
    declutter([near, far], 2, Infinity);
    expect(far.crowded).toBe(false);
  });

  it("doesn't swap who's faded when two people are about as far away", () => {
    const a = spot("a", 100, 100, 3);
    const b = spot("b", 110, 100, 3.2);
    declutter([a, b], 2, Infinity);
    expect(b.crowded).toBe(true);
    a.d = 3.4;
    declutter([a, b], 2, Infinity);
    expect([a.crowded, b.crowded]).toEqual([false, true]);
    a.d = 6;
    declutter([a, b], 2, Infinity);
    expect([a.crowded, b.crowded]).toEqual([true, false]);
  });

  it("shows only yours and the nearest person's on a narrow screen", () => {
    const spots = [spot("far", 300, 300, 9), spot("you", 0, 0, -1, true), spot("near", 200, 0, 2), spot("mid", 400, 0, 4)];
    declutter(spots, 4, 1);
    expect(names(spots, (s) => s.shown)).toEqual(["near", "you"]);
  });

  it("only touches the spots in use, sorting them in place", () => {
    const spare = spot("spare", 0, 0, 0);
    const spots = [spot("b", 0, 0, 2), spot("a", 500, 0, 1), spare];
    declutter(spots, 2, Infinity);
    expect(spots.map((s) => (s as { name: string }).name)).toEqual(["a", "b", "spare"]);
    expect(spare.shown).toBe(false);
  });
});

describe("who's a tourist", () => {
  it("is someone with no house here", () => {
    expect(isTourist("Dakar", ["Lomé"], "Dakar")).toBe(true);
    expect(isTourist("Lomé", ["Lomé"], "Dakar")).toBe(false);
    expect(isTourist("Kigali", ["Lomé", "Kigali"], null)).toBe(false);
  });
  it("is, with no house anywhere, someone away from the city they belong to", () => {
    expect(isTourist("Tunis", [], "Dakar")).toBe(true);
    expect(isTourist("Dakar", [], "Dakar")).toBe(false);
  });
  it("is nobody when we can't tell", () => {
    expect(isTourist("Dakar", [], null)).toBe(false);
    expect(isTourist("Dakar", [], undefined)).toBe(false);
    expect(isTourist("", ["Lomé"], "Dakar")).toBe(false);
  });
});
