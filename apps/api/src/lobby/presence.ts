// Who's walking around the lobby, and where. Pure: the gateway feeds it connections and messages, it answers with
// what to send to whom. One avatar per person, however many tabs they have open.
import { z } from "zod";

export const AVATARS = ["female", "male"].flatMap((s) => "abcdef".split("").map((l) => `${s}-${l}`));
export const EMOTES = ["yes", "no"] as const;

// The town is about 50 × 40 units; anything far outside is a bug or a cheat.
const coord = z.number().finite().min(-200).max(200);
export const ClientMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("move"), x: coord, z: coord, ry: z.number().finite().min(-10).max(10), moving: z.boolean() }),
  z.object({ type: z.literal("emote"), name: z.enum(EMOTES) }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

export interface Player {
  login: string;
  name: string | null;
  avatar: string | null;
  x: number;
  z: number;
  ry: number;
  moving: boolean;
}

export type ServerMessage =
  | { type: "snapshot"; you: string | null; players: Player[] }
  | { type: "join"; player: Player }
  | { type: "move"; login: string; x: number; z: number; ry: number; moving: boolean }
  | { type: "emote"; login: string; name: (typeof EMOTES)[number] }
  | { type: "leave"; login: string };

export interface Viewer {
  login: string;
  name: string | null;
  avatar: string | null;
}

type Out = { to: "all-but"; except: string; msg: ServerMessage } | { to: "one"; conn: string; msg: ServerMessage };

const LIMITS = { move: { count: 20, perMs: 1000 }, emote: { count: 2, perMs: 2000 } };

export class Presence {
  private players = new Map<string, Player>();
  // Connection id → login (null: a visitor who watches without appearing).
  private conns = new Map<string, string | null>();
  private recent = new Map<string, { move: number[]; emote: number[] }>();

  join(conn: string, viewer: Viewer | null): Out[] {
    this.conns.set(conn, viewer?.login ?? null);
    const out: Out[] = [];
    if (viewer && !this.players.has(viewer.login)) {
      const player: Player = { ...viewer, x: 0, z: 0, ry: 0, moving: false };
      this.players.set(viewer.login, player);
      out.push({ to: "all-but", except: conn, msg: { type: "join", player } });
    }
    out.unshift({ to: "one", conn, msg: { type: "snapshot", you: viewer?.login ?? null, players: [...this.players.values()].filter((p) => p.login !== viewer?.login) } });
    return out;
  }

  /** A message from a connection. Visitors, malformed messages and floods are dropped silently. */
  receive(conn: string, raw: unknown, now = Date.now()): Out[] {
    const login = this.conns.get(conn);
    if (!login) return [];
    const parsed = ClientMessage.safeParse(raw);
    if (!parsed.success) return [];
    const msg = parsed.data;
    if (!this.allow(conn, msg.type, now)) return [];
    const player = this.players.get(login)!;
    if (msg.type === "move") {
      Object.assign(player, { x: msg.x, z: msg.z, ry: msg.ry, moving: msg.moving });
      return [{ to: "all-but", except: conn, msg: { type: "move", login, x: msg.x, z: msg.z, ry: msg.ry, moving: msg.moving } }];
    }
    return [{ to: "all-but", except: conn, msg: { type: "emote", login, name: msg.name } }];
  }

  leave(conn: string): Out[] {
    const login = this.conns.get(conn);
    this.conns.delete(conn);
    this.recent.delete(conn);
    if (!login) return [];
    // Still here in another tab: stay.
    if ([...this.conns.values()].includes(login)) return [];
    this.players.delete(login);
    return [{ to: "all-but", except: conn, msg: { type: "leave", login } }];
  }

  online(): string[] {
    return [...this.players.keys()];
  }

  private allow(conn: string, kind: "move" | "emote", now: number): boolean {
    const r = this.recent.get(conn) ?? { move: [], emote: [] };
    const limit = LIMITS[kind];
    r[kind] = r[kind].filter((t) => now - t < limit.perMs);
    if (r[kind].length >= limit.count) return false;
    r[kind].push(now);
    this.recent.set(conn, r);
    return true;
  }
}
