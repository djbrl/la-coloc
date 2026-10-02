import { describe, expect, it } from "vitest";
import { noteForDeploy, noteForRoomEvent } from "./fridge";
import { redactToken } from "./houses.service";

describe("fridge notes", () => {
  it("tells the house when a room ran out of memory", () => {
    const n = noteForRoomEvent({ type: "room_event", room: "moussa", event: "oom", at: "" }, "Moussa");
    expect(n.tone).toBe("warning");
    expect(n.text).toContain("Moussa");
  });

  it("only mentions the first line of a failed deploy", () => {
    const n = noteForDeploy({ type: "deploy_status", deployId: "1", room: "jib", status: "failed", detail: "build failed\nstep 3/7..." }, "Jib");
    expect(n?.text).toBe("Jib's deploy failed: build failed. The previous version is still running.");
  });

  it("stays quiet for intermediate steps", () => {
    expect(noteForDeploy({ type: "deploy_status", deployId: "1", room: "jib", status: "building" }, "Jib")).toBeNull();
  });
});

describe("redactToken", () => {
  it("hides tokens in repo URLs", () => {
    expect(redactToken("https://x-access-token:ghs_abc@github.com/a/b.git")).toBe("https://***@github.com/a/b.git");
    expect(redactToken("https://github.com/a/b.git")).toBe("https://github.com/a/b.git");
  });
});
