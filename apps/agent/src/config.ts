// Everything the agent needs comes from the environment, written once by install.sh.
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
  workDir: string;
  usageIntervalMs: number;
}

export function loadConfig(): AgentConfig {
  return {
    apiUrl: process.env.COLOC_API_URL ?? "ws://localhost:4000/agent",
    houseId: required("COLOC_HOUSE_ID"),
    secret: required("COLOC_AGENT_SECRET"),
    houseDomain: process.env.COLOC_HOUSE_DOMAIN ?? "coloc.localhost",
    publicPort: Number(process.env.COLOC_PUBLIC_PORT ?? 8000),
    publicScheme: (process.env.COLOC_PUBLIC_SCHEME as "http" | "https") ?? "http",
    proxyContainer: process.env.COLOC_PROXY_CONTAINER ?? "coloc-traefik",
    workDir: process.env.COLOC_WORKDIR ?? "/tmp/coloc-agent",
    usageIntervalMs: Number(process.env.COLOC_USAGE_INTERVAL_MS ?? 30_000),
  };
}

export function roomUrl(cfg: AgentConfig, host: string): string {
  const defaultPort = cfg.publicScheme === "https" ? 443 : 80;
  const port = cfg.publicPort === defaultPort ? "" : `:${cfg.publicPort}`;
  return `${cfg.publicScheme}://${host}${port}`;
}
