// Listens to Docker for things that happen to rooms on their own (out of memory, crashes)
// and turns them into room events. They become fridge notes on the house page.
import type { RoomEvent } from "@coloc/protocol";
import { docker, retiring } from "./docker";
import { LABEL } from "./room-spec";

interface DockerEvent {
  Action: string;
  Actor: { ID: string; Attributes: Record<string, string> };
  time: number;
}

export async function watchRoomEvents(onEvent: (e: RoomEvent) => void): Promise<() => void> {
  const stream = (await docker.getEvents({
    filters: { type: ["container"], event: ["oom", "die", "start"], label: [LABEL.room] },
  })) as NodeJS.ReadableStream & { destroy: () => void };

  const crashed = new Set<string>();
  // An out-of-memory kill is followed by "die" and "start"; the oom event already tells the whole story.
  const oomed = new Set<string>();
  let buffer = "";
  stream.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let ev: DockerEvent;
      try {
        ev = JSON.parse(line) as DockerEvent;
      } catch {
        console.error(`[events] skipped an unreadable Docker event`);
        continue;
      }
      const room = ev.Actor.Attributes[LABEL.room];
      const name = ev.Actor.Attributes.name;
      // Containers retired during a swap also "die"; only report rooms dying on their own.
      if (!room || retiring.has(ev.Actor.ID)) continue;
      const at = new Date(ev.time * 1000).toISOString();
      if (ev.Action === "oom") {
        oomed.add(name);
        onEvent({ type: "room_event", room, event: "oom", at });
      }
      if (ev.Action === "start" && oomed.delete(name)) continue;
      if (ev.Action === "die" && oomed.has(name)) continue;
      if (ev.Action === "die" && ev.Actor.Attributes.exitCode !== "0") {
        crashed.add(name);
        onEvent({ type: "room_event", room, event: "crashed", at });
      }
      if (ev.Action === "start" && crashed.delete(name)) onEvent({ type: "room_event", room, event: "restarted", at });
    }
  });
  return () => stream.destroy();
}
