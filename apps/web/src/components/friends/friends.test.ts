import { afterEach, describe, expect, it } from "vitest";
import { IDLE_MS, presenceNow } from "../../activity";
import { language } from "../../i18n";
import type { Friend, Friends, Notice } from "../../types";
import { noticeRow } from "../bell/bell";
import { connected, friendKey, sortFriends, statusLine, waiting } from "./friends";

afterEach(() => {
  language.lang = "en";
});

const friend = (login: string, status: Friend["status"], city: string | null = null, name: string | null = null): Friend => ({ login, name, avatarUrl: null, status, city });

describe("the friends list", () => {
  it("puts the most present first, then sorts by name", () => {
    const list = [friend("zed", "offline"), friend("kofi", "idle", "Lomé"), friend("awa", "away"), friend("sam", "online", "Dakar"), friend("bea", "online", "Dakar", "Béa")];
    expect(sortFriends(list).map((f) => f.login)).toEqual(["bea", "sam", "kofi", "awa", "zed"]);
  });

  it("says the status, and the city while they're connected in one", () => {
    expect(statusLine(friend("sam", "online", "Dakar"))).toBe("Online · Dakar");
    expect(statusLine(friend("sam", "idle", "Lomé"))).toBe("Idle · Lomé");
    expect(statusLine(friend("sam", "away"))).toBe("Away");
    expect(statusLine(friend("sam", "offline", "Dakar"))).toBe("Offline");
    language.lang = "fr";
    expect(statusLine(friend("sam", "online", "Dakar"))).toBe("En ligne · Dakar");
  });

  it("counts who's connected, and the requests waiting on the key", () => {
    expect(connected([friend("a", "online"), friend("b", "away"), friend("c", "offline")])).toBe(2);
    expect(waiting(0)).toBe("");
    expect(waiting(3)).toBe("3");
    expect(waiting(12)).toBe("9+");
  });
});

describe("the friend key on a person's card", () => {
  const sam = { login: "sam", name: "Sam", avatarUrl: null };
  const empty: Friends & { loaded: boolean } = { friends: [], requests: [], sent: [], loaded: true };
  const card = { login: "sam", isMe: false, example: false };
  const me = { login: "fatou" };

  it("offers to add someone new", () => {
    expect(friendKey(card, me, empty)).toEqual({ kind: "add" });
  });

  it("says yes to their request, shows yours as asked, and knows a friend", () => {
    expect(friendKey(card, me, { ...empty, requests: [{ id: "r1", from: sam, createdAt: "" }] })).toEqual({ kind: "accept", id: "r1" });
    expect(friendKey(card, me, { ...empty, sent: [{ id: "s1", to: sam }] })).toEqual({ kind: "asked", id: "s1" });
    expect(friendKey(card, me, { ...empty, friends: [friend("sam", "online")] })).toEqual({ kind: "friends" });
  });

  it("is missing on yourself, an example person, logged out, and before the list has loaded", () => {
    expect(friendKey({ ...card, isMe: true }, me, empty)).toBeNull();
    expect(friendKey({ ...card, example: true }, me, empty)).toBeNull();
    expect(friendKey(card, null, empty)).toBeNull();
    expect(friendKey(card, me, { ...empty, loaded: false })).toBeNull();
  });
});

describe("how present you are", () => {
  it("is away while the tab is hidden, idle after five minutes without input, else online", () => {
    expect(presenceNow(true, 0, 1)).toBe("away");
    expect(presenceNow(false, 0, IDLE_MS - 1)).toBe("online");
    expect(presenceNow(false, 0, IDLE_MS)).toBe("idle");
    expect(IDLE_MS).toBe(5 * 60_000);
  });
});

describe("friends under the bell", () => {
  const base: Notice = {
    id: "n1",
    kind: "friend_request",
    state: "open",
    from: { login: "sam", name: "Sam Mensah", avatarUrl: null },
    house: null,
    room: null,
    applicationId: null,
    verdict: null,
    createdAt: "2026-11-06T10:00:00Z",
    read: false,
  };

  it("offers to add or say no to a request, then says how it ended", () => {
    expect(noticeRow(base)).toEqual({ title: "Sam wants to be friends", sub: null, actions: ["accept", "decline"], acceptWord: "Add" });
    expect(noticeRow({ ...base, state: "accepted" })).toMatchObject({ sub: "You're friends.", actions: [] });
    expect(noticeRow({ ...base, state: "declined" })).toMatchObject({ sub: "You said no.", actions: [] });
    expect(noticeRow({ ...base, state: "withdrawn" })).toMatchObject({ sub: "They took it back.", actions: [] });
  });

  it("tells the sender it was accepted", () => {
    expect(noticeRow({ ...base, kind: "friend_accepted", state: null })).toMatchObject({ title: "Sam is your friend now", actions: [] });
  });
});
