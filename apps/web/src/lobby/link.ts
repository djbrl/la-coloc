// The lobby's live line to the server: which neighbourhood we're in, our position and emotes out; everyone else's
// in, plus a head count per neighbourhood, and a nudge when something new is under your bell. Reconnects on its own
// when the line drops (a laptop waking up, the API restarting), and says where we are again when it does.
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
}

type ServerMessage =
  | { type: "snapshot"; you: string | null; place: string; players: PlayerState[] }
  | { type: "join"; player: PlayerState }
  | { type: "move"; login: string; x: number; z: number; ry: number; moving: boolean }
  | { type: "emote"; login: string; name: Emote }
  | { type: "leave"; login: string }
  | { type: "census"; counts: Record<string, number> }
  // Something new under your bell: fetch the notifications.
  | { type: "notice" };

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
  // pass asked through /api, where the session cookie goes; a visitor connects without one.
  private async address(): Promise<string> {
    const remote = import.meta.env.VITE_LOBBY_WS;
    if (!remote) return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/lobby-ws`;
    const res = await fetch("/api/lobby/ticket").catch(() => null);
    const ticket = res?.ok ? ((await res.json()) as { ticket: string | null }).ticket : null;
    return ticket ? `${remote}?ticket=${encodeURIComponent(ticket)}` : remote;
  }

  private async open() {
    const url = await this.address();
    if (this.closed) return;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 1000;
      this.events.onStatus(true);
      if (this.place) this.send({ type: "place", place: this.place });
    };
    ws.onmessage = (e) => {
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
    };
    ws.onclose = () => {
      this.events.onStatus(false);
      if (this.closed) return;
      this.timer = window.setTimeout(() => void this.open(), this.retry);
      this.retry = Math.min(this.retry * 2, 15_000);
    };
  }
}
