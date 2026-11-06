import { afterEach, describe, expect, it } from "vitest";
import { IDLE_MS, presenceNow } from "../../activity";
import { language } from "../../i18n";
import type { Friend, Friends, Notice } from "../../types";
import { noticeRow } from "../bell/bell";
import { friendWords } from "../list/words";
import { addAnswer, connected, friendKey, inviteLink, sortFriends, statusLine, waiting } from "./friends";

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

describe("adding someone from the list", () => {
  it("says who you added, or that you're friends when they had added you", () => {
    expect(addAnswer("sam", { ok: true, data: { friends: false } })).toEqual({ kind: "said", text: "You added @sam." });
    expect(addAnswer("sam", { ok: true, data: { friends: true } })).toEqual({ kind: "said", text: "You and @sam are friends." });
  });

  it("offers a link to send when nobody here has that login, and shows any other refusal", () => {
    expect(addAnswer("ghost", { ok: false, message: "Nobody by that name lives in La Coloc.", code: "nobodyByLogin" })).toEqual({ kind: "invite", login: "ghost" });
    expect(addAnswer("sam", { ok: false, message: "You're friends already.", code: "alreadyFriends" })).toEqual({ kind: "error", text: "You're friends already." });
    expect(addAnswer("sam", { ok: false, message: "Waiting for the city.", down: true })).toEqual({ kind: "error", text: "Waiting for the city." });
  });

  it("links to the site's front door", () => {
    expect(inviteLink("https://lacoloc.example")).toBe("https://lacoloc.example/");
    expect(inviteLink("http://localhost:5173")).toBe("http://localhost:5173/");
  });

  it("calls the people you added that, not 'asked'", () => {
    expect(friendWords.sentHead).toBe("You added");
    expect(friendWords.asked).toBe("You added");
    expect(friendWords.empty).toContain("GitHub username");
    expect(friendWords.notHere("ghost")).toBe("@ghost isn't on La Coloc yet. Send them this link:");
    language.lang = "fr";
    expect(friendWords.sentHead).toBe("Vous avez ajouté");
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

  it("offers to accept or say no to a request, then says how it ended", () => {
    expect(noticeRow(base)).toEqual({ title: "Sam wants to be friends", sub: null, actions: ["accept", "decline"], acceptWord: "Accept" });
    expect(noticeRow({ ...base, state: "accepted" })).toMatchObject({ sub: "You're friends.", actions: [] });
    expect(noticeRow({ ...base, state: "declined" })).toMatchObject({ sub: "You said no.", actions: [] });
    expect(noticeRow({ ...base, state: "withdrawn" })).toMatchObject({ sub: "They took it back.", actions: [] });
  });

  it("tells the sender it was accepted", () => {
    expect(noticeRow({ ...base, kind: "friend_accepted", state: null })).toMatchObject({ title: "Sam is your friend now", actions: [] });
  });
});
