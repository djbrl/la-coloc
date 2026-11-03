import { Injectable } from "@nestjs/common";
import type { ApiToAgent, DeployKind, DeployLog, Findings, Inside, Inspected, Logs } from "@coloc/protocol";
import { randomUUID } from "node:crypto";
import { AgentRegistry } from "./agent.registry";

const TIMEOUT_MS = 8000;
// Reading a project means cloning it first.
const INSPECT_TIMEOUT_MS = 45_000;
// Moving a room's address waits for the proxy to follow, and for any build in that room to finish its turn.
const ADDRESS_TIMEOUT_MS = 20_000;
// Build logs are kept in memory for the log window, within limits: a failed build's end is also in the database.
const LINES_PER_BUILD = 3000;
const BUILDS_KEPT = 30;

export type InsideFound = Pick<Inside, "inside" | "error">;

// Asking an agent for a room's logs is a question over a one-way line: send a request with an id, wait for the
// reply carrying the same id. Replies from another house, or that come too late, are ignored.
@Injectable()
export class LogsBroker {
  private pending = new Map<string, { houseId: string; resolve: (t: string) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();

  private builds = new Map<string, { lines: string[]; dropped: number }>();

  constructor(private readonly agents: AgentRegistry) {}

  /** A caretaker's next few lines of a build. Past the limit the oldest lines go: the end is what people need. */
  addBuildLines(houseId: string, msg: DeployLog): void {
    const key = `${houseId}/${msg.deployId}`;
    let build = this.builds.get(key);
    if (!build) {
      build = { lines: [], dropped: 0 };
      this.builds.set(key, build);
      if (this.builds.size > BUILDS_KEPT) this.builds.delete(this.builds.keys().next().value!);
    }
    build.lines.push(...msg.lines);
    const over = build.lines.length - LINES_PER_BUILD;
    if (over > 0) {
      build.lines.splice(0, over);
      build.dropped += over;
    }
  }

  /** The lines from number `from` on, and the number to ask from next time. Null: this server has none of that build. */
  buildLines(houseId: string, deployId: string, from: number): { lines: string[]; next: number } | null {
    const build = this.builds.get(`${houseId}/${deployId}`);
    if (!build) return null;
    return { lines: build.lines.slice(Math.max(0, from - build.dropped)), next: build.dropped + build.lines.length };
  }

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

  // Same question-and-answer as the logs. One at a time per room: each one clones the repo on the house's server.
  private inspecting = new Set<string>();
  private inspections = new Map<string, { houseId: string; resolve: (f: Findings) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();

  inspect(houseId: string, room: string, repo: string, ref: string | undefined, path: string): Promise<Findings> {
    const key = `${houseId}/${room}`;
    if (this.inspecting.has(key)) return Promise.reject(new Error("Still reading this project."));
    this.inspecting.add(key);
    const requestId = randomUUID();
    return new Promise<Findings>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.inspections.delete(requestId);
        reject(new Error("The house's server didn't answer in time."));
      }, INSPECT_TIMEOUT_MS);
      this.inspections.set(requestId, { houseId, resolve, reject, timer });
      try {
        this.agents.send(houseId, { type: "inspect", requestId, room, repo, ref, path });
      } catch (e) {
        clearTimeout(timer);
        this.inspections.delete(requestId);
        reject(e as Error);
      }
    }).finally(() => this.inspecting.delete(key));
  }

  deliverFindings(houseId: string, msg: Inspected) {
    const p = this.inspections.get(msg.requestId);
    if (!p || p.houseId !== houseId) return;
    clearTimeout(p.timer);
    this.inspections.delete(msg.requestId);
    if (msg.findings) p.resolve(msg.findings);
    else p.reject(new Error(msg.error ?? "Couldn't read this project."));
  }

  // Same again, for what's inside a room. Two pages open on one room share one look: it runs a script in there.
  private looks = new Map<string, { houseId: string; resolve: (found: InsideFound) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  private looking = new Map<string, Promise<InsideFound>>();

  lookInside(houseId: string, room: string): Promise<InsideFound> {
    const key = `${houseId}/${room}`;
    const under = this.looking.get(key);
    if (under) return under;
    const look = this.askInside(houseId, TIMEOUT_MS, (requestId) => ({ type: "look_inside", requestId, room })).finally(() => this.looking.delete(key));
    this.looking.set(key, look);
    return look;
  }

  setAddress(houseId: string, room: string, port: number): Promise<InsideFound> {
    return this.askInside(houseId, ADDRESS_TIMEOUT_MS, (requestId) => ({ type: "set_address", requestId, room, port }));
  }

  private askInside(houseId: string, ms: number, command: (requestId: string) => ApiToAgent): Promise<InsideFound> {
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.looks.delete(requestId);
        reject(new Error("The house's server didn't answer in time."));
      }, ms);
      this.looks.set(requestId, { houseId, resolve, reject, timer });
      try {
        this.agents.send(houseId, command(requestId));
      } catch (e) {
        clearTimeout(timer);
        this.looks.delete(requestId);
        reject(e as Error);
      }
    });
  }

  deliverInside(houseId: string, msg: Inside) {
    const p = this.looks.get(msg.requestId);
    if (!p || p.houseId !== houseId) return;
    clearTimeout(p.timer);
    this.looks.delete(msg.requestId);
    p.resolve({ inside: msg.inside, error: msg.error });
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
