// Everything the agent asks Docker to do: build images, run rooms, swap versions.
import Docker from "dockerode";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import tar from "tar-fs";
import type { DeployKind } from "@coloc/protocol";
import { LABEL, ROOM_HOME, roomFilter, roomHomeVolume, roomNetwork } from "./room-spec";

export const docker = new Docker();

// The proxy must sit on every room's network to route to it; rooms never share one with each other.
// `name` is the room's network by default; syncRoutes passes the one an existing container is on. A sealed network
// (coloc-sealed-…) is internal: no way out, the laptop included.
export async function ensureRoomNetwork(houseId: string, room: string, proxyContainer: string, name = roomNetwork(houseId, room)): Promise<void> {
  const existing = await docker.listNetworks({ filters: { name: [name] } });
  if (!existing.some((n) => n.Name === name)) {
    const Internal = name.startsWith("coloc-sealed-");
    await docker.createNetwork({ Name: name, Driver: "bridge", Internal, Labels: { [LABEL.house]: houseId, [LABEL.room]: room } });
  }
  const proxy = docker.getContainer(proxyContainer);
  const info = await proxy.inspect();
  if (!info.NetworkSettings.Networks[name]) {
    await docker.getNetwork(name).connect({ Container: proxyContainer });
  }
}

// Once a room's last container on an older network is gone (one named after the room only, from before 16 Oct, or
// the other kind, sealed or open, from before a house changed its mind), that network goes too, so they don't pile
// up. Only a network this house made, and only when nothing but the proxy is left on it.
export async function dropOldNetworks(houseId: string, names: string[], proxyContainer: string): Promise<void> {
  for (const name of names) await dropNetwork(houseId, name, proxyContainer);
}

async function dropNetwork(houseId: string, name: string, proxyContainer: string): Promise<void> {
  const found = (await docker.listNetworks({ filters: { name: [name] } })).find((n) => n.Name === name);
  if (!found || found.Labels?.[LABEL.house] !== houseId) return;
  const network = docker.getNetwork(found.Id);
  const info = await network.inspect();
  const containers = Object.values((info.Containers ?? {}) as Record<string, { Name: string }>);
  if (containers.some((c) => c.Name !== proxyContainer)) return;
  await network.disconnect({ Container: proxyContainer, Force: true }).catch(() => undefined);
  await network.remove();
}

/** Whether root in a container is an ordinary user on this machine. It can't change while Docker runs. */
let remapped: Promise<boolean> | undefined;
export function rootIsRemapped(): Promise<boolean> {
  remapped ??= docker.info().then((i: { SecurityOptions?: string[] }) => !!i.SecurityOptions?.some((o) => o.includes("name=userns")));
  return remapped;
}

/** The volume someone's kept files live in, limited to a size. Docker only applies a size when a volume is created. */
export async function ensureRoomHome(houseId: string, room: string, occupant: string, sizeMb: number): Promise<string> {
  const name = roomHomeVolume(houseId, room, occupant);
  const exists = await docker.getVolume(name).inspect().then(() => true, () => false);
  if (!exists) await docker.createVolume({ Name: name, DriverOpts: { size: `${sizeMb}m` }, Labels: { [LABEL.house]: houseId, [LABEL.room]: room } });
  return name;
}

/** A new volume belongs to root: this lets any user write in it, as in /tmp, before the app first starts. */
export async function openRoomHome(container: Docker.Container): Promise<void> {
  const empty = await mkdtemp(path.join(tmpdir(), "coloc-home-"));
  try {
    const archive = tar.pack(empty, { map: (h) => ({ ...h, name: ROOM_HOME.slice(1), mode: 0o1777, uid: 0, gid: 0 }) });
    await container.putArchive(archive as unknown as NodeJS.ReadableStream, { path: "/" });
  } finally {
    await rm(empty, { recursive: true, force: true });
  }
}

/** The room is free: nothing of its last occupant stays on the machine. */
export async function removeRoomHomes(houseId: string, room: string): Promise<void> {
  const { Volumes } = await docker.listVolumes({ filters: { label: [`${LABEL.house}=${houseId}`, `${LABEL.room}=${room}`] } });
  await Promise.all((Volumes ?? []).map((v) => docker.getVolume(v.Name).remove()));
}

