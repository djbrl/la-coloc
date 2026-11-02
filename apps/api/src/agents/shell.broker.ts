import { Injectable } from "@nestjs/common";
import type { ShellExit, ShellOpen, ShellOutput } from "@coloc/protocol";
import { randomUUID } from "node:crypto";
import { AgentRegistry } from "./agent.registry";

export interface ShellEvents {
  output(data: Buffer, stderr: boolean): void;
  // `reason`: it never started. The line to the house dropped says "gone".
  exit(code: number | undefined, reason: ShellExit["reason"] | "gone" | undefined): void;
}

export interface Shell {
  input(data: Buffer): void;
  eof(): void;
  resize(cols: number, rows: number): void;
  ack(bytes: number): void;
  close(): void;
}

// A slice of what someone types: small enough for one message on the line.
const INPUT_BYTES = 48 * 1024;

// The middle of a shell: SSH on one side (apps/api/src/ssh), a caretaker on the other. It only knows which house each
// shell belongs to, so one house's caretaker can't write to another house's shell.
@Injectable()
export class ShellBroker {
  private shells = new Map<string, { houseId: string; events: ShellEvents }>();

  constructor(private readonly agents: AgentRegistry) {}

  /** Throws when the house's caretaker is offline. */
  open(houseId: string, room: string, opts: Pick<ShellOpen, "command" | "tty">, events: ShellEvents): Shell {
    const shellId = randomUUID();
    this.agents.send(houseId, { type: "shell_open", shellId, room, ...opts });
    this.shells.set(shellId, { houseId, events });
    // The line can drop at any moment: then houseGone has told the person, and there's nothing left to tell the caretaker.
    const send = (cmd: Parameters<AgentRegistry["send"]>[1]) => {
      if (!this.shells.has(shellId)) return;
      try {
        this.agents.send(houseId, cmd);
      } catch {
        this.finish(shellId, undefined, "gone");
      }
    };
    return {
      input: (data) => {
        for (let at = 0; at < data.length; at += INPUT_BYTES) {
          send({ type: "shell_input", shellId, data: data.subarray(at, at + INPUT_BYTES).toString("base64") });
        }
      },
      eof: () => send({ type: "shell_eof", shellId }),
      resize: (cols, rows) => send({ type: "shell_resize", shellId, cols, rows }),
      ack: (bytes) => send({ type: "shell_ack", shellId, bytes }),
      close: () => {
        send({ type: "shell_close", shellId });
        this.shells.delete(shellId);
      },
    };
  }

  output(houseId: string, msg: ShellOutput) {
    const shell = this.shells.get(msg.shellId);
    if (shell?.houseId === houseId) shell.events.output(Buffer.from(msg.data, "base64"), !!msg.stderr);
  }

  exit(houseId: string, msg: ShellExit) {
    if (this.shells.get(msg.shellId)?.houseId === houseId) this.finish(msg.shellId, msg.code, msg.reason);
  }

  /** The caretaker's line dropped. */
  houseGone(houseId: string) {
    for (const [id, shell] of this.shells) if (shell.houseId === houseId) this.finish(id, undefined, "gone");
  }

  private finish(shellId: string, code: number | undefined, reason: Parameters<ShellEvents["exit"]>[1]) {
    const shell = this.shells.get(shellId);
    this.shells.delete(shellId);
    shell?.events.exit(code, reason);
  }
}
