import { describe, expect, it } from "vitest";
import { bare, houseState, roomState } from "./words";

describe("the panels' words", () => {
  it("says a free room is free, and that nothing runs before the house has its server", () => {
    expect(roomState({ status: "live", occupant: null })).toEqual({ tone: "free", word: "Free" });
    const awa = { login: "awa", name: "Awa", avatarUrl: null };
    expect(roomState({ status: "live", occupant: awa }, "making").word).toBe("Waiting for server");
    expect(roomState({ status: "failed", occupant: awa })).toEqual({ tone: "danger", word: "Build failed" });
  });

  it("calls a demo house an example rather than a house whose server is down", () => {
    expect(houseState("live", false, true).word).toBe("Example house");
    expect(houseState("live", false).word).toBe("Server down");
    expect(houseState("live", true).tone).toBe("live");
    expect(houseState("making", false).word).toBe("Setting up");
  });

  it("writes an address the way people read it", () => {
    expect(bare("http://jib.coloc.localhost:8000/")).toBe("jib.coloc.localhost:8000");
  });
});
