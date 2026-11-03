import { Injectable } from "@nestjs/common";
import type { ShellExit, ShellOpen, ShellOutput } from "@coloc/protocol";
import { randomUUID } from "node:crypto";
import { Subject } from "rxjs";
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
  private shells = new Map<string, { houseId: string; room: string; userId?: string; events: ShellEvents }>();
  // Someone came into a room or left its last shell: the id of the house, for its open pages.
  readonly peopleChanged = new Subject<string>();

  constructor(private readonly agents: AgentRegistry) {}

  /** Throws when the house's caretaker is offline. */
  open(houseId: string, room: string, opts: Pick<ShellOpen, "command" | "tty">, events: ShellEvents, userId?: string): Shell {
    const shellId = randomUUID();
    this.agents.send(houseId, { type: "shell_open", shellId, room, ...opts });
    const before = this.inRoom(houseId, room).length;
    this.shells.set(shellId, { houseId, room, userId, events });
    if (this.inRoom(houseId, room).length !== before) this.peopleChanged.next(houseId);
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
        this.forget(shellId);
      },
    };
  }

  /** Who has a shell in this room right now: each person once. */
  inRoom(houseId: string, room: string): string[] {
    const here = [...this.shells.values()].filter((s) => s.houseId === houseId && s.room === room && s.userId);
    return [...new Set(here.map((s) => s.userId!))];
  }

  private forget(shellId: string) {
    const shell = this.shells.get(shellId);
    if (!shell) return;
    const before = this.inRoom(shell.houseId, shell.room).length;
    this.shells.delete(shellId);
    if (this.inRoom(shell.houseId, shell.room).length !== before) this.peopleChanged.next(shell.houseId);
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
    this.forget(shellId);
    shell?.events.exit(code, reason);
  }
}
