import { describe, expect, it } from "vitest";
import type { Notice } from "../../types";
import { noticeRow } from "./bell";

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
    expect(noticeRow(base)).toEqual({ title: "Jib invites you to Sacré-Cœur", sub: "Room room-4 is free for you.", actions: ["accept", "decline"], acceptWord: "Move in" });
  });

  it("has nothing left to answer once it's decided", () => {
    expect(noticeRow({ ...base, state: "accepted" }).actions).toEqual(["house"]);
    expect(noticeRow({ ...base, state: "declined" })).toMatchObject({ sub: "You said no.", actions: [] });
    expect(noticeRow({ ...base, state: "withdrawn" })).toMatchObject({ sub: "They took it back.", actions: [] });
    expect(noticeRow({ ...base, state: "expired" })).toMatchObject({ sub: "It lapsed.", actions: [] });
  });

  it("points both people who'll rent together to an empty plot", () => {
    const ask = { ...base, kind: "rent_together" as const, house: null, room: null };
    expect(noticeRow(ask)).toMatchObject({ title: "Jib wants to rent a server with you", actions: ["accept", "decline"], acceptWord: "I'm in" });
    expect(noticeRow({ ...ask, state: "accepted" }).actions).toEqual(["plot"]);
    expect(noticeRow({ ...ask, kind: "rent_together_yes", state: null })).toMatchObject({ title: "Jib wants to rent with you", actions: ["plot"] });
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
