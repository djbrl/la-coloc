// push → live: clone, build, start the new version next to the old one, check it, swap.
import { BUILD_CANCELLED, type DeployCommand, type DeployKind, type DeployStatus, type Findings, type RoomsSnapshot } from "@coloc/protocol";
import { roomUrl, type AgentConfig } from "./config";
import {
  buildImage,
  docker,
  pullImage,
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
import { inspectProject } from "./inspect";
import { routeTo, unroute, unrouteRoom } from "./proxy";
import { ensureDockerfile } from "./recipe";
import { Slots } from "./slots";
import { LABEL, containerName, resolvePort, roomContainerSpec, roomFilter, roomHost, roomNetworks } from "./room-spec";

type Report = (s: Omit<DeployStatus, "type" | "deployId" | "room">) => void;
// A build's lines, for the log window (they're batched on their way out: batch.ts).
type Say = (lines: string[]) => void;

// One build at a time for the whole house, unless COLOC_BUILD_SLOTS says more (see slots.ts).
const builds = new Slots(Math.max(1, Number(process.env.COLOC_BUILD_SLOTS) || 1));
// How much of a failed build's output its owner gets to read.
const LOG_LINES = 200;
// A room's source can be someone's own image instead of a repo: docker://ghcr.io/you/app:1.2
const IMAGE = "docker://";
export const imageOf = (source: string) => {
  if (!source.startsWith(IMAGE)) return null;
  const ref = source.slice(IMAGE.length);
  if (!/^[a-z0-9][a-z0-9._\-/:@]{0,250}$/.test(ref)) throw new Error(`not an image name: ${ref}`);
  return ref;
};

// `signal`: someone cancelled it (cancel_build). Whatever step it's on stops, and it ends as failed with BUILD_CANCELLED.
export async function deploy(cfg: AgentConfig, cmd: DeployCommand, report: Report, say: Say = () => undefined, signal?: AbortSignal): Promise<void> {
  report({ status: "cloning" });
  let checkout;
  let image;
  try {
    signal?.throwIfAborted();
    image = imageOf(cmd.repo);
    if (!image) checkout = await shallowClone(cfg.workDir, cmd.repo, cmd.ref, cfg.allowLocalRepos, signal);
  } catch (e) {
    const detail = signal?.aborted ? BUILD_CANCELLED : (e as Error).message;
    say([detail]);
    report({ status: "failed", detail });
    return;
  }
  let newContainerId: string | undefined;
  try {
    const shortSha = checkout?.sha.slice(0, 12);
    const version = checkout ? `commit ${shortSha}` : `image ${image}`;
    const tag = image ?? `coloc/${cfg.houseId}/${cmd.room}:${shortSha}`;
    report({ status: "building", detail: version });
    if (image) {
      await builds.run(() => pullImage(image, (l) => say([l]), signal), signal);
    } else {
      const folder = resolveInside(checkout!.dir, cmd.path);
      // No Dockerfile: we write one for the stacks we know (recipe.ts), or say what's missing.
      await ensureDockerfile(folder);
      const buildLog: string[] = [];
      try {
        await builds.run(() => buildImage(folder, tag, (l) => {
          buildLog.push(l);
          say([l]);
        }, cfg.buildOffline, signal), signal);
      } catch (e) {
        throw new Error(`build failed: ${(e as Error).message}\n${buildLog.slice(-LOG_LINES).join("\n")}`);
      }
    }

    signal?.throwIfAborted();
    report({ status: "starting" });
    const networks = roomNetworks(cfg.houseId, cmd.room, !cfg.roomInternet);
    await ensureRoomNetwork(cfg.houseId, cmd.room, cfg.proxyContainer, networks.current);
    const config = await imageConfig(tag);
    const port = resolvePort(cmd.port, config.exposedPorts);
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
      imageUser: config.user,
    });
    const container = await docker.createContainer(spec);
    newContainerId = container.id;
    await container.start();

    try {
      await waitHealthy(container, undefined, undefined, signal);
    } catch (e) {
      const logs = await lastLogs(container).catch(() => "");
      throw new Error(`${(e as Error).message}${logs ? `\n--- last logs ---\n${logs}` : ""}`);
    }

    // The last moment a cancel counts: from here on visitors are sent to the new version.
    signal?.throwIfAborted();
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

    report({ status: "live", url: roomUrl(cfg, roomHost(cmd.room, cmd.kind, cfg.houseDomain)), detail: version });
  } catch (e) {
    // Whatever failed, the previous version keeps running untouched.
    if (newContainerId) await removeContainer(newContainerId).catch(() => undefined);
    const message = signal?.aborted ? BUILD_CANCELLED : (e as Error).message;
    // A failed build's own lines are already in the log; only its first line is news. Anything else is all news.
    say(message.startsWith("build failed") ? message.split("\n").slice(0, 1) : message.split("\n"));
    report({ status: "failed", detail: message });
  } finally {
    await checkout?.cleanup();
  }
}

/** Reads a project without building anything. A checkout of its own, gone straight after. */
export async function inspect(cfg: AgentConfig, repo: string, ref: string | undefined, sub: string): Promise<Findings> {
  const checkout = await shallowClone(cfg.workDir, repo, ref, cfg.allowLocalRepos);
  try {
    const found = await inspectProject(checkout.dir, resolveInside(checkout.dir, sub));
    return { ...found, branch: checkout.branch, sha: checkout.sha.slice(0, 12) };
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
