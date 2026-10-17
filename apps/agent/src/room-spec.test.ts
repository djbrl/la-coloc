import { describe, expect, it } from "vitest";
import { NOBODY, isRoomNetwork, resolvePort, roomContainerSpec, roomFilter, roomHost, roomNetwork, roomNetworks, roomRoute, runAs } from "./room-spec";

const input = {
  houseId: "sacre-coeur",
  room: "jib",
  kind: "prod",
  deployId: "abc123",
  image: "coloc/jib:abc123",
  port: 3000,
  limits: { memoryMb: 256, cpus: 0.5 },
  env: { GREETING: "salut" },
  houseDomain: "sacre-coeur.coloc.dev",
} as const;
const spec = roomContainerSpec({ ...input, limits: { ...input.limits }, env: { ...input.env } });

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

  it("lives on its own network, sealed unless the house opens it", () => {
    expect(spec.HostConfig?.NetworkMode).toBe("coloc-sealed-sacre-coeur--jib");
    const open = roomContainerSpec({ ...input, sealed: false });
    expect(open.HostConfig?.NetworkMode).toBe("coloc-room-sacre-coeur--jib");
  });

  it("moves to the other kind of network on its next deploy, and drops the old ones", () => {
    expect(roomNetworks("sacre-coeur", "jib", true)).toEqual({
      current: "coloc-sealed-sacre-coeur--jib",
      old: ["coloc-room-sacre-coeur--jib", "coloc-room-jib"],
    });
    expect(isRoomNetwork("coloc-sealed-a--b")).toBe(true);
    expect(isRoomNetwork("coloc-room-b")).toBe(true);
    expect(isRoomNetwork("bridge")).toBe(false);
  });

  it("runs as nobody unless the image picked a user of its own", () => {
    expect(spec.User).toBe(NOBODY);
    expect(runAs("root")).toBe(NOBODY);
    expect(runAs("0:0")).toBe(NOBODY);
    expect(runAs("node")).toBeUndefined();
    expect(roomContainerSpec({ ...input, imageUser: "node" }).User).toBeUndefined();
  });

  it("keeps two houses' rooms with the same name on different networks", () => {
    expect(roomNetwork("atelier", "jib")).not.toBe(roomNetwork("sacre-coeur", "jib"));
  });

  it("only ever looks at its own house's containers", () => {
    expect(roomFilter("sacre-coeur")).toEqual(["coloc.house=sacre-coeur", "coloc.room"]);
    expect(roomFilter("sacre-coeur", "jib", "preview")).toEqual(["coloc.house=sacre-coeur", "coloc.room=jib", "coloc.kind=preview"]);
  });

  it("gets its env and port, and no routing labels (the agent routes it)", () => {
    expect(spec.Env).toContain("PORT=3000");
    expect(spec.Env).toContain("GREETING=salut");
    expect(Object.keys(spec.Labels ?? {}).some((k) => k.startsWith("traefik."))).toBe(false);
  });
});

describe("routes", () => {
  it("sends a room's host name to exactly one container, by name", () => {
    const route = roomRoute("jib", "prod", "sacre-coeur.coloc.dev", "coloc-jib-prod-abc123", 3000);
    expect(route.http.routers["jib-sacre-coeur-coloc-dev"].rule).toBe("Host(`jib.sacre-coeur.coloc.dev`)");
    expect(route.http.services["jib-sacre-coeur-coloc-dev"].loadBalancer.servers).toEqual([{ url: "http://coloc-jib-prod-abc123:3000" }]);
  });

  it("keeps prod and preview apart, and two houses with the same room name apart", () => {
    const route = roomRoute("jib", "preview", "h.coloc.dev", "c", 3000);
    expect(route.http.routers["preview-jib-h-coloc-dev"].rule).toBe("Host(`preview-jib.h.coloc.dev`)");
    const other = roomRoute("jib", "prod", "atelier.coloc.dev", "c", 3000);
    expect(Object.keys(other.http.routers)).not.toEqual(Object.keys(roomRoute("jib", "prod", "h.coloc.dev", "c", 3000).http.routers));
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
