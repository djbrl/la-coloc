// Who may SSH into which room, and the keys they do it with. A room opens to the person who lives in it and to nobody
// else: not another flatmate, and not the chef, who can restart a flatmate's project but has no business in its files.
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { type Db, rooms, sshKeys, users } from "@coloc/db";
import { RoomName } from "@coloc/protocol";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { createHash } from "node:crypto";
import { utils } from "ssh2";
import { DB } from "../db/db.module";

export const MAX_SSH_KEYS = 10;
const GITHUB_TIMEOUT_MS = 8000;

/** Where someone connects, or null when this server has no SSH door. */
export function sshAddress(): { host: string; port: number } | null {
  const port = Number(process.env.COLOC_SSH_PORT);
  const host = process.env.COLOC_SSH_HOST;
  return port && host && process.env.COLOC_SSH_HOST_KEY_FILE ? { host, port } : null;
}

export interface ParsedKey {
  publicKey: string;
  fingerprint: string;
}

/** One line from an `id_ed25519.pub` file, checked and without its comment. Null: that isn't a public key. */
export function parsePublicKey(text: string): ParsedKey | null {
  const line = text.trim();
  if (line.includes("\n") || line.length > 16_000) return null;
  const key = utils.parseKey(line);
  if (key instanceof Error || Array.isArray(key) || key.isPrivateKey()) return null;
  const blob = key.getPublicSSH();
  return { publicKey: `${key.type} ${blob.toString("base64")}`, fingerprint: `SHA256:${createHash("sha256").update(blob).digest("base64").replace(/=+$/, "")}` };
}

/** "djbrl.eaz" is room djbrl in house eaz. Null: it can't be a room. */
export function parseLogin(username: string): { room: string; houseId: string } | null {
  const dot = username.indexOf(".");
  if (dot < 1 || !RoomName.safeParse(username.slice(0, dot)).success) return null;
  const houseId = username.slice(dot + 1);
  return /^[a-z0-9][a-z0-9-]{0,62}$/.test(houseId) ? { room: username.slice(0, dot), houseId } : null;
}

export interface RoomKey {
  userId: string;
  publicKey: string;
}

@Injectable()
export class SshService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async keys(userId: string) {
    const rows = await this.db.select().from(sshKeys).where(eq(sshKeys.userId, userId)).orderBy(asc(sshKeys.createdAt));
    return rows.map((k) => ({ id: k.id, fingerprint: k.fingerprint, type: k.publicKey.split(" ")[0], fromGithub: k.fromGithub }));
  }

  /** A key someone pasted. Adding one they already have changes nothing. */
  async add(userId: string, text: string) {
    if (text.includes("PRIVATE KEY")) throw new BadRequestException({ message: "That's a private key, and it stays on your computer. Paste the .pub file.", code: "sshPrivateKey" });
    const key = parsePublicKey(text);
    if (!key) throw new BadRequestException({ message: "That isn't a public key. It starts with ssh-ed25519 or ssh-rsa.", code: "sshBadKey" });
    await this.save(userId, [key], false);
    await this.chosen(userId);
    return this.keys(userId);
  }

  /** The public keys GitHub lists for this account: github.com/<login>.keys, which anyone can read. */
  async importGithub(userId: string, login: string) {
    let res: Response;
    try {
      res = await fetch(`https://github.com/${encodeURIComponent(login)}.keys`, { signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS) });
    } catch {
      throw new ConflictException({ message: "GitHub didn't answer. Try again.", code: "sshGithubDown" });
    }
    if (!res.ok) throw new ConflictException({ message: "GitHub didn't answer. Try again.", code: "sshGithubDown" });
    const found = (await res.text()).split("\n").map(parsePublicKey).filter((k): k is ParsedKey => !!k);
    await this.save(userId, found, true);
    await this.chosen(userId);
    return { keys: await this.keys(userId), found: found.length };
  }

  private async save(userId: string, keys: ParsedKey[], fromGithub: boolean) {
    const have = await this.keys(userId);
    const fresh = keys.filter((k) => !have.some((h) => h.fingerprint === k.fingerprint));
    if (have.length + fresh.length > MAX_SSH_KEYS) throw new ConflictException({ message: `${MAX_SSH_KEYS} keys a person. Remove one first.`, code: "sshKeyLimit", max: MAX_SSH_KEYS });
    if (fresh.length) await this.db.insert(sshKeys).values(fresh.map((k) => ({ ...k, userId, fromGithub }))).onConflictDoNothing();
  }

  async remove(userId: string, id: string) {
    const gone = await this.db.delete(sshKeys).where(and(eq(sshKeys.id, id), eq(sshKeys.userId, userId))).returning({ id: sshKeys.id });
    if (!gone.length) throw new NotFoundException("No such key.");
    await this.chosen(userId);
    return this.keys(userId);
  }

  private async chosen(userId: string) {
    await this.db.update(users).set({ sshKeysChosen: true }).where(eq(users.id, userId));
  }

  /** The one person who may enter this room right now: whoever lives in it. Null for a free or example room. */
  private async occupant(houseId: string, roomName: string): Promise<string | null> {
    const [room] = await this.db
      .select()
      .from(rooms)
      .where(and(eq(rooms.houseId, houseId), eq(rooms.name, roomName), isNotNull(rooms.occupantId)));
    return room?.occupantId && !room.demo ? room.occupantId : null;
  }

  /** Every key that opens this room, each with its owner (always the occupant). */
  async keysFor(houseId: string, roomName: string): Promise<RoomKey[]> {
    const occupant = await this.occupant(houseId, roomName);
    if (!occupant) return [];
    return this.db.select({ userId: sshKeys.userId, publicKey: sshKeys.publicKey }).from(sshKeys).where(eq(sshKeys.userId, occupant));
  }

  /** Still allowed in, for someone already inside: they may have moved out. */
  async mayStay(houseId: string, roomName: string, userId: string): Promise<boolean> {
    return (await this.occupant(houseId, roomName)) === userId;
  }
}
