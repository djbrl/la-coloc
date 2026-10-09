// The walls of a room. Pure functions, so the isolation rules are readable and tested in one place.
import type Docker from "dockerode";
import type { DeployKind, RoomLimits } from "@coloc/protocol";

export const LABEL = {
  house: "coloc.house",
  room: "coloc.room",
  kind: "coloc.kind",
  deploy: "coloc.deploy",
  port: "coloc.port",
} as const;

export function roomNetwork(room: string): string {
  return `coloc-room-${room}`;
}

// Previews get a single-level subdomain (preview-jib.house.domain) so one wildcard
// certificate per house covers every room and every preview.
export function roomHost(room: string, kind: DeployKind, houseDomain: string): string {
  return kind === "prod" ? `${room}.${houseDomain}` : `preview-${room}.${houseDomain}`;
}

export interface RoomContainerInput {
  houseId: string;
  room: string;
  kind: DeployKind;
  deployId: string;
  image: string;
  port: number;
  limits: RoomLimits;
  env: Record<string, string>;
  houseDomain: string;
  readOnlyRootfs?: boolean;
}

export function containerName(room: string, kind: DeployKind, deployId: string): string {
  return `coloc-${room}-${kind}-${deployId}`;
}

export function roomContainerSpec(i: RoomContainerInput): Docker.ContainerCreateOptions {
  const network = roomNetwork(i.room);
  const memoryBytes = i.limits.memoryMb * 1024 * 1024;

  return {
    name: containerName(i.room, i.kind, i.deployId),
    Image: i.image,
    Env: [...Object.entries(i.env).map(([k, v]) => `${k}=${v}`), `PORT=${i.port}`],
    // No routing labels: the agent tells the proxy where to send visitors (see roomRoute), so the
    // proxy never needs the Docker socket.
    Labels: {
      [LABEL.house]: i.houseId,
      [LABEL.room]: i.room,
      [LABEL.kind]: i.kind,
      [LABEL.deploy]: i.deployId,
      [LABEL.port]: String(i.port),
    },
    HostConfig: {
      // Fixed room size. Memory = swap so a hungry app can't spill onto disk either.
      Memory: memoryBytes,
      MemorySwap: memoryBytes,
      NanoCpus: Math.round(i.limits.cpus * 1e9),
      // A fork bomb hits this ceiling instead of the house's.
      PidsLimit: 256,
      // No Linux capabilities at all, and no way to gain new privileges (setuid binaries etc).
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges:true"],
      Privileged: false,
      ReadonlyRootfs: i.readOnlyRootfs ?? true,
      Tmpfs: { "/tmp": "rw,noexec,nosuid,size=64m" },
      // Its own network: other rooms can't reach it, only the proxy can.
      NetworkMode: network,
      // An app that runs out of memory restarts on its own, alone.
      RestartPolicy: { Name: "unless-stopped" },
      // Logs can't fill the house's disk.
      LogConfig: { Type: "json-file", Config: { "max-size": "10m", "max-file": "3" } },
    },
  };
}

/**
 * The proxy's route for one room: visitors to its host name go to exactly one container, reached by
 * name on the room's network. Swapping versions = rewriting this to point at the new container
 * *before* the old one stops, so no visitor is ever sent to a container that's going away.
 * Returned as plain data; the proxy reads it as YAML (JSON is valid YAML).
 */
export function roomRoute(room: string, kind: DeployKind, houseDomain: string, container: string, port: number) {
  const name = `${room}-${kind}`;
  return {
    http: {
      routers: { [name]: { rule: `Host(\`${roomHost(room, kind, houseDomain)}\`)`, entryPoints: ["web"], service: name } },
      services: { [name]: { loadBalancer: { servers: [{ url: `http://${container}:${port}` }] } } },
    },
  };
}

// Port the app listens on: explicit setting, else the image's first EXPOSE, else 3000.
export function resolvePort(explicit: number | undefined, exposedPorts: Record<string, unknown> | undefined): number {
  if (explicit) return explicit;
  const first = Object.keys(exposedPorts ?? {})[0];
  const parsed = first ? Number(first.split("/")[0]) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 3000;
}