async function dockerignore(dir: string): Promise<string[]> {
  try {
    const raw = await readFile(path.join(dir, ".dockerignore"), "utf8");
    return raw
      .split("\n")
      .map((l) => l.trim().replace(/^\.\//, "").replace(/\/$/, ""))
      .filter((l) => l && !l.startsWith("#") && !l.startsWith("!"));
  } catch {
    return [];
  }
}

// Builds an image from a folder. Builds are capped too, so a heavy build can't starve the rooms.
// Docker's colours arrive as escape codes: a person reading the log only wants the words. A very long line is cut.
export function cleanLines(chunk: string): string[] {
  return chunk
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
    .split("\n")
    .map((l) => l.trimEnd().slice(0, 2000))
    .filter((l) => l.trim());
}

// With a signal, aborting it hangs up on Docker, which stops the build when its client goes away.
export async function buildImage(contextDir: string, tag: string, onLine: (line: string) => void, offline = false, signal?: AbortSignal): Promise<void> {
  const ignored = new Set([".git", ...(await dockerignore(contextDir))]);
  const context = tar.pack(contextDir, {
    ignore: (name) => {
      const rel = path.relative(contextDir, name);
      return [...ignored].some((p) => rel === p || rel.startsWith(p + path.sep));
    },
  });
  // tar-fs's Pack is a Node stream; its types just don't line up with dockerode's.
  const stream = await docker.buildImage(context as unknown as NodeJS.ReadableStream, {
    t: tag,
    // Offline builds (COLOC_BUILD_OFFLINE=1) can't reach anything, the laptop included; most real Dockerfiles need
    // the internet to install packages, so it's the house's choice.
    ...(offline ? { networkmode: "none" } : {}),
    forcerm: true,
    memory: 2 * 1024 * 1024 * 1024,
    cpuperiod: 100_000,
    cpuquota: 100_000,
    ...(signal ? { abortSignal: signal } : {}),
  } as Docker.ImageBuildOptions);

  await new Promise<void>((resolve, reject) => {
    signal?.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
    docker.modem.followProgress(
      stream,
      (err, output: Array<{ error?: string }>) => {
        const failed = err ?? output.find((o) => o.error)?.error;
        failed ? reject(new Error(String(failed))) : resolve();
      },
      (event: { stream?: string; error?: string }) => {
        for (const line of cleanLines(event.stream ?? event.error ?? "")) onLine(line);
      },
    );
  });
}

// Someone's own image. Docker can't be told a size limit before pulling, so a too-big one is thrown away right after.
const MAX_IMAGE_BYTES = 2 * 1024 * 1024 * 1024;
export async function pullImage(ref: string, onLine: (line: string) => void, signal?: AbortSignal): Promise<void> {
  const stream = (await docker.pull(ref, signal ? { abortSignal: signal } : {})) as NodeJS.ReadableStream;
  // Why a pull failed comes as one more line in its stream, and the stream still ends normally.
  let refused: string | undefined;
  await new Promise<void>((resolve, reject) => {
    signal?.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
    docker.modem.followProgress(
      stream,
      (err) => (err ? reject(err) : refused ? reject(new Error(refused)) : resolve()),
      // Layer-by-layer progress is noise: only the lines that say something.
      (event: { status?: string; id?: string; progress?: string; error?: string }) => {
        refused = event.error ?? refused;
        if (event.status && !event.id && !event.progress) onLine(event.status);
      },
    );
  });
  const info = await docker.getImage(ref).inspect();
  if (info.Size > MAX_IMAGE_BYTES) {
    await docker.getImage(ref).remove().catch(() => undefined);
    throw new Error(`this image is too big: ${Math.round(info.Size / 1024 / 1024)} MB, and a room takes 2 GB at most.`);
  }
}

export async function imageConfig(tag: string): Promise<{ exposedPorts?: Record<string, unknown>; user?: string }> {
  const info = await docker.getImage(tag).inspect();
  return { exposedPorts: info.Config?.ExposedPorts, user: info.Config?.User };
}

// This house's containers for one room. Another caretaker on the same machine may have a room with the same name.
export async function roomContainers(houseId: string, room: string, kind?: DeployKind): Promise<Docker.ContainerInfo[]> {
  return docker.listContainers({ all: true, filters: { label: roomFilter(houseId, room, kind) } });
}

export async function lastLogs(container: Docker.Container, lines = 40): Promise<string> {
  const buf = (await container.logs({ stdout: true, stderr: true, tail: lines })) as unknown as Buffer;
  // Docker multiplexes stdout/stderr with 8-byte frame headers; strip them for humans.
  const out: string[] = [];
  let i = 0;
  while (i + 8 <= buf.length) {
    const size = buf.readUInt32BE(i + 4);
    out.push(buf.subarray(i + 8, i + 8 + size).toString("utf8"));
    i += 8 + size;
  }
  return (out.length ? out.join("") : buf.toString("utf8")).trim();
}

/**
 * A new version counts as healthy if it stays up for `stableMs` without restarting, and,
 * when the image defines a HEALTHCHECK, once Docker reports it healthy.
 */
export async function waitHealthy(container: Docker.Container, stableMs = 5000, timeoutMs = 60_000, signal?: AbortSignal): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    signal?.throwIfAborted();
    const info = await container.inspect();
    const s = info.State;
    if (s.OOMKilled) throw new Error("ran out of memory while starting");
    if (info.RestartCount > 0) throw new Error("crashed and restarted while starting");
    if (!s.Running && !s.Restarting && s.ExitCode !== 0) throw new Error(`exited with code ${s.ExitCode}`);
    const health = s.Health?.Status;
    if (health === "unhealthy") throw new Error("health check failed");
    const upFor = s.Running ? Date.now() - new Date(s.StartedAt).getTime() : 0;
    if (s.Running && upFor >= stableMs && (!health || health === "healthy")) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("did not become healthy in time");
}

// Containers the agent is retiring on purpose, so their "die" event isn't reported as a crash.
export const retiring = new Set<string>();

export async function removeContainer(id: string): Promise<void> {
  retiring.add(id);
  setTimeout(() => retiring.delete(id), 60_000).unref();
  const c = docker.getContainer(id);
  try {
    await c.stop({ t: 10 });
  } catch {
    // already stopped
  }
  await c.remove({ force: true });
}
