import type { ApiToAgent } from "@coloc/protocol";
import { mkdir } from "node:fs/promises";
import { batched } from "./batch";
import { Builds } from "./builds";
import { loadConfig } from "./config";
import { deploy, inspect, removePreview, removeRoom, restartRoom, roomLogs, snapshot } from "./deploy";
import { watchRoomEvents } from "./events";
import { connect } from "./link";
import { lookInside, setAddress } from "./inside";
import { sampleRooms } from "./meter";
import { backToProject, syncRoutes } from "./proxy";
import { Shells } from "./shell";

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

  // Being built or waiting its turn: told to the API whenever the link opens, and what cancel_build stops.
  const builds = new Builds();

  const sendSnapshot = async () => {
    try {
      link.send({ type: "rooms_snapshot", rooms: await snapshot(cfg) });
    } catch (e) {
      console.error(`[snapshot] ${(e as Error).message}`);
    }
  };

  const link = connect(cfg, VERSION, (cmd: ApiToAgent) => {
    switch (cmd.type) {
      // Not queued: a shell lasts as long as someone keeps typing, and a build mustn't wait for it (or the other way round).
      case "shell_open":
        console.log(`[shell] ${cmd.room}: opened`);
        void shells.start(cmd);
        break;
      case "shell_input":
        shells.input(cmd.shellId, cmd.data);
        break;
      case "shell_eof":
        shells.eof(cmd.shellId);
        break;
      case "shell_resize":
        shells.resize(cmd.shellId, cmd.cols, cmd.rows);
        break;
      case "shell_ack":
        shells.ack(cmd.shellId, cmd.bytes);
        break;
      case "shell_close":
        void shells.close(cmd.shellId);
        break;
      case "deploy": {
        console.log(`[deploy] ${cmd.room} ${cmd.kind} ${cmd.ref ?? "default branch"}`);
        const signal = builds.add(cmd.deployId, cmd.room, cmd.kind);
        enqueue(cmd.room, () => {
          const log = batched((lines) => link.send({ type: "deploy_log", deployId: cmd.deployId, room: cmd.room, lines }));
          return deploy(
            cfg,
            cmd,
            (s) => {
              console.log(`[deploy] ${cmd.room}: ${s.status}${s.detail ? ` (${s.detail.split("\n")[0]})` : ""}`);
              // The log's last lines first: the window stops asking once a build is over.
              log.flush();
              link.send({ type: "deploy_status", deployId: cmd.deployId, room: cmd.room, ...s });
            },
            log.add,
            signal,
          ).finally(() => builds.done(cmd.deployId));
        });
        break;
      }
      case "cancel_build":
        // Not queued: the queue is what it has to get past.
        console.log(`[deploy] ${cmd.room}: cancelling ${builds.cancel(cmd.room)} build(s)`);
        break;
      case "remove_room":
        enqueue(cmd.room, () => removeRoom(cfg, cmd.room));
        break;
      case "remove_preview":
        enqueue(cmd.room, () => removePreview(cfg, cmd.room));
        break;
      case "restart_room":
        console.log(`[restart] ${cmd.room}`);
        enqueue(cmd.room, () => restartRoom(cfg, cmd.room).catch((e) => console.error(`[restart] ${cmd.room}: ${e.message}`)));
        break;
      case "inspect":
        // In the room's queue, so it never races a build of the same room for the disk.
        enqueue(cmd.room, () =>
          inspect(cfg, cmd.repo, cmd.ref, cmd.path)
            .then((findings) => link.send({ type: "inspected", requestId: cmd.requestId, findings }))
            .catch((e) => link.send({ type: "inspected", requestId: cmd.requestId, error: (e as Error).message })),
        );
        break;
      case "get_logs":
        // Not queued: reading logs never waits behind a build.
        roomLogs(cfg, cmd.room, cmd.kind, cmd.lines)
          .then((text) => link.send({ type: "logs", requestId: cmd.requestId, room: cmd.room, text }))
          .catch((e) => link.send({ type: "logs", requestId: cmd.requestId, room: cmd.room, text: "", error: (e as Error).message }));
        break;
      case "look_inside":
        // Not queued, like the logs.
        lookInside(cfg, cmd.room)
          .catch(() => ({ error: "failed" as const }))
          .then((found) => link.send({ type: "inside", requestId: cmd.requestId, room: cmd.room, ...found }));
        break;
      case "set_address":
        // In the room's queue: it writes the same route a deploy swaps.
        console.log(`[address] ${cmd.room}: port ${cmd.port}`);
        enqueue(cmd.room, () =>
          setAddress(cfg, cmd.room, cmd.port)
            .catch(() => ({ error: "failed" as const }))
            .then((found) => link.send({ type: "inside", requestId: cmd.requestId, room: cmd.room, ...found })),
        );
        break;
    }
  }, () => {
    // A new line: the API has forgotten every shell from before it.
    shells.closeAll();
    void sendSnapshot();
  }, () => builds.ids());
  const shells = new Shells(cfg.houseId, (m) => link.send(m));
  void shells.sweep();

  await watchRoomEvents(cfg.houseId, (e) => {
    console.log(`[event] ${e.room}: ${e.event}`);
    link.send(e);
    // It started over: what someone started by hand is gone, so the address goes back to what starts by itself.
    if (e.event === "oom" || e.event === "restarted") void backToProject(cfg, e.room).catch(() => undefined);
  });

  setInterval(async () => {
    try {
      link.send({ type: "usage", at: new Date().toISOString(), samples: await sampleRooms(cfg.houseId) });
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
