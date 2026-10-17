// The lobby's live line to the server: which neighbourhood we're in, our position and emotes out; everyone else's
// in, plus a head count per neighbourhood, and a nudge when something new is under your bell or in your messages. Reconnects on its own
// when the line drops (a laptop waking up, the API restarting), and says where we are again when it does.
import type { Badge } from "./badge";
import type { Emote } from "./Lobby";

export interface PlayerState {
  login: string;
  name: string | null;
  avatar: string | null;
  x: number;
  z: number;
  ry: number;
  moving: boolean;
  // Logged in with GitHub (their profile can be linked), and an example person (no invitation can reach them).
  // An older API leaves both out.
  github?: boolean;
  example?: boolean;
  // The title they won in the Arena and wear (docs/arena.md), on their name tag. An older API leaves it out.
  badge?: Badge | null;
}

type ServerMessage =
  | { type: "snapshot"; you: string | null; place: string; players: PlayerState[] }
  | { type: "join"; player: PlayerState }
  | { type: "move"; login: string; x: number; z: number; ry: number; moving: boolean }
  | { type: "emote"; login: string; name: Emote }
  | { type: "leave"; login: string }
  | { type: "census"; counts: Record<string, number> }
  // Something new under your bell: fetch the notifications.
  | { type: "notice" }
  // A new direct message: fetch the conversations.
  | { type: "chat" };

export interface LinkEvents {
  // A fresh list of everyone here (on every (re)connect).
  onSnapshot(players: PlayerState[]): void;
  onJoin(p: PlayerState): void;
  onMove(login: string, x: number, z: number, ry: number, moving: boolean): void;
  onEmote(login: string, name: Emote): void;
  onLeave(login: string): void;
  onStatus(connected: boolean): void;
  // How many people are in each neighbourhood.
  onCensus(counts: Record<string, number>): void;
  // Something new under your bell (an invitation, a knock).
  onNotice?(): void;
  // A new direct message (or one you sent from another tab).
  onChat?(): void;
}

export class LobbyLink {
  private ws: WebSocket | null = null;
  private closed = false;
  private retry = 1000;
  private timer: number | undefined;
  private place: string | null = null;

  constructor(private events: LinkEvents) {
    void this.open();
  }

  /** Moves us to a neighbourhood: we get a fresh snapshot of who's there. */
  enter(place: string) {
    this.place = place;
    this.send({ type: "place", place });
  }

  move(state: { x: number; z: number; ry: number; moving: boolean }) {
    this.send({ type: "move", ...state });
  }

  emote(name: Emote) {
    this.send({ type: "emote", name });
  }

  close() {
    this.closed = true;
    clearTimeout(this.timer);
    this.ws?.close();
  }

  private send(msg: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  // The lobby's address: the page's own host, or (site and API on different hosts) VITE_LOBBY_WS with a one-minute
  // pass asked through /api, where the session cookie goes; a visitor has none. The pass is sent as the first
  // message, never in the address, where tunnel and proxy logs would keep it. Null when the pass couldn't be asked
  // for: connecting anyway would make a logged-in person a visitor until the line drops.
  private async address(): Promise<{ url: string; ticket: string | null } | null> {
    const remote = import.meta.env.VITE_LOBBY_WS;
    if (!remote) return { url: `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/lobby-ws`, ticket: null };
    const res = await fetch("/api/lobby/ticket").catch(() => null);
    if (!res?.ok) return null;
    const ticket = ((await res.json().catch(() => ({ ticket: null }))) as { ticket: string | null }).ticket;
    return { url: remote, ticket };
  }

  // Waits a little longer each time (1 s, doubling to 15 s), then tries again.
  private again() {
    this.timer = window.setTimeout(() => void this.open(), this.retry);
    this.retry = Math.min(this.retry * 2, 15_000);
  }

  private async open() {
    const where = await this.address();
    if (this.closed) return;
    if (where === null) return this.again();
    const ws = new WebSocket(where.url);
    this.ws = ws;
    ws.onopen = () => {
      this.events.onStatus(true);
      // The pass first: the server only takes it as the very first message.
      if (where.ticket) this.send({ type: "ticket", ticket: where.ticket });
      if (this.place) this.send({ type: "place", place: this.place });
    };
    ws.onmessage = (e) => {
      // The server really spoke: only now is the line known to work (a server that accepts and then hangs up at
      // once, while its database is down, would otherwise be retried every second).
      this.retry = 1000;
      let m: ServerMessage;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      if (m.type === "snapshot") this.events.onSnapshot(m.players);
      else if (m.type === "join") this.events.onJoin(m.player);
      else if (m.type === "move") this.events.onMove(m.login, m.x, m.z, m.ry, m.moving);
      else if (m.type === "emote") this.events.onEmote(m.login, m.name);
      else if (m.type === "leave") this.events.onLeave(m.login);
      else if (m.type === "census") this.events.onCensus(m.counts);
      else if (m.type === "notice") this.events.onNotice?.();
      else if (m.type === "chat") this.events.onChat?.();
    };
    ws.onclose = () => {
      this.events.onStatus(false);
      if (this.closed) return;
      this.again();
    };
  }
}
