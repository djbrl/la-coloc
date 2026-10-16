import { describe, expect, it } from "vitest";
import type { CityHouse } from "../../types";
import { type StreetPerson, streetActions } from "./personActions";

type MyHouse = Pick<CityHouse, "id" | "name" | "demo" | "rooms">;
const room = (name: string, occupant: string | null) =>
  ({ name, status: "empty", url: null, project: null, projectDescription: null, ad: null, occupant: occupant ? { login: occupant, name: null, avatarUrl: null } : null, building: false }) as CityHouse["rooms"][number];
const withFree: MyHouse = { id: "sacre-coeur", name: "Sacré-Cœur", demo: false, rooms: [room("jib", "jib"), room("room-4", null)] };
const full: MyHouse = { ...withFree, rooms: [room("jib", "jib"), room("room-4", "awa")] };

const fatou: StreetPerson = { login: "fatou", isMe: false, example: false, github: true, home: null };
const moussa: StreetPerson = { login: "moussa", isMe: false, example: false, github: true, home: { houseId: "almadies", houseName: "Almadies" } };
const passerBy: StreetPerson = { login: "mdiop221", isMe: false, example: true, home: null };
const housed = { login: "jib", houses: [{ id: "sacre-coeur", name: "Sacré-Cœur" }] };
const homeless = { login: "sam", houses: [] };

describe("what you can do about someone in the street", () => {
  it("offers their house when they have one, logged in or not", () => {
    expect(streetActions(moussa, housed, withFree, []).main).toEqual({ kind: "see", houseId: "almadies", houseName: "Almadies" });
    expect(streetActions(moussa, null, null, []).main).toMatchObject({ kind: "see" });
  });

  it("invites someone with no house to your house's free room, once", () => {
    expect(streetActions(fatou, housed, withFree, []).main).toEqual({ kind: "invite", houseId: "sacre-coeur", houseName: "Sacré-Cœur", rooms: ["room-4"], example: false });
    const sent = [{ id: "n1", kind: "house_invite" as const, to: "fatou", houseId: "sacre-coeur" }];
    expect(streetActions(fatou, housed, withFree, sent).main).toEqual({ kind: "invited", inviteId: "n1" });
  });

  it("offers each free room when there are several, the first one first", () => {
    const two: MyHouse = { ...withFree, rooms: [room("jib", "jib"), room("room-3", null), room("room-4", null)] };
    expect(streetActions(fatou, housed, two, []).main).toMatchObject({ kind: "invite", rooms: ["room-3", "room-4"] });
  });

  it("says your house is full instead of inviting", () => {
    expect(streetActions(fatou, housed, full, []).main).toEqual({ kind: "full", houseName: "Sacré-Cœur" });
  });

  it("asks to rent together when neither of you has a house", () => {
    expect(streetActions(fatou, homeless, null, []).main).toEqual({ kind: "rent", example: false });
    const sent = [{ id: "n2", kind: "rent_together" as const, to: "fatou", houseId: null }];
    expect(streetActions(fatou, homeless, null, sent).main).toEqual({ kind: "asked", inviteId: "n2" });
  });

  it("asks you to log in first", () => {
    expect(streetActions(fatou, null, null, []).main).toEqual({ kind: "login" });
  });

  it("shows an example person's action as an example, and never their GitHub", () => {
    expect(streetActions(passerBy, housed, withFree, [])).toEqual({ main: { kind: "invite", houseId: "sacre-coeur", houseName: "Sacré-Cœur", rooms: ["room-4"], example: true }, github: null, example: true, wave: true });
    expect(streetActions(passerBy, homeless, null, []).main).toEqual({ kind: "rent", example: true });
    expect(streetActions({ ...passerBy, github: true }, homeless, null, []).github).toBeNull();
  });

  it("links a real GitHub account, waves only when logged in, and offers nothing about yourself", () => {
    expect(streetActions(fatou, housed, withFree, []).github).toBe("https://github.com/fatou");
    expect(streetActions({ ...fatou, github: undefined }, housed, withFree, []).github).toBeNull();
    expect(streetActions(fatou, null, null, []).wave).toBe(false);
    expect(streetActions({ ...fatou, login: "jib", isMe: true }, housed, withFree, [])).toMatchObject({ main: null, wave: false });
  });

  it("offers nothing while your house isn't in the city list yet", () => {
    expect(streetActions(fatou, housed, null, []).main).toBeNull();
  });
});
