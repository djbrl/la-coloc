import "reflect-metadata";
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { Core } from "../core/core";
import type { HousesService } from "../houses/houses.service";
import { AgentsGateway, TRY_AGAIN_LATER } from "./agents.gateway";
import type { AgentRegistry } from "./agent.registry";
import type { ShellBroker } from "./shell.broker";
import type { LogsBroker } from "./logs.broker";

const hello = JSON.stringify({ type: "hello", houseId: "atelier", secret: "s", agentVersion: "1" });
const drizzleDown = () => Object.assign(new Error("Failed query: select 1"), { cause: Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5433"), { code: "ECONNREFUSED" }) });

function setup({ ready = true, verify = async () => true as boolean } = {}) {
  const core = { ready, reportDown: vi.fn() };
  const houses = { verifyAgentSecret: verify, setAgentOnline: vi.fn(), markLive: async () => false, failLostBuilds: vi.fn() } as unknown as HousesService;
  const registry = { register: vi.fn(), unregister: vi.fn(), isOnline: () => false } as unknown as AgentRegistry;
  const gateway = new AgentsGateway(houses, registry, {} as LogsBroker, { houseGone: vi.fn() } as unknown as ShellBroker, core as unknown as Core);
  const socket = Object.assign(new EventEmitter(), { close: vi.fn() });
  return { core, gateway, socket, registry };
}

describe("an agent calling while the database is down", () => {
  it("is politely turned away ('try again later') before the API has reached the database", () => {
    const { gateway, socket } = setup({ ready: false });
    gateway.handleConnection(socket as never);
    expect(socket.close).toHaveBeenCalledWith(TRY_AGAIN_LATER, "try again later");
    expect(TRY_AGAIN_LATER).toBe(1013);
  });

  it("is turned away the same way if the database goes away while it says hello, and nothing crashes", async () => {
    const { gateway, socket, core, registry } = setup({
      verify: async () => {
        throw drizzleDown();
      },
    });
    gateway.handleConnection(socket as never);
    socket.emit("message", Buffer.from(hello));
    await new Promise((r) => setTimeout(r, 10));
    expect(socket.close).toHaveBeenCalledWith(TRY_AGAIN_LATER, "try again later");
    expect(core.reportDown).toHaveBeenCalledOnce();
    expect(registry.register).not.toHaveBeenCalled();
  });

  it("is let in when the database answers", async () => {
    const { gateway, socket, registry } = setup();
    gateway.handleConnection(socket as never);
    socket.emit("message", Buffer.from(hello));
    await new Promise((r) => setTimeout(r, 10));
    expect(socket.close).not.toHaveBeenCalled();
    expect(registry.register).toHaveBeenCalledWith("atelier", socket);
  });
});

describe("an agent calling through the public tunnel", () => {
  it("is refused before it can say hello, even with the right key", async () => {
    const { gateway, socket, registry } = setup();
    gateway.handleConnection(socket as never, { headers: { "cf-connecting-ip": "203.0.113.7" } } as never);
    expect(socket.close).toHaveBeenCalledWith(4003, "not here");
    socket.emit("message", Buffer.from(hello));
    await new Promise((r) => setTimeout(r, 10));
    expect(registry.register).not.toHaveBeenCalled();
  });

  it("is let in when it dials the API directly", async () => {
    const { gateway, socket, registry } = setup();
    gateway.handleConnection(socket as never, { headers: { host: "localhost:4100" } } as never);
    socket.emit("message", Buffer.from(hello));
    await new Promise((r) => setTimeout(r, 10));
    expect(registry.register).toHaveBeenCalledWith("atelier", socket);
  });
});
