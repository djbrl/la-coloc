import { describe, expect, it } from "vitest";
import { Builds } from "./builds";

describe("the builds under way", () => {
  it("cancels a room's real builds, running or waiting, and nothing else", () => {
    const builds = new Builds();
    const first = builds.add("d1", "awa", "prod");
    const waiting = builds.add("d2", "awa", "prod");
    const preview = builds.add("d3", "awa", "preview");
    const other = builds.add("d4", "jib", "prod");
    expect(builds.cancel("awa")).toBe(2);
    expect([first.aborted, waiting.aborted, preview.aborted, other.aborted]).toEqual([true, true, false, false]);
  });

  it("tells the API what it's on until each one is done, and has nothing to cancel after", () => {
    const builds = new Builds();
    builds.add("d1", "awa", "prod");
    builds.add("d2", "jib", "prod");
    expect(builds.ids()).toEqual(["d1", "d2"]);
    builds.done("d1");
    expect(builds.ids()).toEqual(["d2"]);
    expect(builds.cancel("awa")).toBe(0);
  });
});
