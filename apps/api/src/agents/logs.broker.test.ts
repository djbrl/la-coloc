import { describe, expect, it } from "vitest";
import type { AgentRegistry } from "./agent.registry";
import { LogsBroker } from "./logs.broker";

const say = (deployId: string, lines: string[]) => ({ type: "deploy_log" as const, deployId, room: "fatou", lines });

describe("a build's lines", () => {
  it("hands them out from where the window got to", () => {
    const logs = new LogsBroker({} as AgentRegistry);
    logs.addBuildLines("h", say("d", ["a", "b"]));
    logs.addBuildLines("h", say("d", ["c"]));
    expect(logs.buildLines("h", "d", 0)).toEqual({ lines: ["a", "b", "c"], next: 3 });
    expect(logs.buildLines("h", "d", 2)).toEqual({ lines: ["c"], next: 3 });
    expect(logs.buildLines("h", "d", 3)).toEqual({ lines: [], next: 3 });
  });

  it("doesn't show one house another's build", () => {
    const logs = new LogsBroker({} as AgentRegistry);
    logs.addBuildLines("h", say("d", ["secret"]));
    expect(logs.buildLines("other", "d", 0)).toBeNull();
  });

  it("keeps the end of a very long build, and the window's place in it", () => {
    const logs = new LogsBroker({} as AgentRegistry);
    for (let i = 0; i < 40; i++) logs.addBuildLines("h", say("d", Array.from({ length: 100 }, (_, n) => `${i}.${n}`)));
    const all = logs.buildLines("h", "d", 0)!;
    expect(all.next).toBe(4000);
    expect(all.lines).toHaveLength(3000);
    expect(all.lines.at(-1)).toBe("39.99");
    expect(logs.buildLines("h", "d", 3998)!.lines).toEqual(["39.98", "39.99"]);
  });

  it("forgets the oldest builds", () => {
    const logs = new LogsBroker({} as AgentRegistry);
    for (let i = 0; i <= 30; i++) logs.addBuildLines("h", say(`d${i}`, ["x"]));
    expect(logs.buildLines("h", "d0", 0)).toBeNull();
    expect(logs.buildLines("h", "d30", 0)).not.toBeNull();
  });
});
