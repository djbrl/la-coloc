import "reflect-metadata";
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { AuthService } from "../auth/auth.service";
import type { Core } from "../core/core";
import { LobbyGateway } from "./lobby.gateway";

const drizzleDown = () => Object.assign(new Error("Failed query: select 1"), { cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }) });
const withSession = { headers: { cookie: "coloc_session=abc" } };
const visitor = { headers: {} };

function setup({ ready = true, lookup = async () => ({ login: "jib", name: "Jib", avatar: "male-a" }) as unknown } = {}) {
  const core = { ready, reportDown: vi.fn() };
  const auth = { config: { publicUrl: "http://localhost:5173" }, userFromRequest: lookup } as unknown as AuthService;
  const gateway = new LobbyGateway(auth, core as unknown as Core);
  const sent: unknown[] = [];
  const socket = Object.assign(new EventEmitter(), { close: vi.fn(), readyState: 1, send: (m: string) => sent.push(JSON.parse(m)) });
  return { core, gateway, socket, sent };
}

describe("the lobby while the database is down", () => {
  it("lets a visitor without a session watch: recognising nobody needs no database", async () => {
    const { gateway, socket, sent } = setup({ ready: false });
    await gateway.handleConnection(socket as never, visitor);
    expect(socket.close).not.toHaveBeenCalled();
    socket.emit("message", Buffer.from(JSON.stringify({ type: "place", place: "lobby" })));
    expect(sent.find((m) => (m as { type: string }).type === "snapshot")).toMatchObject({ you: null, place: "lobby" });
  });

  it("asks someone with a session to come back later, instead of showing them as a stranger", async () => {
    const { gateway, socket, core, sent } = setup({
      lookup: async () => {
        throw drizzleDown();
      },
    });
    await gateway.handleConnection(socket as never, withSession);
    expect(socket.close).toHaveBeenCalledWith(1013, "try again later");
    expect(core.reportDown).toHaveBeenCalledOnce();
    expect(sent).toEqual([]);
  });

  it("does the same before the API has reached the database at all", async () => {
    const { gateway, socket } = setup({ ready: false });
    await gateway.handleConnection(socket as never, withSession);
    expect(socket.close).toHaveBeenCalledWith(1013, "try again later");
  });

  it("recognises people as usual once the database answers", async () => {
    const { gateway, socket, sent } = setup();
    await gateway.handleConnection(socket as never, withSession);
    expect(socket.close).not.toHaveBeenCalled();
    socket.emit("message", Buffer.from(JSON.stringify({ type: "place", place: "lobby" })));
    expect(sent.find((m) => (m as { type: string }).type === "snapshot")).toMatchObject({ you: "jib" });
  });

  it("doesn't lose what a visitor says while their session is being looked up, nor leave a ghost if they leave meanwhile", async () => {
    let answer!: (u: unknown) => void;
    const slow = setup({ lookup: () => new Promise((r) => (answer = r)) });
    const joining = slow.gateway.handleConnection(slow.socket as never, withSession);
    slow.socket.emit("message", Buffer.from(JSON.stringify({ type: "place", place: "lobby" })));
    answer({ login: "jib", name: "Jib", avatar: "male-a" });
    await joining;
    expect(slow.sent.find((m) => (m as { type: string }).type === "snapshot")).toMatchObject({ you: "jib", place: "lobby" });

    const ghost = setup({ lookup: () => new Promise((r) => (answer = r)) });
    const leaving = ghost.gateway.handleConnection(ghost.socket as never, withSession);
    ghost.socket.emit("close");
    answer({ login: "awa", name: "Awa", avatar: "female-a" });
    await leaving;
    expect(ghost.sent).toEqual([]);
    expect(ghost.gateway.presence.watching("lobby")).toEqual([]);
  });
});
