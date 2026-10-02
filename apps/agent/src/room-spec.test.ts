import { describe, expect, it } from "vitest";
import { resolvePort, roomContainerSpec, roomHost } from "./room-spec";

const spec = roomContainerSpec({
  houseId: "sacre-coeur",
  room: "jib",
  kind: "prod",
  deployId: "abc123",
  image: "coloc/jib:abc123",
  port: 3000,
  limits: { memoryMb: 256, cpus: 0.5 },
  env: { GREETING: "salut" },
  houseDomain: "sacre-coeur.coloc.dev",
});

describe("room walls", () => {
  it("caps memory with no swap, and CPU", () => {
    expect(spec.HostConfig?.Memory).toBe(256 * 1024 * 1024);
    expect(spec.HostConfig?.MemorySwap).toBe(spec.HostConfig?.Memory);
    expect(spec.HostConfig?.NanoCpus).toBe(500_000_000);
  });

  it("drops every capability and forbids privilege escalation", () => {
    expect(spec.HostConfig?.CapDrop).toEqual(["ALL"]);
    expect(spec.HostConfig?.SecurityOpt).toContain("no-new-privileges:true");
    expect(spec.HostConfig?.Privileged).toBe(false);
    expect(spec.HostConfig?.PidsLimit).toBe(256);
  });

  it("never mounts anything from the host, the Docker socket included", () => {
    expect(spec.HostConfig?.Binds).toBeUndefined();
    expect(spec.HostConfig?.Mounts).toBeUndefined();
  });

  it("lives on its own network", () => {
    expect(spec.HostConfig?.NetworkMode).toBe("coloc-room-jib");
  });

  it("is routed by host name", () => {
    expect(spec.Labels?.["traefik.http.routers.jib-prod.rule"]).toBe("Host(`jib.sacre-coeur.coloc.dev`)");
    expect(spec.Env).toContain("PORT=3000");
    expect(spec.Env).toContain("GREETING=salut");
  });
});

describe("hosts and ports", () => {
  it("gives previews a single-level subdomain", () => {
    expect(roomHost("jib", "preview", "h.coloc.dev")).toBe("preview-jib.h.coloc.dev");
  });

  it("resolves the app's port", () => {
    expect(resolvePort(8080, { "3000/tcp": {} })).toBe(8080);
    expect(resolvePort(undefined, { "5173/tcp": {} })).toBe(5173);
    expect(resolvePort(undefined, undefined)).toBe(3000);
  });
});
