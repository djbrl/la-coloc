import { Logger } from "@nestjs/common";
import { OnGatewayConnection, WebSocketGateway } from "@nestjs/websockets";
import { randomUUID } from "node:crypto";
import type WebSocket from "ws";
import { AuthService, SESSION_COOKIE } from "../auth/auth.service";
import { parseCookies } from "../auth/http";
import { Core, CoreDownError, isCoreDown } from "../core/core";
import { type Out, Presence, type ServerMessage } from "./presence";

// The lobby's live line: positions and emotes, relayed between everyone walking around. Logged-in people appear;
// visitors only watch. Only pages from our own site may connect (a WebSocket ignores CORS, so we check Origin).
@WebSocketGateway({ path: "/lobby-ws" })
export class LobbyGateway implements OnGatewayConnection {
  private readonly log = new Logger("lobby");
  readonly presence = new Presence();
  private sockets = new Map<string, WebSocket>();

  constructor(
    private readonly auth: AuthService,
    private readonly core: Core,
  ) {}

  async handleConnection(socket: WebSocket, req: { headers: Record<string, string | string[] | undefined> }) {
    const origin = req.headers.origin;
    if (origin && origin !== new URL(this.auth.config.publicUrl).origin) {
      socket.close(4003, "wrong origin");
      return;
    }
    const conn = randomUUID();
    // Looking up who this is needs the database, which can take a moment (or fail). Meanwhile the visitor may
    // already speak or leave, so listen first and handle what was said once they have joined.
    let joined = false;
    let left = false;
    const early: Buffer[] = [];
    const handle = (raw: { toString(): string }) => {
      if (raw.toString().length > 512) return;
      let data: unknown;
      try {
        data = JSON.parse(raw.toString());
      } catch {
        return;
      }
      this.send(this.presence.receive(conn, data));
    };
    socket.on("message", (raw) => (joined ? handle(raw as Buffer) : early.push(raw as Buffer)));
    socket.on("close", () => {
      left = true;
      if (!joined) return;
      this.sockets.delete(conn);
      this.send(this.presence.leave(conn));
    });
    socket.on("error", (e) => this.log.warn(e.message));

    const user = await this.whoIs(req, socket);
    if (user === "try-later" || left) return;
    this.sockets.set(conn, socket);
    this.send(this.presence.join(conn, user ? { login: user.login, name: user.name, avatar: user.avatar } : null));
    joined = true;
    early.forEach(handle);
  }

  /**
   * Who is this? A visitor without a session is simply a visitor. Someone with a session needs the database to be
   * recognised; if it isn't answering we ask them to come back (the page retries by itself) rather than let
   * them walk around as a stranger until they reload. People already in the lobby are not affected: presence
   * lives in memory, not in the database.
   */
  private async whoIs(req: { headers: Record<string, string | string[] | undefined> }, socket: WebSocket) {
    if (!parseCookies(req.headers.cookie)[SESSION_COOKIE]) return null;
    try {
      if (!this.core.ready) throw new CoreDownError();
      return await this.auth.userFromRequest(req);
    } catch (e) {
      if (!isCoreDown(e)) return null;
      this.core.reportDown(e);
      socket.close(1013, "try again later");
      return "try-later" as const;
    }
  }

  private send(out: Out[]) {
    for (const o of out) {
      const json = JSON.stringify(o.msg satisfies ServerMessage);
      if (o.to === "one") this.sockets.get(o.conn)?.send(json);
      else {
        const targets = o.to === "all" ? [...this.sockets.keys()] : this.presence.watching(o.place).filter((id) => id !== o.except);
        for (const id of targets) {
          const s = this.sockets.get(id);
          if (s?.readyState === 1) s.send(json);
        }
      }
    }
  }
}
