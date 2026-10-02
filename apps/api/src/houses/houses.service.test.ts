import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { HousesService } from "./houses.service";

const oom = { type: "room_event" as const, room: "moussa", event: "oom" as const, at: "" };

describe("HousesService", () => {
  it("collapses a crash loop into one fridge note with a count", () => {
    const houses = new HousesService();
    houses.recordRoomEvent("sacre-coeur", oom);
    houses.recordRoomEvent("sacre-coeur", oom);
    houses.recordRoomEvent("sacre-coeur", oom);
    const notes = houses.view("sacre-coeur").notes;
    expect(notes).toHaveLength(1);
    expect(notes[0].count).toBe(3);
  });

  it("rebuilds room status from the agent's snapshot after a restart", () => {
    const houses = new HousesService();
    houses.applySnapshot("sacre-coeur", {
      type: "rooms_snapshot",
      rooms: [
        { room: "jib", kind: "prod", state: "running", url: "http://jib.coloc.localhost:8000" },
        { room: "moussa", kind: "prod", state: "restarting", url: "http://moussa.coloc.localhost:8000" },
      ],
    });
    const rooms = Object.fromEntries(houses.view("sacre-coeur").rooms.map((r) => [r.name, r.status]));
    expect(rooms).toEqual({ jib: "live", awa: "empty", moussa: "down" });
  });

  it("checks agent secrets", () => {
    const houses = new HousesService();
    expect(houses.verifyAgentSecret("sacre-coeur", "dev-secret-change-me")).toBe(true);
    expect(houses.verifyAgentSecret("sacre-coeur", "guess")).toBe(false);
    expect(houses.verifyAgentSecret("nowhere", "dev-secret-change-me")).toBe(false);
  });

  it("never exposes the agent secret in the house view", () => {
    expect(JSON.stringify(new HousesService().view("sacre-coeur"))).not.toContain("dev-secret");
  });
});
