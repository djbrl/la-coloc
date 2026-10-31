import { describe, expect, it } from "vitest";
import { declutter, type TagSpot } from "./tags";

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
