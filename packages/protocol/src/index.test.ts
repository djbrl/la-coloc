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
    expect(msg.ref).toBe("main");
    expect(msg.path).toBe(".");
    expect(msg.env).toEqual({});
  });

  it("rejects room names that could escape into DNS or Docker names", () => {
    const bad = ["Jib", "a", "../etc", "jib.evil.com", "jib_1", "-jib"];
    for (const room of bad) {
      expect(() => parseApiToAgent(JSON.stringify({ type: "remove_room", room }))).toThrow();
    }
  });

  it("rejects unknown message types", () => {
    expect(() => parseAgentToApi(JSON.stringify({ type: "rm_rf" }))).toThrow();
  });
});
