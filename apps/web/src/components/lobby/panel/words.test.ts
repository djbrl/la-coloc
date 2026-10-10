import { describe, expect, it } from "vitest";
import { bare, houseLine, houseState, roomLine, roomState } from "./words";

describe("the panels' words", () => {
  const awa = { login: "awa", name: "Awa", avatarUrl: null };

  it("says a free room is free, and that nothing runs before the house has its server", () => {
    expect(roomState({ status: "live", occupant: null })).toEqual({ tone: "free", word: "Free" });
    expect(roomState({ status: "live", occupant: awa }, "making").word).toBe("Waiting for server");
    expect(roomState({ status: "failed", occupant: awa })).toEqual({ tone: "danger", word: "Build failed" });
  });

  it("never calls an example room online", () => {
    expect(roomState({ status: "live", occupant: awa, demo: true }).word).toBe("Example project");
    expect(roomState({ status: "live", occupant: awa }, "live", true).tone).toBe("neutral");
    expect(roomLine({ status: "live", occupant: awa }, "live", true)).toBe("An example project.");
    expect(roomLine({ status: "live", occupant: awa })).toBe("Online.");
    expect(roomLine({ status: "failed", occupant: awa })).toBe("Its last build failed.");
  });

  it("calls a demo house an example rather than a house whose server is down", () => {
    expect(houseState("live", false, true).word).toBe("Example house");
    expect(houseState("live", false).word).toBe("Server down");
    expect(houseState("live", true).tone).toBe("live");
    expect(houseState("making", false).word).toBe("Setting up");
  });

  it("says a house's state in a sentence, and an example house once", () => {
    const h = { city: "Dakar", status: "live" as const, agentOnline: true, demo: false };
    expect(houseLine(h)).toBe("Dakar. Its server is running.");
    expect(houseLine({ ...h, agentOnline: false })).toBe("Dakar. Its server is down for now.");
    expect(houseLine({ ...h, demo: true })).toBe("Dakar. An example house, to show how one looks.");
    expect(houseLine({ ...h, status: "making" })).toBe("Dakar. Still being set up.");
  });

  it("writes an address the way people read it", () => {
    expect(bare("http://jib.coloc.localhost:8000/")).toBe("jib.coloc.localhost:8000");
  });
});
