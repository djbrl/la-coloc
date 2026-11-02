import { describe, expect, it } from "vitest";
import { allDone, MISSIONS, missionCount, missionOfMessage, noMissions, tick } from "./missions";

describe("which message counts for what", () => {
  it("counts a direct message and the city's room as talking to a stranger", () => {
    expect(missionOfMessage("/api/chat/dm/awa")).toBe("talk");
    expect(missionOfMessage("/api/cities/Dakar/chat")).toBe("talk");
    expect(missionOfMessage("/api/cities/Lom%C3%A9/chat")).toBe("talk");
  });

  it("counts a house's channel and a knock as introducing yourself", () => {
    expect(missionOfMessage("/api/houses/sacre-coeur/messages")).toBe("house");
    expect(missionOfMessage("/api/houses/sacre-coeur/knock")).toBe("house");
  });

  it("counts nothing else", () => {
    expect(missionOfMessage("/api/board/12/replies")).toBeNull();
    expect(missionOfMessage("/api/arena/Dakar/chat")).toBeNull();
    expect(missionOfMessage("/api/applications/3/messages")).toBeNull();
  });
});

describe("ticking", () => {
  it("adds a mission once, and keeps the same object the second time", () => {
    const one = tick(noMissions(), "arena");
    expect(one.done).toEqual(["arena"]);
    expect(tick(one, "arena")).toBe(one);
  });

  it("counts for the folded key, and knows when all four are done", () => {
    let s = noMissions();
    expect(missionCount(s)).toBe("0/4");
    s = tick(s, "city");
    expect(missionCount(s)).toBe("1/4");
    expect(allDone(s)).toBe(false);
    for (const id of MISSIONS) s = tick(s, id);
    expect(missionCount(s)).toBe("4/4");
    expect(allDone(s)).toBe(true);
  });
});
