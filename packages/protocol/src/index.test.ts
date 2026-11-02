import { describe, expect, it } from "vitest";
import { parseAgentToApi, parseApiToAgent } from "./index";

describe("protocol", () => {
  it("fills deploy defaults", () => {
    const msg = parseApiToAgent(
      JSON.stringify({
        type: "deploy",
        deployId: "d1",
        room: "jib",
        kind: "prod",
        repo: "https://github.com/x/y.git",
        limits: { memoryMb: 512, cpus: 1 },
      }),
    );
    expect(msg.type).toBe("deploy");
    if (msg.type !== "deploy") return;
    expect(msg.ref).toBeUndefined(); // the repo's default branch
    expect(msg.path).toBe(".");
    expect(msg.env).toEqual({});
  });

  it("rejects room names that could escape into DNS or Docker names", () => {
    const bad = ["Jib", "a", "../etc", "jib.evil.com", "jib_1", "-jib"];
    for (const room of bad) {
      expect(() => parseApiToAgent(JSON.stringify({ type: "remove_room", room }))).toThrow();
    }
  });

  it("cancels a build by its room, and the room's name is checked like any other", () => {
    expect(parseApiToAgent(JSON.stringify({ type: "cancel_build", room: "jib" }))).toEqual({ type: "cancel_build", room: "jib" });
    expect(() => parseApiToAgent(JSON.stringify({ type: "cancel_build", room: "../etc" }))).toThrow();
  });

  it("bounds log requests and replies", () => {
    const req = parseApiToAgent(JSON.stringify({ type: "get_logs", requestId: "r1", room: "jib" }));
    expect(req).toMatchObject({ kind: "prod", lines: 200 });
    expect(() => parseApiToAgent(JSON.stringify({ type: "get_logs", requestId: "r1", room: "jib", lines: 100000 }))).toThrow();
    expect(() => parseAgentToApi(JSON.stringify({ type: "logs", requestId: "r1", room: "jib", text: "x".repeat(300_000) }))).toThrow();
  });

  it("rejects unknown message types", () => {
    expect(() => parseAgentToApi(JSON.stringify({ type: "rm_rf" }))).toThrow();
  });
});
