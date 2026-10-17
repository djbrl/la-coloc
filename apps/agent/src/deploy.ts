// push → live: clone, build, start the new version next to the old one, check it, swap.
import type { DeployCommand, DeployKind, DeployStatus, RoomsSnapshot } from "@coloc/protocol";
import { roomUrl, type AgentConfig } from "./config";
import {
  buildImage,
  docker,
  dropOldNetworks,
  ensureRoomNetwork,
  imageConfig,
  lastLogs,
  removeContainer,
  retiring,
  roomContainers,
  waitHealthy,
} from "./docker";
import { resolveInside, shallowClone } from "./git";
import { routeTo, unroute, unrouteRoom } from "./proxy";
import { LABEL, containerName, resolvePort, roomContainerSpec, roomFilter, roomHost, roomNetworks } from "./room-spec";

type Report = (s: Omit<DeployStatus, "type" | "deployId" | "room">) => void;

export async function deploy(cfg: AgentConfig, cmd: DeployCommand, report: Report): Promise<void> {
  report({ status: "cloning" });
  let checkout;
  try {
    checkout = await shallowClone(cfg.workDir, cmd.repo, cmd.ref, cfg.allowLocalRepos);
  } catch (e) {
    report({ status: "failed", detail: (e as Error).message });
    return;
  }
  let newContainerId: string | undefined;
  try {
    const shortSha = checkout.sha.slice(0, 12);
    const tag = `coloc/${cfg.houseId}/${cmd.room}:${shortSha}`;
    report({ status: "building", detail: `commit ${shortSha}` });
    const buildLog: string[] = [];
    try {
      await buildImage(resolveInside(checkout.dir, cmd.path), tag, (l) => buildLog.push(l), cfg.buildOffline);
    } catch (e) {
      throw new Error(`build failed: ${(e as Error).message}\n${buildLog.slice(-20).join("\n")}`);
    }

    report({ status: "starting" });
    const networks = roomNetworks(cfg.houseId, cmd.room, !cfg.roomInternet);
    await ensureRoomNetwork(cfg.houseId, cmd.room, cfg.proxyContainer, networks.current);
    const image = await imageConfig(tag);
    const port = resolvePort(cmd.port, image.exposedPorts);
    const spec = roomContainerSpec({
      houseId: cfg.houseId,
      room: cmd.room,
      kind: cmd.kind,
      deployId: cmd.deployId,
      image: tag,
      port,
      limits: cmd.limits,
      env: cmd.env,
      houseDomain: cfg.houseDomain,
      sealed: !cfg.roomInternet,
      imageUser: image.user,
    });
    const container = await docker.createContainer(spec);
    newContainerId = container.id;
    await container.start();

    try {
      await waitHealthy(container);
    } catch (e) {
      const logs = await lastLogs(container).catch(() => "");
      throw new Error(`${(e as Error).message}${logs ? `\n--- last logs ---\n${logs}` : ""}`);
    }

    // Send visitors to the new version only, and wait for the proxy to follow. Only then retire the
    // old ones: by now nobody is being sent to them.
    await routeTo(cfg, cmd.room, cmd.kind, containerName(cmd.room, cmd.kind, cmd.deployId), port);
    // From here the new version is the one serving: never roll it back, even if cleanup fails.
    newContainerId = undefined;
    const others = (await roomContainers(cfg.houseId, cmd.room, cmd.kind)).filter((c) => c.Id !== container.id);
    await Promise.all(others.map((c) => removeContainer(c.Id))).catch((e) =>
      console.error(`[deploy] ${cmd.room}: couldn't remove an old version: ${(e as Error).message}`),
    );
    await dropOldNetworks(cfg.houseId, networks.old, cfg.proxyContainer).catch((e) =>
      console.error(`[deploy] ${cmd.room}: couldn't remove its old network: ${(e as Error).message}`),
    );

    report({ status: "live", url: roomUrl(cfg, roomHost(cmd.room, cmd.kind, cfg.houseDomain)), detail: `commit ${shortSha}` });
  } catch (e) {
    // Whatever failed, the previous version keeps running untouched.
    if (newContainerId) await removeContainer(newContainerId).catch(() => undefined);
    report({ status: "failed", detail: (e as Error).message });
  } finally {
    await checkout.cleanup();
  }
}

export async function removeRoom(cfg: AgentConfig, room: string): Promise<void> {
  await unrouteRoom(cfg, room);
  const containers = await roomContainers(cfg.houseId, room);
  await Promise.all(containers.map((c) => removeContainer(c.Id)));
  const networks = roomNetworks(cfg.houseId, room, !cfg.roomInternet);
  await dropOldNetworks(cfg.houseId, [networks.current, ...networks.old], cfg.proxyContainer).catch(() => undefined);
}

/** The pull request closed: its preview leaves. The room's real app isn't touched. */
export async function removePreview(cfg: AgentConfig, room: string): Promise<void> {
  await unroute(cfg, room, "preview");
  const previews = await roomContainers(cfg.houseId, room, "preview");
  await Promise.all(previews.map((c) => removeContainer(c.Id)));
}

/** Restarts what runs in a room, without rebuilding. Its stop and start aren't reported as a crash. */
export async function restartRoom(cfg: AgentConfig, room: string): Promise<void> {
  const running = await roomContainers(cfg.houseId, room, "prod");
  for (const c of running) {
    retiring.add(c.Id);
    setTimeout(() => retiring.delete(c.Id), 60_000).unref();
    await docker.getContainer(c.Id).restart({ t: 10 });
  }
}

/** The last lines the room's app printed (stdout and stderr), newest last. */
export async function roomLogs(cfg: AgentConfig, room: string, kind: DeployKind, lines: number): Promise<string> {
  const containers = (await roomContainers(cfg.houseId, room, kind)).sort((a, b) => b.Created - a.Created);
  if (!containers.length) return "";
  const text = await lastLogs(docker.getContainer(containers[0].Id), lines);
  // The protocol caps a reply; keep the end, it's what people want.
  return text.length > 250_000 ? text.slice(-250_000) : text;
}

export async function snapshot(cfg: AgentConfig): Promise<RoomsSnapshot["rooms"]> {
  const containers = await docker.listContainers({ all: true, filters: { label: roomFilter(cfg.houseId) } });
  return containers.map((c) => {
    const room = c.Labels[LABEL.room];
    const kind = c.Labels[LABEL.kind] as DeployKind;
    const state = c.State === "running" ? "running" : c.State === "restarting" ? "restarting" : "stopped";
    return { room, kind, state, url: roomUrl(cfg, roomHost(room, kind, cfg.houseDomain)) };
  });
}
