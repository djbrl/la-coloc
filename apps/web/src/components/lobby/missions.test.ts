import { describe, expect, it } from "vitest";
import { allDone, MISSIONS, type Missions, missionCount, missionOfMessage, noMissions, tick, upgrade } from "./missions";

const you = { friends: ["awa"], houses: ["sacre-coeur"] };

describe("the missions", () => {
  it("are five, the city board first", () => {
    expect(MISSIONS).toEqual(["board", "house", "talk", "arena", "city"]);
  });
});

describe("which message counts for what", () => {
  it("counts a direct message to someone who isn't your friend as talking to a stranger", () => {
    expect(missionOfMessage("/api/chat/dm/moussa", you)).toBe("talk");
    expect(missionOfMessage("/api/chat/dm/a%C3%AFcha", you)).toBe("talk");
    expect(missionOfMessage("/api/chat/dm/awa", you)).toBeNull();
  });

  it("counts a knock, or a message in someone else's house, as introducing yourself", () => {
    expect(missionOfMessage("/api/houses/almadies/knock", you)).toBe("house");
    expect(missionOfMessage("/api/houses/almadies/messages", you)).toBe("house");
    // Your own house's chat is home, not an introduction; a knock is always on someone else's door.
    expect(missionOfMessage("/api/houses/sacre-coeur/messages", you)).toBeNull();
  });

  it("counts nothing else, the city's room included", () => {
    expect(missionOfMessage("/api/cities/Dakar/chat", you)).toBeNull();
    expect(missionOfMessage("/api/board/12/replies", you)).toBeNull();
    expect(missionOfMessage("/api/arena/Dakar/chat", you)).toBeNull();
    expect(missionOfMessage("/api/applications/3/messages", you)).toBeNull();
  });
});

describe("ticking", () => {
  it("adds a mission once, and keeps the same object the second time", () => {
    const one = tick(noMissions(), "arena");
    expect(one.done).toEqual(["arena"]);
    expect(tick(one, "arena")).toBe(one);
  });

  it("counts for the folded key, and knows when all five are done", () => {
    let s = noMissions();
    expect(missionCount(s)).toBe("0/5");
    s = tick(s, "city");
    expect(missionCount(s)).toBe("1/5");
    expect(allDone(s)).toBe(false);
    for (const id of MISSIONS) s = tick(s, id);
    expect(missionCount(s)).toBe("5/5");
    expect(allDone(s)).toBe(true);
  });
});

describe("saved missions from before the board", () => {
  it("keep what was done, and bring the card back for the board", () => {
    const old = { done: ["talk", "house", "arena", "city"], collapsed: true, finished: true } as Missions;
    const now = upgrade(old);
    expect(now).toEqual({ done: ["talk", "house", "arena", "city"], collapsed: true, finished: false });
    expect(missionCount(now)).toBe("4/5");
  });

  it("drop ids that are no longer missions", () => {
    expect(upgrade({ done: ["talk", "gone"], collapsed: false, finished: false } as unknown as Missions).done).toEqual(["talk"]);
  });

  it("are left alone when they're already up to date", () => {
    const s = tick(noMissions(), "board");
    expect(upgrade(s)).toBe(s);
    const all = { done: [...MISSIONS], collapsed: false, finished: true };
    expect(upgrade(all)).toBe(all);
  });
});
