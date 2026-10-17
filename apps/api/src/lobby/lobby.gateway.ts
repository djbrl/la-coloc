import { Logger, type OnModuleDestroy, Optional } from "@nestjs/common";
import { OnGatewayConnection, WebSocketGateway } from "@nestjs/websockets";
import { randomUUID } from "node:crypto";
import type WebSocket from "ws";
import { z } from "zod";
import { AuthService, SESSION_COOKIE, type User } from "../auth/auth.service";
import { parseCookies } from "../auth/http";
import { Core, CoreDownError, isCoreDown } from "../core/core";
import { ChatService } from "../chat/chat.service";
import { NotificationsService } from "../notifications/notifications.service";
import { type Out, Presence, type ServerMessage } from "./presence";

// The pass a page on another host sends as its first message: { type: "ticket", ticket }.
const Pass = z.object({ type: z.literal("ticket"), ticket: z.string().min(1).max(100) });

// The lobby's live line: positions and emotes, relayed between everyone walking around. Logged-in people appear;
// visitors only watch. Only pages from our own site may connect (a WebSocket ignores CORS, so we check Origin).
// It also tells someone, on their own line only, that something new is under their bell, or that a direct message
// came in (one word each; the page then asks the API, so nothing private travels on the line).
@WebSocketGateway({ path: "/lobby-ws" })
export class LobbyGateway implements OnGatewayConnection, OnModuleDestroy {
  private readonly log = new Logger("lobby");
  readonly presence = new Presence();
  private sockets = new Map<string, WebSocket>();

  private readonly unsubscribe: () => void;

  constructor(
    private readonly auth: AuthService,
    private readonly core: Core,
    // Left out in tests that don't need it.
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly chat?: ChatService,
  ) {
    const sub = this.notifications?.pushes.subscribe((login) => this.notice(login));
    const chatSub = this.chat?.pushes.subscribe((login) => this.notice(login, "chat"));
    this.unsubscribe = () => {
      sub?.unsubscribe();
      chatSub?.unsubscribe();
    };
  }

  onModuleDestroy() {
    this.unsubscribe();
  }

  /**
   * "Look at your bell" (`notice`) or "look at your messages" (`chat`): a one-word message to each of `login`'s open
   * tabs. Offline, they see it on their next load.
   */
  notice(login: string, type: "notice" | "chat" = "notice") {
    if (!login) return;
    this.send(this.presence.connectionsOf(login).map((conn) => ({ to: "one" as const, conn, msg: { type } })));
  }

  async handleConnection(socket: WebSocket, req: { url?: string; headers: Record<string, string | string[] | undefined> }) {
    const origin = req.headers.origin;
    const allowed = this.auth.config.origins ?? [new URL(this.auth.config.publicUrl).origin];
    const local = this.auth.config.devOrigins && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(String(origin));
    if (origin && !allowed.includes(String(origin)) && !local) {
      socket.close(4003, "wrong origin");
      return;
    }
    const conn = randomUUID();
    // Looking up who this is needs the database, which can take a moment (or fail). Meanwhile the visitor may
    // already speak or leave, so listen first and handle what was said once they have joined (and, after a pass,
    // once they've been recognised).
    let joined = false;
    let checking = false;
    let left = false;
    // A page served from elsewhere (the site on Vercel) has no cookie here: its first message may be a pass from
    // /api/lobby/ticket. Only the first, and only without a cookie; until it's checked, the socket is a visitor.
    let passAllowed = !parseCookies(req.headers.cookie)[SESSION_COOKIE];
    const early: Buffer[] = [];
    const handle = (raw: { toString(): string }) => {
      if (raw.toString().length > 512) return;
      let data: unknown;
      try {
        data = JSON.parse(raw.toString());
      } catch {
        return;
      }
      const first = passAllowed;
      passAllowed = false;
      const pass = Pass.safeParse(data);
      if (pass.success) {
        if (first) void signIn(pass.data.ticket);
        return;
      }
      this.send(this.presence.receive(conn, data));
    };
    const drain = () => {
      while (joined && !checking && early.length) handle(early.shift()!);
    };
    const signIn = async (ticket: string) => {
      checking = true;
      const user = await this.fromTicket(ticket, socket);
      if (user === "try-later" || left) return;
      if (user) {
        const example = await this.isExample(user);
        if (left) return;
        // The same connection, now as that person: the visitor goes, they arrive.
        this.send(this.presence.leave(conn));
        this.send(this.presence.join(conn, { login: user.login, name: user.name, avatar: user.avatar, github: user.githubId !== null, example }));
      }
      checking = false;
      drain();
    };
    socket.on("message", (raw) => {
      early.push(raw as Buffer);
      drain();
    });
    socket.on("close", () => {
      left = true;
      if (!joined) return;
      this.sockets.delete(conn);
      this.send(this.presence.leave(conn));
    });
    socket.on("error", (e) => this.log.warn(e.message));

    const user = await this.whoIs(req, socket);
    if (user === "try-later" || left) return;
    const example = user ? await this.isExample(user) : false;
    if (left) return;
    this.sockets.set(conn, socket);
    this.send(this.presence.join(conn, user ? { login: user.login, name: user.name, avatar: user.avatar, github: user.githubId !== null, example } : null));
    joined = true;
    drain();
  }

  /**
   * Who is this? A visitor without a session is simply a visitor. Someone with a session needs the database to be
   * recognised; if it isn't answering we ask them to come back (the page retries by itself) rather than let
   * them walk around as a stranger until they reload. People already in the lobby are not affected: presence
   * lives in memory, not in the database.
   */
  private async whoIs(req: { url?: string; headers: Record<string, string | string[] | undefined> }, socket: WebSocket) {
    if (!parseCookies(req.headers.cookie)[SESSION_COOKIE]) return null;
    return this.recognise(() => this.auth.userFromRequest(req), socket);
  }

  /** The same for a pass sent as the first message (never in the address, where proxies and tunnels log it). */
  private fromTicket(ticket: string, socket: WebSocket) {
    return this.recognise(() => this.auth.userFromTicket(ticket), socket);
  }

  private async recognise(lookup: () => Promise<User | null>, socket: WebSocket) {
    try {
      if (!this.core.ready) throw new CoreDownError();
      return await lookup();
    } catch (e) {
      if (!isCoreDown(e)) return null;
      this.core.reportDown(e);
      socket.close(1013, "try again later");
      return "try-later" as const;
    }
  }

  // Whether their card should say "example person". Not worth refusing someone over: a failed look-up says no.
  private async isExample(user: User): Promise<boolean> {
    try {
      return (await this.notifications?.isExample(user)) ?? false;
    } catch {
      return false;
    }
  }

  private send(out: Out[]) {
    for (const o of out) {
      const json = JSON.stringify(o.msg satisfies ServerMessage);
      if (o.to === "one") {
        const s = this.sockets.get(o.conn);
        if (s?.readyState === 1) s.send(json);
      }
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
