// Everything the agent asks Docker to do: build images, run rooms, swap versions.
import Docker from "dockerode";
import { readFile } from "node:fs/promises";
import path from "node:path";
import tar from "tar-fs";
import type { DeployKind } from "@coloc/protocol";
import { LABEL, legacyRoomNetwork, roomFilter, roomNetwork } from "./room-spec";

export const docker = new Docker();

// The proxy must sit on every room's network to route to it; rooms never share one with each other.
// `name` is the room's network by default; syncRoutes passes the one an existing container is on.
export async function ensureRoomNetwork(houseId: string, room: string, proxyContainer: string, name = roomNetwork(houseId, room)): Promise<void> {
  const existing = await docker.listNetworks({ filters: { name: [name] } });
  if (!existing.some((n) => n.Name === name)) {
    await docker.createNetwork({ Name: name, Driver: "bridge", Labels: { [LABEL.house]: houseId, [LABEL.room]: room } });
  }
  const proxy = docker.getContainer(proxyContainer);
  const info = await proxy.inspect();
  if (!info.NetworkSettings.Networks[name]) {
    await docker.getNetwork(name).connect({ Container: proxyContainer });
  }
}

// Once a room's last container on its pre-16-Oct network (named after the room only) is gone, that network goes too,
// so they don't pile up. Only a network this house made, and only when nothing but the proxy is left on it.
export async function dropLegacyNetwork(houseId: string, room: string, proxyContainer: string): Promise<void> {
  const name = legacyRoomNetwork(room);
  const found = (await docker.listNetworks({ filters: { name: [name] } })).find((n) => n.Name === name);
  if (!found || found.Labels?.[LABEL.house] !== houseId) return;
  const network = docker.getNetwork(found.Id);
  const info = await network.inspect();
  const containers = Object.values((info.Containers ?? {}) as Record<string, { Name: string }>);
  if (containers.some((c) => c.Name !== proxyContainer)) return;
  await network.disconnect({ Container: proxyContainer, Force: true }).catch(() => undefined);
  await network.remove();
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
export async function buildImage(contextDir: string, tag: string, onLine: (line: string) => void): Promise<void> {
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
    forcerm: true,
    memory: 2 * 1024 * 1024 * 1024,
    cpuperiod: 100_000,
    cpuquota: 100_000,
  } as Docker.ImageBuildOptions);

  await new Promise<void>((resolve, reject) => {
    docker.modem.followProgress(
      stream,
      (err, output: Array<{ error?: string }>) => {
        const failed = err ?? output.find((o) => o.error)?.error;
        failed ? reject(new Error(String(failed))) : resolve();
      },
      (event: { stream?: string; error?: string }) => {
        const line = (event.stream ?? event.error ?? "").trim();
        if (line) onLine(line);
      },
    );
  });
}

export async function imageExposedPorts(tag: string): Promise<Record<string, unknown> | undefined> {
  const info = await docker.getImage(tag).inspect();
  return info.Config?.ExposedPorts;
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
export async function waitHealthy(container: Docker.Container, stableMs = 5000, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
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
