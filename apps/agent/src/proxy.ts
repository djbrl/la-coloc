// The front door's routing table. The agent writes one small file per room into a folder the proxy
// (Traefik) watches, so the proxy needs no access to Docker at all.
import type { DeployKind } from "@coloc/protocol";
import type Docker from "dockerode";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentConfig } from "./config";
import { docker, ensureRoomNetwork, roomContainers } from "./docker";
import { LABEL, isRoomNetwork, roomFilter, roomRoute } from "./room-spec";

// One file per room, named after the house too: several caretakers may share one proxy folder (in development
// the workshop's runs next to Sacré-Cœur's), and each only ever touches its own files.
function routeFile(cfg: AgentConfig, room: string, kind: DeployKind): string {
  return path.join(cfg.proxyConfigDir, routeName(cfg.houseId, room, kind));
}

function routeName(houseId: string, room: string, kind: DeployKind): string {
  return `${houseId}--${room}-${kind}.yml`;
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

/** The port a room's address leads to right now, and the container it's on. Null: no route, or one this can't read. */
export async function routedTo(cfg: AgentConfig, room: string, kind: DeployKind): Promise<{ container: string; port: number } | null> {
  try {
    const route = JSON.parse(await readFile(routeFile(cfg, room, kind), "utf8")) as { http: { services: Record<string, { loadBalancer: { servers: { url: string }[] } }> } };
    const url = new URL(Object.values(route.http.services)[0].loadBalancer.servers[0].url);
    return { container: url.hostname, port: Number(url.port) };
  } catch {
    return null;
  }
}

/** The room's address goes back to the port its project was deployed on, if something had moved it. */
export async function backToProject(cfg: AgentConfig, room: string): Promise<void> {
  const [c] = (await roomContainers(cfg.houseId, room, "prod")).filter((x) => x.State === "running").sort((a, b) => b.Created - a.Created);
  const port = Number(c?.Labels[LABEL.port]);
  if (!port) return;
  if ((await routedTo(cfg, room, "prod"))?.port !== port) await routeTo(cfg, room, "prod", c.Names[0].replace(/^\//, ""), port);
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
  // Only this house's rooms: another caretaker on the same machine looks after its own.
  const running = await docker.listContainers({ filters: { label: roomFilter(cfg.houseId), status: ["running"] } });
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
    // The network the container is really on: an older one may still be on a network named after the room only.
    const network = c.HostConfig?.NetworkMode;
    await ensureRoomNetwork(cfg.houseId, room, cfg.proxyContainer, isRoomNetwork(network) ? network : undefined);
    wanted.add(routeName(cfg.houseId, room, kind));
    const name = c.Names[0].replace(/^\//, "");
    // Someone pointed the address at another port of this same container: that's still their choice. A new container
    // has a new name, so a deploy ends it by itself.
    const now = await routedTo(cfg, room, kind);
    const route = roomRoute(room, kind, cfg.houseDomain, name, now?.container === name ? now.port : port);
    await writeFile(routeFile(cfg, room, kind), JSON.stringify(route, null, 2));
  }
  // Drop this house's stale files, and any file from before routes were named after their house.
  for (const f of await readdir(cfg.proxyConfigDir)) {
    const ours = f.startsWith(`${cfg.houseId}--`);
    const legacy = !f.includes("--");
    if ((ours && !wanted.has(f)) || legacy) await rm(path.join(cfg.proxyConfigDir, f), { force: true });
  }
}

