// A cancelled deploy, step by step, with Docker and git stood in for: it must end as failed with BUILD_CANCELLED, throw
// away what it made, and leave the version that was running alone.
import { BUILD_CANCELLED, type DeployCommand } from "@coloc/protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentConfig } from "./config";

const h = vi.hoisted(() => ({
  cleanup: vi.fn(async () => undefined),
  build: vi.fn(),
  create: vi.fn(),
  route: vi.fn(async () => undefined),
  removed: vi.fn(async () => undefined),
  clone: vi.fn(),
  healthy: vi.fn(),
}));
vi.mock("./git", () => ({ shallowClone: h.clone, resolveInside: (root: string) => root }));
vi.mock("./recipe", () => ({ ensureDockerfile: async () => undefined }));
vi.mock("./proxy", () => ({ routeTo: h.route, unroute: vi.fn(), unrouteRoom: vi.fn() }));
vi.mock("./docker", () => ({
  buildImage: h.build,
  pullImage: vi.fn(),
  docker: { createContainer: h.create },
  dropOldNetworks: vi.fn(async () => undefined),
  ensureRoomNetwork: vi.fn(async () => undefined),
  imageConfig: async () => ({}),
  lastLogs: async () => "",
  removeContainer: h.removed,
  retiring: new Set(),
  roomContainers: async () => [],
  waitHealthy: h.healthy,
}));

import { deploy } from "./deploy";

const cfg = { houseId: "h", houseDomain: "h.test", workDir: "/tmp", allowLocalRepos: false, buildOffline: false, roomInternet: true } as unknown as AgentConfig;
const cmd = { type: "deploy", deployId: "d1", room: "awa", kind: "prod", repo: "https://github.com/a/b.git", path: ".", limits: { memoryMb: 256, cpus: 0.5 }, env: {} } as DeployCommand;

function reports() {
  const said: { status: string; detail?: string }[] = [];
  return { said, report: (s: { status: string; detail?: string }) => void said.push(s) };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.clone.mockResolvedValue({ dir: "/tmp/c", sha: "abc123abc123abc", branch: "main", cleanup: h.cleanup });
  h.build.mockResolvedValue(undefined);
  h.healthy.mockResolvedValue(undefined);
  h.create.mockResolvedValue({ id: "new", start: async () => undefined });
});

describe("cancelling a deploy", () => {
  it("starts nothing when it was cancelled before its turn came", async () => {
    const stop = new AbortController();
    stop.abort();
    const { said, report } = reports();
    await deploy(cfg, cmd, report, undefined, stop.signal);
    expect(h.clone).not.toHaveBeenCalled();
    expect(said.at(-1)).toEqual({ status: "failed", detail: BUILD_CANCELLED });
  });

  it("says cancelled, not what git said, when the clone is killed", async () => {
    const stop = new AbortController();
    h.clone.mockImplementation(async () => {
      stop.abort();
      throw new Error("git clone failed: aborted");
    });
    const { said, report } = reports();
    await deploy(cfg, cmd, report, undefined, stop.signal);
    expect(said.at(-1)).toEqual({ status: "failed", detail: BUILD_CANCELLED });
  });

  it("stops a running build, cleans up, and never starts a container", async () => {
    const stop = new AbortController();
    h.build.mockImplementation(async (_f: string, _t: string, _l: unknown, _o: boolean, signal: AbortSignal) => {
      expect(signal).toBe(stop.signal);
      stop.abort();
      throw new Error("cancelled");
    });
    const { said, report } = reports();
    const lines: string[] = [];
    await deploy(cfg, cmd, report, (l) => lines.push(...l), stop.signal);
    expect(said.map((s) => s.status)).toEqual(["cloning", "building", "failed"]);
    expect(said.at(-1)?.detail).toBe(BUILD_CANCELLED);
    expect(lines).toEqual([BUILD_CANCELLED]);
    expect(h.create).not.toHaveBeenCalled();
    expect(h.route).not.toHaveBeenCalled();
    expect(h.cleanup).toHaveBeenCalled();
  });

  it("while the new version is starting: removes it, and visitors stay on the old one", async () => {
    const stop = new AbortController();
    h.healthy.mockImplementation(async () => stop.abort());
    const { said, report } = reports();
    await deploy(cfg, cmd, report, undefined, stop.signal);
    expect(h.removed).toHaveBeenCalledWith("new");
    expect(h.route).not.toHaveBeenCalled();
    expect(said.at(-1)).toEqual({ status: "failed", detail: BUILD_CANCELLED });
  });

  it("goes on as usual when nobody cancels", async () => {
    const { said, report } = reports();
    await deploy(cfg, cmd, report, undefined, new AbortController().signal);
    expect(h.route).toHaveBeenCalled();
    expect(said.at(-1)?.status).toBe("live");
  });
});
