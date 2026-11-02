import { describe, expect, it } from "vitest";
import type { CityHouse } from "../../types";
import { messageAction } from "../chat/chat";
import { type StreetPerson, type StreetViewer, streetActions } from "./personActions";

type MyHouse = Pick<CityHouse, "id" | "name" | "demo" | "rooms">;
const room = (name: string, occupant: string | null) =>
  ({ name, status: "empty", url: null, project: null, projectDescription: null, ad: null, occupant: occupant ? { login: occupant, name: null, avatarUrl: null } : null, building: false }) as CityHouse["rooms"][number];
const withFree: MyHouse = { id: "sacre-coeur", name: "Sacré-Cœur", demo: false, rooms: [room("jib", "jib"), room("room-4", null)] };
const full: MyHouse = { ...withFree, rooms: [room("jib", "jib"), room("room-4", "awa")] };

const fatou: StreetPerson = { login: "fatou", isMe: false, example: false, github: true, home: null };
const moussa: StreetPerson = { login: "moussa", isMe: false, example: false, github: true, home: { houseId: "almadies", houseName: "Almadies" } };
const awa: StreetPerson = { login: "awa", isMe: false, example: false, github: true, home: { houseId: "sacre-coeur", houseName: "Sacré-Cœur" } };
const passerBy: StreetPerson = { login: "mdiop221", isMe: false, example: true, home: null };
const koffi: StreetPerson = { login: "koffi", isMe: false, example: true, github: false, home: { houseId: "be-kpota", houseName: "Bè-Kpota" } };
const housed: StreetViewer = { login: "jib", houses: [{ id: "sacre-coeur", name: "Sacré-Cœur" }] };
const homeless: StreetViewer = { login: "sam", houses: [] };
const invitation = { kind: "invite", houseId: "sacre-coeur", houseName: "Sacré-Cœur", rooms: ["room-4"], example: false };

describe("Chat comes first, on everyone you see", () => {
  const people: StreetPerson[] = [fatou, moussa, awa];
  const viewers: (StreetViewer | null)[] = [housed, homeless];

  it("opens a conversation with any real person, whatever else they're offered", () => {
    for (const p of people) for (const v of viewers) expect(messageAction(p, v)).toEqual({ kind: "open" });
  });

  it("takes you to log in when you're logged out", () => {
    for (const p of people) expect(messageAction(p, null)).toEqual({ kind: "login" });
  });

  it("is there for an example person too: they answer", () => {
    for (const p of [passerBy, koffi]) {
      for (const v of viewers) expect(messageAction(p, v)).toEqual({ kind: "open" });
      expect(messageAction(p, null)).toEqual({ kind: "login" });
    }
  });

  it("is missing only on yourself", () => {
    expect(messageAction({ ...fatou, isMe: true }, housed)).toBeNull();
  });
});

describe("what else you can do about someone in the street", () => {
  it("offers their house when they have one, logged in or not", () => {
    expect(streetActions(moussa, housed, withFree, []).see).toEqual({ houseId: "almadies", houseName: "Almadies" });
    expect(streetActions(moussa, null, null, []).see).toEqual({ houseId: "almadies", houseName: "Almadies" });
    expect(streetActions(fatou, housed, withFree, []).see).toBeNull();
  });

  it("invites someone with no house to your house's free room, once", () => {
    expect(streetActions(fatou, housed, withFree, []).offer).toEqual(invitation);
    const sent = [{ id: "n1", kind: "house_invite" as const, to: "fatou", houseId: "sacre-coeur" }];
    expect(streetActions(fatou, housed, withFree, sent).offer).toEqual({ kind: "invited", inviteId: "n1" });
  });

  it("invites someone who already lives elsewhere too, beside seeing their house", () => {
    const moves = streetActions(moussa, housed, withFree, []);
    expect(moves.see).toMatchObject({ houseId: "almadies" });
    expect(moves.offer).toEqual(invitation);
  });

  it("offers each free room when there are several, the first one first", () => {
    const two: MyHouse = { ...withFree, rooms: [room("jib", "jib"), room("room-3", null), room("room-4", null)] };
    expect(streetActions(fatou, housed, two, []).offer).toMatchObject({ kind: "invite", rooms: ["room-3", "room-4"] });
  });

  it("asks to share a house when your house is full, whether they live somewhere or not", () => {
    expect(streetActions(fatou, housed, full, []).offer).toEqual({ kind: "share", example: false });
    expect(streetActions(moussa, housed, full, []).offer).toEqual({ kind: "share", example: false });
  });

  it("asks to share a house when you have none, whether they live somewhere or not, once", () => {
    expect(streetActions(fatou, homeless, null, []).offer).toEqual({ kind: "share", example: false });
    expect(streetActions(moussa, homeless, null, []).offer).toEqual({ kind: "share", example: false });
    const sent = [{ id: "n2", kind: "rent_together" as const, to: "fatou", houseId: null }];
    expect(streetActions(fatou, homeless, null, sent).offer).toEqual({ kind: "asked", inviteId: "n2" });
  });

  it("offers sharing while your house isn't on the city's list, and never an example house", () => {
    expect(streetActions(fatou, housed, null, []).offer).toEqual({ kind: "share", example: false });
    expect(streetActions(fatou, housed, { ...withFree, demo: true }, []).offer).toEqual({ kind: "share", example: false });
  });

  it("offers nothing more to someone who already lives with you", () => {
    expect(streetActions(awa, housed, withFree, []).offer).toBeNull();
    expect(streetActions(awa, housed, full, []).offer).toBeNull();
  });

  it("offers nothing more when you're logged out", () => {
    expect(streetActions(fatou, null, null, []).offer).toBeNull();
    expect(streetActions(passerBy, null, null, []).offer).toBeNull();
  });

  it("is never more than two keys beside Chat", () => {
    const moves = streetActions(moussa, housed, full, []);
    expect([moves.see, moves.offer].filter(Boolean)).toHaveLength(2);
  });

  it("shows an example person's offer disabled, and never their GitHub", () => {
    expect(streetActions(passerBy, housed, withFree, [])).toEqual({ see: null, offer: { ...invitation, example: true }, github: null, example: true });
    expect(streetActions(passerBy, homeless, null, []).offer).toEqual({ kind: "share", example: true });
    expect(streetActions(koffi, housed, full, []).offer).toEqual({ kind: "share", example: true });
    expect(streetActions({ ...passerBy, github: true }, homeless, null, []).github).toBeNull();
  });

  it("links a real GitHub account, and offers nothing about yourself", () => {
    expect(streetActions(fatou, housed, withFree, []).github).toBe("https://github.com/fatou");
    expect(streetActions({ ...fatou, github: undefined }, housed, withFree, []).github).toBeNull();
    expect(streetActions({ ...moussa, isMe: true }, housed, withFree, [])).toMatchObject({ see: null, offer: null });
  });
});
