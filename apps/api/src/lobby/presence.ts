// Who's walking around which neighbourhood, and where. Pure: the gateway feeds it connections and messages, it
// answers with what to send to whom. One avatar per person, however many tabs they have open. You only hear about
// the people in your lobby, plus a head count for every neighbourhood (for the travel map).
//
// A city holds as many lobbies as it needs, 32 people each: a newcomer takes the first with room, so nobody ever draws
// more than 32 people. Everyone in a lobby has a small number, their slot, so that movement can travel as a few bytes:
// moves are only remembered here, and `frames()`, ten times a second, says them all at once (see `frameOf`).
//
// It also keeps how present each person is, for their friends' lists: online, idle (no input for a while) or away
// (the tab is hidden), as each tab says on change with a `status` message. Several tabs: the most present one
// counts. Nobody's lobby hears it; `statusChanges()` names whose status or city changed, for the gateway.
import type { Badge } from "@coloc/db";
import { z } from "zod";

export const AVATARS = ["female", "male"].flatMap((s) => "abcdef".split("").map((l) => `${s}-${l}`));
export const EMOTES = ["yes", "no"] as const;
// What a tab says about the person behind it. Not connected at all is "offline", which no tab says.
export const STATUSES = ["online", "idle", "away"] as const;
export type Status = (typeof STATUSES)[number] | "offline";

