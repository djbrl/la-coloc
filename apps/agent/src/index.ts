import type { ApiToAgent } from "@coloc/protocol";
import { mkdir } from "node:fs/promises";
import { loadConfig } from "./config";
import { deploy, removePreview, removeRoom, restartRoom, roomLogs, snapshot } from "./deploy";
import { watchRoomEvents } from "./events";
import { connect } from "./link";
import { sampleRooms } from "./meter";
import { syncRoutes } from "./proxy";

const VERSION = "0.1.0";

async function main() {
  const cfg = loadConfig();
  await mkdir(cfg.workDir, { recursive: true });
  // The routing table must match what's running before visitors arrive.
  await syncRoutes(cfg);

  // One command at a time per room, so two deploys of the same room never race.
  const queues = new Map<string, Promise<void>>();
  const enqueue = (room: string, job: () => Promise<void>) => {
    const next = (queues.get(room) ?? Promise.resolve()).then(job, job);
    queues.set(room, next.catch(() => undefined));
  };

  const sendSnapshot = async () => {
    try {
      link.send({ type: "rooms_snapshot", rooms: await snapshot(cfg) });
    } catch (e) {
      console.error(`[snapshot] ${(e as Error).message}`);
    }
  };

  const link = connect(cfg, VERSION, (cmd: ApiToAgent) => {
    switch (cmd.type) {
      case "deploy":
        console.log(`[deploy] ${cmd.room} ${cmd.kind} ${cmd.ref}`);
        enqueue(cmd.room, () =>
          deploy(cfg, cmd, (s) => {
            console.log(`[deploy] ${cmd.room}: ${s.status}${s.detail ? ` (${s.detail.split("\n")[0]})` : ""}`);
            link.send({ type: "deploy_status", deployId: cmd.deployId, room: cmd.room, ...s });
          }),
        );
        break;
      case "remove_room":
        enqueue(cmd.room, () => removeRoom(cfg, cmd.room));
        break;
      case "remove_preview":
        enqueue(cmd.room, () => removePreview(cfg, cmd.room));
        break;
      case "restart_room":
        console.log(`[restart] ${cmd.room}`);
        enqueue(cmd.room, () => restartRoom(cmd.room).catch((e) => console.error(`[restart] ${cmd.room}: ${e.message}`)));
        break;
      case "get_logs":
        // Not queued: reading logs never waits behind a build.
        roomLogs(cmd.room, cmd.kind, cmd.lines)
          .then((text) => link.send({ type: "logs", requestId: cmd.requestId, room: cmd.room, text }))
          .catch((e) => link.send({ type: "logs", requestId: cmd.requestId, room: cmd.room, text: "", error: (e as Error).message }));
        break;
    }
  }, () => void sendSnapshot());

  await watchRoomEvents((e) => {
    console.log(`[event] ${e.room}: ${e.event}`);
    link.send(e);
  });

  setInterval(async () => {
    try {
      link.send({ type: "usage", at: new Date().toISOString(), samples: await sampleRooms() });
    } catch (e) {
      console.error(`[meter] ${(e as Error).message}`);
    }
  }, cfg.usageIntervalMs).unref();

  const stop = () => {
    link.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  console.log(`[agent] house ${cfg.houseId}, rooms at *.${cfg.houseDomain}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
