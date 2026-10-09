import { Injectable } from "@nestjs/common";
import type { DeployKind, Logs } from "@coloc/protocol";
import { randomUUID } from "node:crypto";
import { AgentRegistry } from "./agent.registry";

const TIMEOUT_MS = 8000;

// Asking an agent for a room's logs is a question over a one-way line: send a request with an id, wait for the
// reply carrying the same id. Replies from another house, or that come too late, are ignored.
@Injectable()
export class LogsBroker {
  private pending = new Map<string, { houseId: string; resolve: (t: string) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();

  constructor(private readonly agents: AgentRegistry) {}

  fetch(houseId: string, room: string, kind: DeployKind, lines: number): Promise<string> {
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error("The house's server didn't answer in time."));
      }, TIMEOUT_MS);
      this.pending.set(requestId, { houseId, resolve, reject, timer });
      try {
        this.agents.send(houseId, { type: "get_logs", requestId, room, kind, lines });
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(e as Error);
      }
    });
  }

  deliver(houseId: string, msg: Logs) {
    const p = this.pending.get(msg.requestId);
    if (!p || p.houseId !== houseId) return;
    clearTimeout(p.timer);
    this.pending.delete(msg.requestId);
    if (msg.error) p.reject(new Error(msg.error));
    else p.resolve(msg.text);
  }
}
