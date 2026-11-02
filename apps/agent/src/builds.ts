// The builds this caretaker is on or has waiting, each with the switch that stops it. A room's real builds can be
// cancelled by its name; a pull request's preview in the same room isn't what the room page shows, so it carries on.
import type { DeployKind } from "@coloc/protocol";

export class Builds {
  private running = new Map<string, { room: string; kind: DeployKind; stop: AbortController }>();

  /** A new build. The signal it gets is what deploy() watches. */
  add(deployId: string, room: string, kind: DeployKind): AbortSignal {
    const stop = new AbortController();
    this.running.set(deployId, { room, kind, stop });
    return stop.signal;
  }

  done(deployId: string): void {
    this.running.delete(deployId);
  }

  ids(): string[] {
    return [...this.running.keys()];
  }

  /** Stops the room's real builds, running or waiting. Answers how many. */
  cancel(room: string): number {
    const found = [...this.running.values()].filter((b) => b.room === room && b.kind === "prod");
    for (const b of found) b.stop.abort();
    return found.length;
  }
}
