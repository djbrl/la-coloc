import { Logger } from "@nestjs/common";
import { OnGatewayConnection, WebSocketGateway } from "@nestjs/websockets";
import { randomUUID } from "node:crypto";
import type WebSocket from "ws";
import { AuthService } from "../auth/auth.service";
import { Presence, type ServerMessage } from "./presence";

// The lobby's live line: positions and emotes, relayed between everyone walking around. Logged-in people appear;
// visitors only watch. Only pages from our own site may connect (a WebSocket ignores CORS, so we check Origin).
@WebSocketGateway({ path: "/lobby-ws" })
export class LobbyGateway implements OnGatewayConnection {
  private readonly log = new Logger("lobby");
  readonly presence = new Presence();
  private sockets = new Map<string, WebSocket>();

  constructor(private readonly auth: AuthService) {}

  async handleConnection(socket: WebSocket, req: { headers: Record<string, string | string[] | undefined> }) {
    const origin = req.headers.origin;
    if (origin && origin !== new URL(this.auth.config.publicUrl).origin) {
      socket.close(4003, "wrong origin");
      return;
    }
    const conn = randomUUID();
    this.sockets.set(conn, socket);
    const user = await this.auth.userFromRequest(req).catch(() => null);
    this.send(this.presence.join(conn, user ? { login: user.login, name: user.name, avatar: user.avatar } : null));

    socket.on("message", (raw) => {
      if (raw.toString().length > 512) return;
      let data: unknown;
      try {
        data = JSON.parse(raw.toString());
      } catch {
        return;
      }
      this.send(this.presence.receive(conn, data));
    });
    socket.on("close", () => {
      this.sockets.delete(conn);
      this.send(this.presence.leave(conn));
    });
    socket.on("error", (e) => this.log.warn(e.message));
  }

  private send(out: ReturnType<Presence["receive"]>) {
    for (const o of out) {
      const json = JSON.stringify(o.msg satisfies ServerMessage);
      if (o.to === "one") this.sockets.get(o.conn)?.send(json);
      else for (const [id, s] of this.sockets) if (id !== o.except && s.readyState === 1) s.send(json);
    }
  }
}
