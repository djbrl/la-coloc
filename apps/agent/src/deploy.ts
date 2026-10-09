// push → live: clone, build, start the new version next to the old one, check it, swap.
import type { DeployCommand, DeployKind, DeployStatus, RoomsSnapshot } from "@coloc/protocol";
import { roomUrl, type AgentConfig } from "./config";
import {
  buildImage,
  docker,
  ensureRoomNetwork,
  imageExposedPorts,
  lastLogs,
  removeContainer,
  roomContainers,
  waitHealthy,
} from "./docker";
import { resolveInside, shallowClone } from "./git";
import { routeTo, unrouteRoom } from "./proxy";
import { LABEL, containerName, resolvePort, roomContainerSpec, roomHost } from "./room-spec";

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
    const tag = `coloc/${cmd.room}:${shortSha}`;
    report({ status: "building", detail: `commit ${shortSha}` });
    const buildLog: string[] = [];
    try {
      await buildImage(resolveInside(checkout.dir, cmd.path), tag, (l) => buildLog.push(l));
    } catch (e) {
      throw new Error(`build failed: ${(e as Error).message}\n${buildLog.slice(-20).join("\n")}`);
    }

    report({ status: "starting" });
    await ensureRoomNetwork(cmd.room, cfg.houseId, cfg.proxyContainer);
    const port = resolvePort(cmd.port, await imageExposedPorts(tag));
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
    const others = (await roomContainers(cmd.room, cmd.kind)).filter((c) => c.Id !== container.id);
    await Promise.all(others.map((c) => removeContainer(c.Id))).catch((e) =>
      console.error(`[deploy] ${cmd.room}: couldn't remove an old version: ${(e as Error).message}`),
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
  const containers = await roomContainers(room);
  await Promise.all(containers.map((c) => removeContainer(c.Id)));
}

export function roomOf(labels: Record<string, string> | undefined): string | undefined {
  return labels?.[LABEL.room];
}

export async function snapshot(cfg: AgentConfig): Promise<RoomsSnapshot["rooms"]> {
  const containers = await docker.listContainers({ all: true, filters: { label: [LABEL.room] } });
  return containers.map((c) => {
    const room = c.Labels[LABEL.room];
    const kind = c.Labels[LABEL.kind] as DeployKind;
    const state = c.State === "running" ? "running" : c.State === "restarting" ? "restarting" : "stopped";
    return { room, kind, state, url: roomUrl(cfg, roomHost(room, kind, cfg.houseDomain)) };
  });
}
