// push → live: clone, build, start the new version next to the old one, check it, swap.
import type { DeployCommand, DeployStatus } from "@coloc/protocol";
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
import { LABEL, resolvePort, roomContainerSpec, roomHost } from "./room-spec";

type Report = (s: Omit<DeployStatus, "type" | "deployId" | "room">) => void;

export async function deploy(cfg: AgentConfig, cmd: DeployCommand, report: Report): Promise<void> {
  report({ status: "cloning" });
  const checkout = await shallowClone(cfg.workDir, cmd.repo, cmd.ref);
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

    // The new version is up and Traefik already routes to it: retire the old ones.
    const others = (await roomContainers(cmd.room, cmd.kind)).filter((c) => c.Id !== container.id);
    await Promise.all(others.map((c) => removeContainer(c.Id)));

    report({ status: "live", url: roomUrl(cfg, roomHost(cmd.room, cmd.kind, cfg.houseDomain)), detail: `commit ${shortSha}` });
  } catch (e) {
    // Whatever failed, the previous version keeps running untouched.
    if (newContainerId) await removeContainer(newContainerId).catch(() => undefined);
    report({ status: "failed", detail: (e as Error).message });
  } finally {
    await checkout.cleanup();
  }
}

export async function removeRoom(room: string): Promise<void> {
  const containers = await roomContainers(room);
  await Promise.all(containers.map((c) => removeContainer(c.Id)));
}

export function roomOf(labels: Record<string, string> | undefined): string | undefined {
  return labels?.[LABEL.room];
}