// A neighbourhood is far smaller than this; anything outside is a bug or a cheat.
const coord = z.number().finite().min(-300).max(300);
export const LOBBY_SIZE = 32;
export const ClientMessage = z.discriminatedUnion("type", [
  // `lobby`: the one you'd like in that city, if it has room (going back after a dropped line, or changing lobby).
  z.object({ type: z.literal("place"), place: z.string().min(1).max(60), lobby: z.number().int().min(1).max(9999).optional() }),
  z.object({ type: z.literal("move"), x: coord, z: coord, ry: z.number().finite().min(-10).max(10), moving: z.boolean() }),
  z.object({ type: z.literal("emote"), name: z.enum(EMOTES) }),
  z.object({ type: z.literal("status"), status: z.enum(STATUSES) }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

export interface Player {
  login: string;
  // Their number in this lobby: what the movement frames call them.
  slot: number;
  name: string | null;
  avatar: string | null;
  // Logged in with GitHub, so their profile can be linked; and whether they're an example person (no real
  // invitation can reach them). Their card in the lobby needs both.
  github?: boolean;
  example?: boolean;
  // The Arena title they wear, for their name tag. Null: none.
  badge?: Badge | null;
  // The city they belong to, for the tourist chip on their tag. Null: none given (seeded people).
  homeCity?: string | null;
  x: number;
  z: number;
  ry: number;
  moving: boolean;
}

export interface LobbyCount {
  n: number;
  people: number;
}

export type ServerMessage =
  | { type: "snapshot"; you: string | null; place: string; lobby: number; players: Player[] }
  | { type: "join"; player: Player }
  | { type: "emote"; login: string; name: (typeof EMOTES)[number] }
  | { type: "leave"; login: string }
  // People per city; and for a city with several lobbies, each lobby's number and head count.
  | { type: "census"; counts: Record<string, number>; lobbies: Record<string, LobbyCount[]> }
  // Something new under your bell (an invitation, a knock): the page fetches /api/notifications. Only to you.
  | { type: "notice" }
  // A new direct message for you (or one you sent from another tab): the page fetches /api/chat/conversations.
  | { type: "chat" }
  // A friend came, went, changed status or city, or your friends changed: the page fetches /api/friends.
  | { type: "friends" };

export interface Viewer {
  login: string;
  name: string | null;
  avatar: string | null;
  github?: boolean;
  example?: boolean;
  badge?: Badge | null;
  // The city they belong to, for the tourist chip on their tag. Null: none given (seeded people).
  homeCity?: string | null;
}

export type Out =
  | { to: "one"; conn: string; msg: ServerMessage }
  // Everyone watching that lobby except `except`.
  | { to: "lobby"; lobby: Lobby; except: string; msg: ServerMessage }
  | { to: "all"; msg: ServerMessage };

// A status only changes when someone comes back or leaves the keyboard: a few in ten seconds is already a lot.
const LIMITS = { move: { count: 20, perMs: 1000 }, emote: { count: 2, perMs: 2000 }, place: { count: 5, perMs: 5000 }, status: { count: 6, perMs: 10_000 } };

// One copy of a city. `watchers` are connections (visitors too), `players` the people who count towards its size.
export interface Lobby {
  place: string;
  n: number;
  players: Map<string, Seated>;
  watchers: Set<string>;
  // Who moved since the last frame.
  moved: Set<Seated>;
}

type Seated = Player & { at: Lobby | null };

interface Conn {
  login: string | null;
  at: Lobby | null;
  // What this tab last said: a tab starts online.
  status: (typeof STATUSES)[number];
}

const FRAME_MOVER = 8;
const MOVING = 0x8000;

/**
 * Who moved, as bytes, little-endian. Each mover takes 8: their slot (the top bit says they're walking), then x and z
 * in centimetres and their heading in thousandths of a radian (16 bits each, which `coord` and `ry` above always fit).
 * The same frame goes to everyone in the lobby, so a hundred people cost a hundred sends, not ten thousand.
 */
export function frameOf(moved: Iterable<Player>, count: number): Buffer {
  const frame = Buffer.allocUnsafe(count * FRAME_MOVER);
  let at = 0;
  for (const p of moved) {
    frame.writeUInt16LE(p.slot | (p.moving ? MOVING : 0), at);
    frame.writeInt16LE(Math.round(p.x * 100), at + 2);
    frame.writeInt16LE(Math.round(p.z * 100), at + 4);
    frame.writeInt16LE(Math.round(p.ry * 1000), at + 6);
    at += FRAME_MOVER;
  }
  return frame;
}

export class Presence {
  private players = new Map<string, Seated>();
  private conns = new Map<string, Conn>();
  private tabs = new Map<string, Set<string>>();
  private cities = new Map<string, Lobby[]>();
  private moved = new Set<Lobby>();
  private recent = new Map<string, Record<keyof typeof LIMITS, number[]>>();
  // What friends were last told about each person ("idle Dakar"), and who changed since `statusChanges()`.
  private told = new Map<string, string>();
  private changed = new Set<string>();

  constructor(private readonly size = LOBBY_SIZE) {}

  join(conn: string, viewer: Viewer | null): Out[] {
    this.conns.set(conn, { login: viewer?.login ?? null, at: null, status: "online" });
    if (viewer) {
      if (!this.players.has(viewer.login)) this.players.set(viewer.login, { ...viewer, slot: 0, x: 0, z: 0, ry: 0, moving: false, at: null });
      this.tabsOf(viewer.login).add(conn);
      this.touch(viewer.login);
    }
    // Nobody sees you until you say which neighbourhood you're in. Until then, the head count is all you get.
    return [{ to: "one", conn, msg: this.census() }];
  }

  /** A message from a connection. Malformed messages and floods are dropped silently. */
  receive(conn: string, raw: unknown, now = Date.now()): Out[] {
    const c = this.conns.get(conn);
    if (!c) return [];
    const parsed = ClientMessage.safeParse(raw);
    if (!parsed.success) return [];
    const msg = parsed.data;
    if (!this.allow(conn, msg.type, now)) return [];
    if (msg.type === "place") {
      const out = this.moveTo(conn, c, msg.place, msg.lobby);
      if (c.login) this.touch(c.login);
      return out;
    }
    // Only for friends' lists: a visitor has none, and it needs no lobby.
    if (msg.type === "status") {
      c.status = msg.status;
      if (c.login) this.touch(c.login);
      return [];
    }

    // Visitors only watch; nobody moves before arriving somewhere; and a tab left behind in another lobby only watches.
    const player = c.login ? this.players.get(c.login) : undefined;
    if (!player?.at || c.at !== player.at) return [];
    if (msg.type === "move") {
      Object.assign(player, { x: msg.x, z: msg.z, ry: msg.ry, moving: msg.moving });
      player.at.moved.add(player);
      this.moved.add(player.at);
      return [];
    }
    return [{ to: "lobby", lobby: player.at, except: conn, msg: { type: "emote", login: player.login, name: msg.name } }];
  }

  /** Every lobby where someone moved since the last call, with its frame. Moves are remembered until then. */
  frames(): { lobby: Lobby; frame: Buffer }[] {
    const out: { lobby: Lobby; frame: Buffer }[] = [];
    for (const lobby of this.moved) {
      if (lobby.moved.size) out.push({ lobby, frame: frameOf(lobby.moved, lobby.moved.size) });
      lobby.moved.clear();
    }
    this.moved.clear();
    return out;
  }

  leave(conn: string): Out[] {
    const c = this.conns.get(conn);
    this.conns.delete(conn);
    this.recent.delete(conn);
    if (c?.at) c.at.watchers.delete(conn);
    if (!c?.login) {
      if (c?.at) this.tidy(c.at);
      return [];
    }
    const tabs = this.tabsOf(c.login);
    tabs.delete(conn);
    // Still here in another tab: stay.
    if (tabs.size) {
      if (c.at) this.tidy(c.at);
      this.touch(c.login);
      return [];
    }
    this.tabs.delete(c.login);
    const player = this.players.get(c.login);
    this.players.delete(c.login);
    this.touch(c.login);
    const out: Out[] = [];
    if (player?.at) {
      out.push(this.stand(player, conn));
      out.push({ to: "all", msg: this.census() });
    }
    if (c.at) this.tidy(c.at);
    return out;
  }

  /** Connection ids watching any lobby of `place`. */
  watching(place: string): string[] {
    return (this.cities.get(place) ?? []).flatMap((l) => [...l.watchers]);
  }

  /** Connection ids of `login`'s tabs (the same person may have several open). */
  connectionsOf(login: string): string[] {
    return [...(this.tabs.get(login) ?? [])];
  }

  online(): string[] {
    return [...this.players.keys()];
  }

  /** How present `login` is: their most present tab (online, then idle, then away), or offline with none. */
  statusOf(login: string): Status {
    let best: Status = "offline";
    for (const conn of this.tabs.get(login) ?? []) {
      const s = this.conns.get(conn)?.status;
      if (s && (best === "offline" || STATUSES.indexOf(s) < STATUSES.indexOf(best))) best = s;
    }
    return best;
  }

  /** The city `login` walks in, or null: not in one yet, or in a private place (their workshop, "tutorial:<login>"). */
  cityOf(login: string): string | null {
    const place = this.players.get(login)?.at?.place;
    return place && !place.includes(":") ? place : null;
  }

  /** Everyone whose status or city changed since the last call: their friends' lists should look again. */
  statusChanges(): string[] {
    const out = [...this.changed];
    this.changed.clear();
    return out;
  }

  counts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const [place, lobbies] of this.cities) {
      const people = lobbies.reduce((sum, l) => sum + l.players.size, 0);
      if (people) counts[place] = people;
    }
    return counts;
  }

  /** The head count everyone gets. */
  census(): ServerMessage {
    const lobbies: Record<string, LobbyCount[]> = {};
    for (const [place, list] of this.cities) if (list.length > 1) lobbies[place] = list.map((l) => ({ n: l.n, people: l.players.size }));
    return { type: "census", counts: this.counts(), lobbies };
  }

  private moveTo(conn: string, c: Conn, place: string, wanted?: number): Out[] {
    if (c.at?.place === place && (wanted === undefined || c.at.n === wanted)) return [];
    const player = c.login ? this.players.get(c.login) : undefined;
    const before = c.at;
    const fits = (l: Lobby) => !player || l.players.size < this.size;
    const asked = wanted === undefined ? undefined : this.cities.get(place)?.find((l) => l.n === wanted && fits(l));
    // Already in this city (your other tab, or the lobby you asked for is full): you stay, one avatar.
    const lobby = asked ?? (player?.at?.place === place ? player.at : this.pick(place, fits));
    if (lobby === before) return [];
    before?.watchers.delete(conn);
    lobby.watchers.add(conn);
    c.at = lobby;
    const out: Out[] = [];
    if (player && player.at !== lobby) {
      const sameCity = player.at?.place === place;
      const left = player.at;
      if (left) out.push(this.stand(player, conn));
      player.slot = this.freeSlot(lobby);
      player.at = lobby;
      lobby.players.set(player.login, player);
      // A new neighbourhood: you arrive at its entrance, not where you stood in the last one. Another lobby of the
      // same city is the same streets, so you stay where you are.
      if (!sameCity) Object.assign(player, { x: 0, z: 0, ry: 0, moving: false });
      out.push({ to: "lobby", lobby, except: conn, msg: { type: "join", player: shown(player) } });
      out.push({ to: "all", msg: this.census() });
      if (left) this.tidy(left);
    }
    if (before) this.tidy(before);
    const here = [...lobby.players.values()].filter((p) => p.login !== c.login).map(shown);
    out.unshift({ to: "one", conn, msg: { type: "snapshot", you: c.login, place, lobby: lobby.n, players: here } });
    return out;
  }

  /** The first lobby with room, else a new one. */
  private pick(place: string, fits: (l: Lobby) => boolean): Lobby {
    const lobbies = this.cities.get(place) ?? [];
    const found = lobbies.find(fits);
    if (found) return found;
    let n = 1;
    while (lobbies.some((l) => l.n === n)) n++;
    const lobby: Lobby = { place, n, players: new Map(), watchers: new Set(), moved: new Set() };
    this.cities.set(place, [...lobbies, lobby].sort((a, b) => a.n - b.n));
    return lobby;
  }

  /** Takes someone out of their lobby: what to tell those still in it. */
  private stand(player: Seated, conn: string): Out {
    const lobby = player.at!;
    lobby.players.delete(player.login);
    lobby.moved.delete(player);
    player.at = null;
    return { to: "lobby", lobby, except: conn, msg: { type: "leave", login: player.login } };
  }

  // The lowest number nobody in this lobby has, so frames stay small and numbers come back.
  private freeSlot(lobby: Lobby): number {
    const taken = new Set([...lobby.players.values()].map((p) => p.slot));
    let slot = 0;
    while (taken.has(slot)) slot++;
    return slot;
  }

  // A lobby nobody is in or watching any more is gone.
  private tidy(lobby: Lobby) {
    if (lobby.players.size || lobby.watchers.size) return;
    const left = (this.cities.get(lobby.place) ?? []).filter((l) => l !== lobby);
    if (left.length) this.cities.set(lobby.place, left);
    else this.cities.delete(lobby.place);
    this.moved.delete(lobby);
  }

  // Notes a change in what friends see of `login`, if there is one. Away and back between two calls of
  // statusChanges() still counts once.
  private touch(login: string) {
    const status = this.statusOf(login);
    const now = status === "offline" ? "offline" : `${status} ${this.cityOf(login) ?? ""}`;
    if ((this.told.get(login) ?? "offline") === now) return;
    if (status === "offline") this.told.delete(login);
    else this.told.set(login, now);
    this.changed.add(login);
  }

  private tabsOf(login: string): Set<string> {
    let tabs = this.tabs.get(login);
    if (!tabs) this.tabs.set(login, (tabs = new Set()));
    return tabs;
  }

  private allow(conn: string, kind: keyof typeof LIMITS, now: number): boolean {
    const r = this.recent.get(conn) ?? { move: [], emote: [], place: [], status: [] };
    const limit = LIMITS[kind];
    r[kind] = r[kind].filter((t) => now - t < limit.perMs);
    if (r[kind].length >= limit.count) return false;
    r[kind].push(now);
    this.recent.set(conn, r);
    return true;
  }
}

function shown({ at: _, ...player }: Seated): Player {
  return player;
}
