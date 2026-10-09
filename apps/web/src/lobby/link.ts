// The lobby's live line to the server: our position and emotes out, everyone else's in.
// Reconnects on its own when the line drops (a laptop waking up, the API restarting).
import type { Emote } from "./Lobby";

export interface PlayerState {
  login: string;
  name: string | null;
  avatar: string | null;
  x: number;
  z: number;
  ry: number;
  moving: boolean;
}

type ServerMessage =
  | { type: "snapshot"; you: string | null; players: PlayerState[] }
  | { type: "join"; player: PlayerState }
  | { type: "move"; login: string; x: number; z: number; ry: number; moving: boolean }
  | { type: "emote"; login: string; name: Emote }
  | { type: "leave"; login: string };

export interface LinkEvents {
  // A fresh list of everyone here (on every (re)connect).
  onSnapshot(players: PlayerState[]): void;
  onJoin(p: PlayerState): void;
  onMove(login: string, x: number, z: number, ry: number, moving: boolean): void;
  onEmote(login: string, name: Emote): void;
  onLeave(login: string): void;
  onStatus(connected: boolean): void;
}

export class LobbyLink {
  private ws: WebSocket | null = null;
  private closed = false;
  private retry = 1000;
  private timer: number | undefined;

  constructor(private events: LinkEvents) {
    this.open();
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

  private open() {
    const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/lobby-ws`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 1000;
      this.events.onStatus(true);
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
    };
    ws.onclose = () => {
      this.events.onStatus(false);
      if (this.closed) return;
      this.timer = window.setTimeout(() => this.open(), this.retry);
      this.retry = Math.min(this.retry * 2, 15_000);
    };
  }
}
