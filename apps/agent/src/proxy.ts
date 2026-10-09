// The front door's routing table. The agent writes one small file per room into a folder the proxy
// (Traefik) watches, so the proxy needs no access to Docker at all.
import type { DeployKind } from "@coloc/protocol";
import type Docker from "dockerode";
import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentConfig } from "./config";
import { docker, ensureRoomNetwork } from "./docker";
import { LABEL, roomRoute } from "./room-spec";

function routeFile(cfg: AgentConfig, room: string, kind: DeployKind): string {
  return path.join(cfg.proxyConfigDir, `${room}-${kind}.yml`);
}

/** Points a room's host name at one container, then waits for the proxy to pick it up. */
export async function routeTo(cfg: AgentConfig, room: string, kind: DeployKind, container: string, port: number): Promise<void> {
  await mkdir(cfg.proxyConfigDir, { recursive: true });
  const file = routeFile(cfg, room, kind);
  // Write then rename, so the proxy never reads a half-written file. The temp name doesn't end in
  // .yml, so the proxy ignores it.
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(roomRoute(room, kind, cfg.houseDomain, container, port), null, 2));
  await rename(tmp, file);
  await new Promise((r) => setTimeout(r, cfg.routeSettleMs));
}

export async function unroute(cfg: AgentConfig, room: string, kind: DeployKind): Promise<void> {
  await rm(routeFile(cfg, room, kind), { force: true });
}

export async function unrouteRoom(cfg: AgentConfig, room: string): Promise<void> {
  await Promise.all((["prod", "preview"] as const).map((kind) => rm(routeFile(cfg, room, kind), { force: true })));
}

/**
 * Rebuilds the routing table from what's actually running, newest container per room wins, and plugs
 * the proxy back into every room's network. Runs when the agent starts, so a lost or stale folder,
 * or a recreated proxy container, heals itself.
 */
export async function syncRoutes(cfg: AgentConfig): Promise<void> {
  await mkdir(cfg.proxyConfigDir, { recursive: true });
  const running = await docker.listContainers({ filters: { label: [LABEL.room], status: ["running"] } });
  const newest = new Map<string, Docker.ContainerInfo>();
  for (const c of running) {
    const key = `${c.Labels[LABEL.room]}-${c.Labels[LABEL.kind]}`;
    if (!newest.has(key) || newest.get(key)!.Created < c.Created) newest.set(key, c);
  }

  const wanted = new Set<string>();
  for (const [key, c] of newest) {
    const room = c.Labels[LABEL.room];
    const kind = c.Labels[LABEL.kind] as DeployKind;
    const port = Number(c.Labels[LABEL.port]);
    // Containers from before routing moved to files have no port label; their next deploy fixes them.
    if (!port) continue;
    await ensureRoomNetwork(room, cfg.houseId, cfg.proxyContainer);
    wanted.add(`${key}.yml`);
    const route = roomRoute(room, kind, cfg.houseDomain, c.Names[0].replace(/^\//, ""), port);
    await writeFile(routeFile(cfg, room, kind), JSON.stringify(route, null, 2));
  }
  for (const f of await readdir(cfg.proxyConfigDir)) {
    if (!wanted.has(f)) await rm(path.join(cfg.proxyConfigDir, f), { force: true });
  }
}

