// Everything the agent needs comes from the environment, written once by install.sh.
import type { LocalRepos } from "./git";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export interface AgentConfig {
  apiUrl: string;
  houseId: string;
  secret: string;
  // Rooms are served at <room>.<houseDomain>.
  houseDomain: string;
  // Port visitors use to reach the proxy (80 in production, 8000 in local dev).
  publicPort: number;
  publicScheme: "http" | "https";
  // Name of the Traefik container, which the agent plugs into every room's network.
  proxyContainer: string;
  // Folder the proxy watches for routes. The agent writes one file per room there.
  proxyConfigDir: string;
  // How long to wait after changing a route before trusting the proxy follows it.
  routeSettleMs: number;
  workDir: string;
  usageIntervalMs: number;
  // Development only: lets the agent build from file:// repos on its own disk. "1" lets any in; a comma list of
  // file:// URLs lets in only those (what `npm run up` passes: the tutorial's starter page).
  allowLocalRepos: LocalRepos;
  // Rooms are sealed (they reach nothing, the machine included) unless the house opens them to the internet.
  roomInternet: boolean;
  // Each room's writable disk and its kept files, in MB each. Needs Docker on XFS with quotas (deploy/setup.sh). Unset: read-only rooms.
  roomDiskMb?: number;
  // Builds with no network at all. Safer, but a Dockerfile that installs packages can't.
  buildOffline: boolean;
}

// The agent's first message carries the house secret, so it only goes unencrypted to this machine.
export function assertSafeApiUrl(url: string): void {
  const { protocol, hostname } = new URL(url);
  if (protocol === "wss:") return;
  const local = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  if (protocol === "ws:" && local) return;
  throw new Error(`COLOC_API_URL must use wss:// (got ${protocol}//${hostname})`);
}

export function localRepos(value: string | undefined): LocalRepos {
  if (!value || value === "0") return false;
  if (value === "1") return true;
  return value.split(",").map((v) => v.trim()).filter((v) => v.startsWith("file://"));
}

export function loadConfig(): AgentConfig {
  const apiUrl = process.env.COLOC_API_URL ?? "ws://localhost:4100/agent";
  assertSafeApiUrl(apiUrl);
  return {
    apiUrl,
    houseId: required("COLOC_HOUSE_ID"),
    secret: required("COLOC_AGENT_SECRET"),
    houseDomain: process.env.COLOC_HOUSE_DOMAIN ?? "coloc.localhost",
    publicPort: Number(process.env.COLOC_PUBLIC_PORT ?? 8000),
    publicScheme: (process.env.COLOC_PUBLIC_SCHEME as "http" | "https") ?? "http",
    proxyContainer: process.env.COLOC_PROXY_CONTAINER ?? "coloc-traefik",
    proxyConfigDir: process.env.COLOC_PROXY_CONFIG_DIR ?? "/tmp/coloc-agent/proxy",
    routeSettleMs: Number(process.env.COLOC_ROUTE_SETTLE_MS ?? 2000),
    workDir: process.env.COLOC_WORKDIR ?? "/tmp/coloc-agent",
    usageIntervalMs: Number(process.env.COLOC_USAGE_INTERVAL_MS ?? 30_000),
    allowLocalRepos: localRepos(process.env.COLOC_ALLOW_LOCAL_REPOS),
    roomInternet: process.env.COLOC_ROOM_INTERNET === "1",
    roomDiskMb: Number(process.env.COLOC_ROOM_DISK_MB) || undefined,
    buildOffline: process.env.COLOC_BUILD_OFFLINE === "1",
  };
}

export function roomUrl(cfg: AgentConfig, host: string): string {
  const defaultPort = cfg.publicScheme === "https" ? 443 : 80;
  const port = cfg.publicPort === defaultPort ? "" : `:${cfg.publicPort}`;
  return `${cfg.publicScheme}://${host}${port}`;
}
