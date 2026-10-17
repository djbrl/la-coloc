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
  const auth = { config: { publicUrl: "http://localhost:5175" }, userFromRequest: lookup } as unknown as AuthService;
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

describe("the bell's nudge", () => {
  it("tells only that person's tabs that something is new under their bell", async () => {
    const { gateway, socket, sent } = setup();
    await gateway.handleConnection(socket as never, withSession);
    sent.length = 0;
    gateway.notice("awa");
    expect(sent).toEqual([]);
    gateway.notice("jib");
    expect(sent).toEqual([{ type: "notice" }]);
  });

  it("says \"chat\" the same way when a direct message comes in", async () => {
    const { gateway, socket, sent } = setup();
    await gateway.handleConnection(socket as never, withSession);
    sent.length = 0;
    gateway.notice("jib", "chat");
    expect(sent).toEqual([{ type: "chat" }]);
  });
});

describe("a page served from another host (the site on Vercel, the API behind a tunnel)", () => {
  async function remote({ ready = true } = {}) {
    const { AuthService: Real } = await import("../auth/auth.service");
    const jib = { id: "u1", login: "jib", name: "Jib", avatar: "male-a", githubId: 1 };
    const db = { select: () => ({ from: () => ({ where: async () => (ready ? [jib] : Promise.reject(drizzleDown())) }) }) };
    const auth = new Real(db as never, { publicUrl: "https://coloc.vercel.app" } as never);
    const core = { ready: true, reportDown: vi.fn() };
    const gateway = new LobbyGateway(auth, core as unknown as Core);
    const sent: unknown[] = [];
    const socket = Object.assign(new EventEmitter(), { close: vi.fn(), readyState: 1, send: (m: string) => sent.push(JSON.parse(m)) });
    await gateway.handleConnection(socket as never, { url: "/lobby-ws", headers: { origin: "https://coloc.vercel.app" } });
    const say = (msg: object) => socket.emit("message", Buffer.from(JSON.stringify(msg)));
    const snapshot = () => sent.find((m) => (m as { type: string }).type === "snapshot");
    // The pass is checked asynchronously: let it finish.
    const settle = () => new Promise((r) => setTimeout(r, 0));
    return { auth, gateway, socket, sent, say, snapshot, settle };
  }

  it("is recognised by its one-minute pass, sent as the first message, and the pass works once", async () => {
    const { auth, say, snapshot, settle } = await remote();
    const ticket = auth.issueTicket("u1");
    say({ type: "ticket", ticket });
    // Said straight after the pass, while it's being checked: handled once they're recognised.
    say({ type: "place", place: "lobby" });
    await settle();
    expect(snapshot()).toMatchObject({ you: "jib", place: "lobby" });
    expect(await auth.userFromTicket(ticket)).toBeNull();
  });

  it("no longer reads a pass from the address", async () => {
    const { AuthService: Real } = await import("../auth/auth.service");
    const auth = new Real({} as never, { publicUrl: "https://coloc.vercel.app" } as never);
    const gateway = new LobbyGateway(auth, { ready: true, reportDown: vi.fn() } as unknown as Core);
    const sent: unknown[] = [];
    const socket = Object.assign(new EventEmitter(), { close: vi.fn(), readyState: 1, send: (m: string) => sent.push(JSON.parse(m)) });
    const ticket = auth.issueTicket("u1");
    await gateway.handleConnection(socket as never, { url: `/lobby-ws?ticket=${ticket}`, headers: { origin: "https://coloc.vercel.app" } });
    socket.emit("message", Buffer.from(JSON.stringify({ type: "place", place: "lobby" })));
    expect(sent.find((m) => (m as { type: string }).type === "snapshot")).toMatchObject({ you: null });
  });

  it("is a visitor until then, and takes a pass only as the first message", async () => {
    const { auth, say, snapshot, settle } = await remote();
    say({ type: "place", place: "lobby" });
    say({ type: "ticket", ticket: auth.issueTicket("u1") });
    await settle();
    expect(snapshot()).toMatchObject({ you: null });
  });

  it("takes only one pass: a second one is ignored", async () => {
    const { auth, gateway, say, settle } = await remote();
    say({ type: "ticket", ticket: "not-a-pass" });
    say({ type: "ticket", ticket: auth.issueTicket("u1") });
    await settle();
    expect(gateway.presence.online()).toEqual([]);
  });

  it("asks to come back later when the pass can't be checked because the database is down", async () => {
    const { auth, socket, say, settle } = await remote({ ready: false });
    say({ type: "ticket", ticket: auth.issueTicket("u1") });
    await settle();
    expect(socket.close).toHaveBeenCalledWith(1013, "try again later");
  });
});
