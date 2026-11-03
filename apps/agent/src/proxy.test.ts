import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentConfig } from "./config";

const h = vi.hoisted(() => ({ containers: [] as object[] }));

vi.mock("./docker", () => ({
  docker: { listContainers: async () => h.containers },
  ensureRoomNetwork: async () => undefined,
  roomContainers: async () => h.containers,
}));

import { backToProject, routedTo, routeTo, syncRoutes } from "./proxy";

describe("a room's address", () => {
  let cfg: AgentConfig;
  const container = (name: string, port = 3000, Created = 1) => ({
    Id: name,
    State: "running",
    Created,
    Names: [`/${name}`],
    Labels: { "coloc.room": "awa", "coloc.kind": "prod", "coloc.port": String(port) },
    HostConfig: { NetworkMode: "coloc-room-h--awa" },
  });
  const url = async () => JSON.parse(await readFile(path.join(cfg.proxyConfigDir, "h--awa-prod.yml"), "utf8")).http.services["awa-house-city"].loadBalancer.servers[0].url;

  beforeEach(async () => {
    const proxyConfigDir = await mkdtemp(path.join(tmpdir(), "coloc-routes-"));
    cfg = { houseId: "h", houseDomain: "house.city", proxyConfigDir, proxyContainer: "proxy", routeSettleMs: 0 } as AgentConfig;
    h.containers = [container("one")];
  });
  afterEach(() => rm(cfg.proxyConfigDir, { recursive: true, force: true }));

  it("can be read back", async () => {
    await expect(routedTo(cfg, "awa", "prod")).resolves.toBeNull();
    await routeTo(cfg, "awa", "prod", "one", 8000);
    await expect(routedTo(cfg, "awa", "prod")).resolves.toEqual({ container: "one", port: 8000 });
  });

  it("isn't readable from a file that makes no sense", async () => {
    await writeFile(path.join(cfg.proxyConfigDir, "h--awa-prod.yml"), "nonsense");
    await expect(routedTo(cfg, "awa", "prod")).resolves.toBeNull();
  });

  it("stays on the port someone chose when the caretaker restarts", async () => {
    await routeTo(cfg, "awa", "prod", "one", 8000);
    await syncRoutes(cfg);
    expect(await url()).toBe("http://one:8000");
  });

  it("goes to the project's port for a new container: a deploy ends the choice", async () => {
    await routeTo(cfg, "awa", "prod", "one", 8000);
    h.containers = [container("two", 3000, 2)];
    await syncRoutes(cfg);
    expect(await url()).toBe("http://two:3000");
  });

  it("goes back to the project when what was started by hand has stopped", async () => {
    await routeTo(cfg, "awa", "prod", "one", 8000);
    await backToProject(cfg, "awa");
    expect(await url()).toBe("http://one:3000");
  });

  it("isn't rewritten when it's already on the project", async () => {
    await routeTo(cfg, "awa", "prod", "one", 3000);
    const settle = vi.spyOn(global, "setTimeout");
    await backToProject(cfg, "awa");
    expect(settle).not.toHaveBeenCalled();
    settle.mockRestore();
  });
});
