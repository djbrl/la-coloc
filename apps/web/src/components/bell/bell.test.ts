import { afterEach, describe, expect, it } from "vitest";
import { language } from "../../i18n";
import type { Notice } from "../../types";
import { fcfa } from "../lobby/house/server";
import { noticeRow } from "./bell";

afterEach(() => {
  language.lang = "en";
});

const base: Notice = {
  id: "n1",
  kind: "house_invite",
  state: "open",
  from: { login: "jib", name: "Jib Diallo", avatarUrl: null },
  house: { id: "sacre-coeur", name: "Sacré-Cœur", city: "Dakar" },
  room: "room-4",
  applicationId: null,
  verdict: null,
  createdAt: "2026-10-16T10:00:00Z",
  read: false,
};

describe("a notification under the bell", () => {
  it("offers to move in or say no to an open house invitation", () => {
    expect(noticeRow(base)).toEqual({ title: "Jib invites you to Sacré-Cœur", sub: "Room room-4 for you.", actions: ["accept", "decline"], acceptWord: "Move in" });
  });

  it("has nothing left to answer once it's decided", () => {
    expect(noticeRow({ ...base, state: "accepted" }).actions).toEqual(["house"]);
    expect(noticeRow({ ...base, state: "declined" })).toMatchObject({ sub: "You said no.", actions: [] });
    expect(noticeRow({ ...base, state: "withdrawn" })).toMatchObject({ sub: "They took it back.", actions: [] });
    expect(noticeRow({ ...base, state: "expired" })).toMatchObject({ sub: "It lapsed.", actions: [] });
  });

  it("points both people who'll rent together to an empty plot", () => {
    const ask = { ...base, kind: "rent_together" as const, house: null, room: null };
    expect(noticeRow(ask)).toMatchObject({ title: "Jib wants to share a house with you", actions: ["accept", "decline"], acceptWord: "I'm in" });
    expect(noticeRow({ ...ask, state: "accepted" }).actions).toEqual(["plot"]);
    expect(noticeRow({ ...ask, kind: "rent_together_yes", state: null })).toMatchObject({ title: "Jib wants to share a house with you", actions: ["plot"] });
  });

  it("tells you a flatmate's build failed, with a way to their house", () => {
    const failed = { ...base, kind: "build_failed" as const, state: null, room: "room-2" };
    expect(noticeRow(failed)).toEqual({ title: "Jib's build failed", sub: "Room room-2, Sacré-Cœur.", actions: ["house"], acceptWord: "Move in" });
  });

  it("opens the knock or the house for the doorbell's news", () => {
    const knock = { ...base, kind: "knock" as const, state: null, from: { login: "fatou", name: null, avatarUrl: null }, applicationId: "a1" };
    expect(noticeRow(knock)).toMatchObject({ title: "fatou knocked on Sacré-Cœur", actions: ["knock"] });
    const yes = { ...base, kind: "knock_answer" as const, state: null, from: null, verdict: "admitted" as const, applicationId: "a1" };
    expect(noticeRow(yes)).toMatchObject({ title: "Sacré-Cœur said yes. Welcome home!", actions: ["house"] });
    expect(noticeRow({ ...yes, verdict: "declined" })).toMatchObject({ title: "Sacré-Cœur said no this time.", actions: ["knock"] });
    expect(noticeRow({ ...base, kind: "invite_accepted", state: null, from: { login: "fatou", name: "Fatou Sow", avatarUrl: null } }).title).toBe("Fatou moved into Sacré-Cœur");
    const no = noticeRow({ ...base, kind: "invite_declined", state: null, from: { login: "fatou", name: "Fatou Sow", avatarUrl: null } });
    expect([no.title, no.actions]).toEqual(["Fatou said no to Sacré-Cœur", []]);
  });
});

describe("a house chat under the bell", () => {
  it("lets a flatmate answer an ask to join the house's chat, and tells the one who asked", () => {
    const ask = noticeRow({ ...base, kind: "guest_ask", room: null });
    expect(ask.actions).toEqual(["accept", "decline"]);
    expect(ask.acceptWord).toBe("Let in");
    expect(ask.title).toBe("Jib asks to join Sacré-Cœur's chat");
    expect(noticeRow({ ...base, kind: "guest_ask", room: null, state: "accepted" }).actions).toEqual([]);
    expect(noticeRow({ ...base, kind: "guest_ask", room: null, state: "declined" }).sub).toBe("You said no.");
    expect(noticeRow({ ...base, kind: "guest_accepted", state: null, room: null }).actions).toEqual(["house"]);
    expect(noticeRow({ ...base, kind: "guest_declined", state: null, room: null }).actions).toEqual([]);
  });

  it("says the rent taken in one line, the amount and the house, and offers a top-up when it couldn't be", () => {
    const rent = { ...base, kind: "rent_paid" as const, state: null, from: null, room: null, amount: 3_000, month: "2026-11" };
    expect(noticeRow(rent)).toEqual({ title: `Rent: ${fcfa(3_000)} for Sacré-Cœur, November`, sub: null, actions: [], acceptWord: "Move in" });
    expect(noticeRow({ ...rent, kind: "rent_due" })).toMatchObject({ title: `Rent due: ${fcfa(3_000)} for Sacré-Cœur, November`, sub: "Not enough credit. Top up and it's paid.", actions: ["credit"] });
    language.lang = "fr";
    expect(noticeRow(rent).title).toBe(`Loyer\u00a0: ${fcfa(3_000)} pour Sacré-Cœur, novembre`);
    expect(noticeRow({ ...rent, kind: "rent_due" }).sub).toBe("Crédit insuffisant. Rechargez, et il sera payé.");
  });
});

describe("words meant for you under the bell", () => {
  const awa = { login: "awa", name: "Awa Ndiaye", avatarUrl: null };
  const news = { ...base, state: null, from: awa, house: null, room: null };
  const post = { id: "p1", title: "Cherche coloc", mine: true };

  it("says someone replied to your post, with its title, and opens it", () => {
    const reply: Notice = { ...news, kind: "post_reply", chat: { place: "post", city: "Dakar", post } };
    expect(noticeRow(reply)).toEqual({ title: "Awa replied to your post", sub: "“Cherche coloc”", actions: ["chat"], acceptWord: "Move in" });
    expect(noticeRow({ ...reply, chat: { place: "post", city: "Dakar", post: { ...post, mine: false } } }).title).toBe("Awa also replied");
  });

  it("says who mentioned you, and where", () => {
    const mention: Notice = { ...news, kind: "mention", chat: { place: "city", city: "Dakar", post: null } };
    expect(noticeRow(mention)).toMatchObject({ title: "Awa mentioned you in Dakar", sub: null, actions: ["chat"] });
    expect(noticeRow({ ...mention, chat: { place: "arena", city: "Dakar", post: null } }).title).toBe("Awa mentioned you in Dakar's Arena");
    expect(noticeRow({ ...mention, chat: { place: "post", city: "Dakar", post } })).toMatchObject({ title: "Awa mentioned you on the board", sub: "“Cherche coloc”", actions: ["chat"] });
  });

  it("has nothing to open once the post is gone", () => {
    expect(noticeRow({ ...news, kind: "post_reply", chat: null })).toMatchObject({ sub: "That post is gone.", actions: [] });
    expect(noticeRow({ ...news, kind: "mention", chat: null }).actions).toEqual([]);
  });
});
