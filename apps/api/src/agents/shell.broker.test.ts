import { describe, expect, it, vi } from "vitest";
import type { AgentRegistry } from "./agent.registry";
import { ShellBroker } from "./shell.broker";

const setup = () => {
  const sent: { type: string; shellId?: string }[] = [];
  const agents = { send: vi.fn((_: string, cmd: { type: string }) => void sent.push(cmd)) } as unknown as AgentRegistry;
  const broker = new ShellBroker(agents);
  const events = { output: vi.fn(), exit: vi.fn() };
  return { sent, agents, broker, events };
};

describe("the shell broker", () => {
  it("passes output only from the house the shell belongs to", () => {
    const { sent, broker, events } = setup();
    broker.open("a", "room", {}, events);
    const shellId = sent[0].shellId!;
    broker.output("b", { type: "shell_output", shellId, data: Buffer.from("no").toString("base64") });
    expect(events.output).not.toHaveBeenCalled();
    broker.output("a", { type: "shell_output", shellId, data: Buffer.from("yes").toString("base64") });
    expect(events.output).toHaveBeenCalledWith(Buffer.from("yes"), false);
    broker.exit("b", { type: "shell_exit", shellId, code: 0 });
    expect(events.exit).not.toHaveBeenCalled();
  });

  it("tells every shell of a house when its line drops, and only those", () => {
    const { broker, events } = setup();
    const other = { output: vi.fn(), exit: vi.fn() };
    broker.open("a", "room", {}, events);
    broker.open("b", "room", {}, other);
    broker.houseGone("a");
    expect(events.exit).toHaveBeenCalledWith(undefined, "gone");
    expect(other.exit).not.toHaveBeenCalled();
  });

  it("cuts long input into pieces that fit a message, and stops sending once closed", () => {
    const { sent, broker, events } = setup();
    const shell = broker.open("a", "room", {}, events);
    shell.input(Buffer.alloc(100 * 1024));
    expect(sent.filter((m) => m.type === "shell_input")).toHaveLength(3);
    shell.close();
    expect(sent.at(-1)?.type).toBe("shell_close");
    const n = sent.length;
    shell.input(Buffer.from("late"));
    expect(sent).toHaveLength(n);
  });

  it("gives up on a shell whose line dropped while typing", () => {
    const { agents, broker, events } = setup();
    const shell = broker.open("a", "room", {}, events);
    vi.mocked(agents.send).mockImplementation(() => {
      throw new Error("offline");
    });
    shell.input(Buffer.from("x"));
    expect(events.exit).toHaveBeenCalledWith(undefined, "gone");
  });
});
