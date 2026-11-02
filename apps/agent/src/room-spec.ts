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

// Named after the house too: two caretakers on one machine (in development, the workshop's next to Sacré-Cœur's)
// may each have a room called "jib". Networks made before 16 Oct are named after the room only; containers on one
// keep it until their next deploy (syncRoutes plugs the proxy into whatever network a container is on).
//
// A sealed room (the default) is on an internal network: only the proxy reaches it, and it reaches nothing, not the
// internet and not the machine it runs on (on Docker Desktop, host.docker.internal leads to the laptop's database
// and API). A house that runs bots or apps calling other services opens it with COLOC_ROOM_INTERNET=1; Docker can't
// turn an existing network internal, so the two kinds have different names and a room moves on its next deploy.
export function roomNetwork(houseId: string, room: string, sealed = true): string {
  return `coloc-${sealed ? "sealed" : "room"}-${houseId}--${room}`;
}

export function legacyRoomNetwork(room: string): string {
  return `coloc-room-${room}`;
}

/** Whether a network is one of ours for rooms, of any age or kind. */
export function isRoomNetwork(name: string | undefined): name is string {
  return !!name && (name.startsWith("coloc-room-") || name.startsWith("coloc-sealed-"));
}

/** Every name a room's network has had: the one it should be on now first, then the ones to drop once empty. */
export function roomNetworks(houseId: string, room: string, sealed: boolean): { current: string; old: string[] } {
  const current = roomNetwork(houseId, room, sealed);
  return { current, old: [roomNetwork(houseId, room, !sealed), legacyRoomNetwork(room)] };
}

// On a machine that can't give a room its own limited disk, or where root in a room would be root on the machine: nobody,
// unless the image picked its own user.
export const NOBODY = "65534:65534";

export function runAs(imageUser: string | undefined): string | undefined {
  const u = (imageUser ?? "").trim();
  return !u || u === "root" || u === "0" || u.startsWith("0:") || u.startsWith("root:") ? NOBODY : undefined;
}

// A room on a server that can hold it to a size (deploy/setup.sh): a small Linux machine. Its disk is writable, and root
// inside runs as an ordinary user outside (userns-remap), so most images run as they were written. These few rights only
// hold inside the room: enough to install a package or start nginx, nothing that touches the kernel or the network.
export const ROOM_CAPS = ["CHOWN", "DAC_OVERRIDE", "FOWNER", "SETUID", "SETGID", "KILL", "NET_BIND_SERVICE"];

// What's kept when a new version replaces the old one. Under /home, not over it: an image may keep its app in /home/node.
export const ROOM_HOME = "/home/room";

// Named after who lives there, so the next tenant gets an empty one by construction, even if a lease ended while the
// server was off and nothing has cleared the old one yet.
export function roomHomeVolume(houseId: string, room: string, occupant: string): string {
  return `coloc-home-${houseId}--${room}--${occupant.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12)}`;
}

// Docker label filters for this house's room containers: all of them, one room's, or one room's prod or preview.
// Every container has carried the house label since the first caretaker, so nothing older slips through.
export function roomFilter(houseId: string, room?: string, kind?: DeployKind): string[] {
  const label = [`${LABEL.house}=${houseId}`, room ? `${LABEL.room}=${room}` : LABEL.room];
  if (kind) label.push(`${LABEL.kind}=${kind}`);
  return label;
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
  // This machine can limit a room's disk: writable, up to this size. Without it, read-only, and /tmp in memory.
  diskMb?: number;
  // Named volume kept across versions, mounted at ROOM_HOME.
  homeVolume?: string;
  // Root in a room is an ordinary user on this machine (userns-remap): images keep the user they asked for.
  rootIsSafe?: boolean;
  // Sealed (the default): its network reaches nothing but the proxy. See roomNetwork.
  sealed?: boolean;
  // The user the image asked for (its USER), if any: root or nothing runs as nobody instead.
  imageUser?: string;
}

export function containerName(room: string, kind: DeployKind, deployId: string): string {
  return `coloc-${room}-${kind}-${deployId}`;
}

export function roomContainerSpec(i: RoomContainerInput): Docker.ContainerCreateOptions {
  const network = roomNetwork(i.houseId, i.room, i.sealed ?? true);
  const user = i.diskMb && i.rootIsSafe ? undefined : runAs(i.imageUser);
  const memoryBytes = i.limits.memoryMb * 1024 * 1024;

  return {
    name: containerName(i.room, i.kind, i.deployId),
    Image: i.image,
    Env: [...Object.entries(i.env).map(([k, v]) => `${k}=${v}`), `PORT=${i.port}`],
    ...(user ? { User: user } : {}),
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
      // No Linux capabilities beyond ROOM_CAPS, and no way to gain new privileges (setuid binaries etc).
      CapDrop: ["ALL"],
      ...(i.diskMb && i.rootIsSafe ? { CapAdd: ROOM_CAPS } : {}),
      SecurityOpt: ["no-new-privileges:true"],
      Privileged: false,
      // Full disk: the app gets "no space left" and the neighbours notice nothing.
      ...(i.diskMb
        ? { ReadonlyRootfs: false, StorageOpt: { size: `${i.diskMb}m` } }
        : { ReadonlyRootfs: true, Tmpfs: { "/tmp": "rw,noexec,nosuid,size=64m" } }),
      ...(i.homeVolume ? { Binds: [`${i.homeVolume}:${ROOM_HOME}`] } : {}),
      // Its own network: other rooms can't reach it, only the proxy can. Sealed, it can't reach out either.
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
  // Named after the host, so two houses behind one proxy (the workshop next to a real house, in development)
  // never collide on a router name.
  const name = roomHost(room, kind, houseDomain).replace(/[^a-z0-9]+/gi, "-");
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
