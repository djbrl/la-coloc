// Who's walking around which neighbourhood, and where. Pure: the gateway feeds it connections and messages, it
// answers with what to send to whom. One avatar per person, however many tabs they have open. You only hear about
// the people in your neighbourhood, plus a head count for every neighbourhood (for the travel map).
import { z } from "zod";

export const AVATARS = ["female", "male"].flatMap((s) => "abcdef".split("").map((l) => `${s}-${l}`));
export const EMOTES = ["yes", "no"] as const;

// A neighbourhood is far smaller than this; anything outside is a bug or a cheat.
const coord = z.number().finite().min(-300).max(300);
export const ClientMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("place"), place: z.string().min(1).max(60) }),
  z.object({ type: z.literal("move"), x: coord, z: coord, ry: z.number().finite().min(-10).max(10), moving: z.boolean() }),
  z.object({ type: z.literal("emote"), name: z.enum(EMOTES) }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

export interface Player {
  login: string;
  name: string | null;
  avatar: string | null;
  // Logged in with GitHub, so their profile can be linked; and whether they're an example person (no real
  // invitation can reach them). Their card in the lobby needs both.
  github?: boolean;
  example?: boolean;
  x: number;
  z: number;
  ry: number;
  moving: boolean;
}

export type ServerMessage =
  | { type: "snapshot"; you: string | null; place: string; players: Player[] }
  | { type: "join"; player: Player }
  | { type: "move"; login: string; x: number; z: number; ry: number; moving: boolean }
  | { type: "emote"; login: string; name: (typeof EMOTES)[number] }
  | { type: "leave"; login: string }
  | { type: "census"; counts: Record<string, number> }
  // Something new under your bell (an invitation, a knock): the page fetches /api/notifications. Only to you.
  | { type: "notice" };

export interface Viewer {
  login: string;
  name: string | null;
  avatar: string | null;
  github?: boolean;
  example?: boolean;
}

export type Out =
  | { to: "one"; conn: string; msg: ServerMessage }
  // Everyone in `place` except `except`.
  | { to: "place"; place: string; except: string; msg: ServerMessage }
  | { to: "all"; msg: ServerMessage };

const LIMITS = { move: { count: 20, perMs: 1000 }, emote: { count: 2, perMs: 2000 }, place: { count: 5, perMs: 5000 } };

interface Conn {
  login: string | null;
  place: string | null;
}

export class Presence {
  private players = new Map<string, Player & { place: string | null }>();
  private conns = new Map<string, Conn>();
  private recent = new Map<string, Record<keyof typeof LIMITS, number[]>>();

  join(conn: string, viewer: Viewer | null): Out[] {
    this.conns.set(conn, { login: viewer?.login ?? null, place: null });
    if (viewer && !this.players.has(viewer.login)) this.players.set(viewer.login, { ...viewer, x: 0, z: 0, ry: 0, moving: false, place: null });
    // Nobody sees you until you say which neighbourhood you're in. Until then, the head count is all you get.
    return [{ to: "one", conn, msg: { type: "census", counts: this.counts() } }];
  }

  /** A message from a connection. Malformed messages and floods are dropped silently. */
  receive(conn: string, raw: unknown, now = Date.now()): Out[] {
    const c = this.conns.get(conn);
    if (!c) return [];
    const parsed = ClientMessage.safeParse(raw);
    if (!parsed.success) return [];
    const msg = parsed.data;
    if (!this.allow(conn, msg.type, now)) return [];
    if (msg.type === "place") return this.moveTo(conn, c, msg.place);

    // Visitors only watch; and nobody moves before arriving somewhere.
    if (!c.login || !c.place) return [];
    const player = this.players.get(c.login)!;
    if (msg.type === "move") {
      Object.assign(player, { x: msg.x, z: msg.z, ry: msg.ry, moving: msg.moving });
      return [{ to: "place", place: c.place, except: conn, msg: { type: "move", login: c.login, x: msg.x, z: msg.z, ry: msg.ry, moving: msg.moving } }];
    }
    return [{ to: "place", place: c.place, except: conn, msg: { type: "emote", login: c.login, name: msg.name } }];
  }

  leave(conn: string): Out[] {
    const c = this.conns.get(conn);
    this.conns.delete(conn);
    this.recent.delete(conn);
    if (!c?.login) return [];
    // Still here in another tab: stay.
    if ([...this.conns.values()].some((o) => o.login === c.login)) return [];
    const player = this.players.get(c.login);
    this.players.delete(c.login);
    if (!player?.place) return [];
    return [
      { to: "place", place: player.place, except: conn, msg: { type: "leave", login: c.login } },
      { to: "all", msg: { type: "census", counts: this.counts() } },
    ];
  }

  /** Connection ids watching `place`. */
  watching(place: string): string[] {
    return [...this.conns.entries()].filter(([, c]) => c.place === place).map(([id]) => id);
  }

  /** Connection ids of `login`'s tabs (the same person may have several open). */
  connectionsOf(login: string): string[] {
    return [...this.conns.entries()].filter(([, c]) => c.login === login).map(([id]) => id);
  }

  online(): string[] {
    return [...this.players.keys()];
  }

  counts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const p of this.players.values()) if (p.place) counts[p.place] = (counts[p.place] ?? 0) + 1;
    return counts;
  }

  private moveTo(conn: string, c: Conn, place: string): Out[] {
    if (c.place === place) return [];
    c.place = place;
    const out: Out[] = [];
    const player = c.login ? this.players.get(c.login) : undefined;
    if (player && player.place !== place) {
      if (player.place) out.push({ to: "place", place: player.place, except: conn, msg: { type: "leave", login: player.login } });
      // A new neighbourhood: you arrive at its entrance, not where you stood in the last one.
      Object.assign(player, { place, x: 0, z: 0, ry: 0, moving: false });
      const { place: _, ...shown } = player;
      out.push({ to: "place", place, except: conn, msg: { type: "join", player: shown } });
      out.push({ to: "all", msg: { type: "census", counts: this.counts() } });
    }
    const here = [...this.players.values()].filter((p) => p.place === place && p.login !== c.login).map(({ place: _, ...p }) => p);
    out.unshift({ to: "one", conn, msg: { type: "snapshot", you: c.login, place, players: here } });
    return out;
  }

  private allow(conn: string, kind: keyof typeof LIMITS, now: number): boolean {
    const r = this.recent.get(conn) ?? { move: [], emote: [], place: [] };
    const limit = LIMITS[kind];
    r[kind] = r[kind].filter((t) => now - t < limit.perMs);
    if (r[kind].length >= limit.count) return false;
    r[kind].push(now);
    this.recent.set(conn, r);
    return true;
  }
}
