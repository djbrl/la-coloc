import { describe, expect, it } from "vitest";
import type { CityHappening, Message } from "../../types";
import { chatter, cityHappenings, newSince, onceEach } from "./cityLife";

const review = (id: string): CityHappening => ({ id, at: "2026-10-19T10:00:00Z", kind: "review", from: "awa", to: "jib" });
const crash = (id: string): CityHappening => ({ id, at: "2026-10-19T10:00:00Z", kind: "crash", room: "ndaje" });
const message = (id: string, login: string | null, body = "Salut !"): Message => ({
  id,
  author: login ? { login, name: null, avatarUrl: null } : null,
  body,
  at: "2026-10-19T10:00:00Z",
});
const everywhere = () => true;

describe("what's new since the last word", () => {
  it("remembers the first list without calling any of it new", () => {
    const seen = newSince<{ id: string }>();
    expect(seen.next([{ id: "a" }, { id: "b" }])).toEqual([]);
    expect(seen.next([{ id: "c" }, { id: "a" }, { id: "b" }])).toEqual([{ id: "c" }]);
    expect(seen.next([{ id: "c" }])).toEqual([]);
  });

  it("starts over after a reset, as on arrival", () => {
    const seen = newSince<{ id: string }>();
    seen.next([{ id: "a" }]);
    seen.reset();
    expect(seen.next([{ id: "b" }])).toEqual([]);
  });
});

describe("the city's happenings", () => {
  it("never replays what was there when the page loaded", () => {
    const next = cityHappenings();
    expect(next([{ id: "sacre-coeur", recent: [review("r1"), crash("c1")] }], everywhere)).toEqual([]);
    expect(next([{ id: "sacre-coeur", recent: [review("r1"), crash("c1")] }], everywhere)).toEqual([]);
  });

  it("plays the new ones, oldest first, at their house", () => {
    const next = cityHappenings();
    next([{ id: "sacre-coeur", recent: [review("r1")] }], everywhere);
    // The API sends them newest first.
    const played = next([{ id: "sacre-coeur", recent: [crash("c2"), review("r2"), review("r1")] }], everywhere);
    expect(played.map((p) => [p.houseId, p.happening.id])).toEqual([
      ["sacre-coeur", "r2"],
      ["sacre-coeur", "c2"],
    ]);
  });

  it("keeps quiet about houses that aren't on screen, and doesn't replay them later", () => {
    const next = cityHappenings();
    const here = (id: string) => id === "sacre-coeur";
    next([{ id: "sacre-coeur", recent: [] }, { id: "kigali-hills", recent: [] }], here);
    expect(next([{ id: "sacre-coeur", recent: [] }, { id: "kigali-hills", recent: [review("k1")] }], here)).toEqual([]);
    // You travelled to Kigali: k1 was already seen.
    expect(next([{ id: "kigali-hills", recent: [review("k1")] }], everywhere)).toEqual([]);
  });

  it("tells two houses' happenings apart even when their ids match", () => {
    const next = cityHappenings();
    next([{ id: "a", recent: [review("1")] }, { id: "b", recent: [] }], everywhere);
    expect(next([{ id: "a", recent: [review("1")] }, { id: "b", recent: [review("1")] }], everywhere).map((p) => p.houseId)).toEqual(["b"]);
  });

  it("plays only the latest few of a burst", () => {
    const next = cityHappenings();
    next([{ id: "a", recent: [] }], everywhere);
    const burst = ["5", "4", "3", "2", "1"].map(review);
    expect(next([{ id: "a", recent: burst }], everywhere).map((p) => p.happening.id)).toEqual(["3", "4", "5"]);
  });

  it("works with an API that sends no happenings", () => {
    const next = cityHappenings();
    expect(next([{ id: "a" }], everywhere)).toEqual([]);
    expect(next([{ id: "a" }], everywhere)).toEqual([]);
  });
});

describe("speech bubbles from a conversation", () => {
  it("says only what arrives after the first load, by its author", () => {
    const talk = chatter();
    expect(talk.next([message("m1", "awa")])).toEqual([]);
    expect(talk.next([message("m1", "awa"), message("m2", "jib", "On se voit au marché ?")])).toEqual([{ login: "jib", text: "On se voit au marché ?" }]);
  });

  it("leaves out the house's own lines and empty messages", () => {
    const talk = chatter();
    talk.next([]);
    expect(talk.next([message("m1", null, "Fatou knocked"), message("m2", "awa", "   ")])).toEqual([]);
  });

  it("starts over in another city", () => {
    const talk = chatter();
    talk.next([message("m1", "awa")]);
    talk.reset();
    expect(talk.next([message("m9", "kofi")])).toEqual([]);
  });
});

describe("fireworks once per moment", () => {
  it("lets the second cheer for a house through only after a while", () => {
    const cheer = onceEach(10_000);
    expect(cheer("sacre-coeur", 0)).toBe(true);
    expect(cheer("sacre-coeur", 4000)).toBe(false);
    expect(cheer("almadies", 4000)).toBe(true);
    expect(cheer("sacre-coeur", 12_000)).toBe(true);
  });
});
