// Who may enter a room over SSH, and the keys they do it with.
import { type Db, memberships, roomTeammates, rooms, users } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import { and, eq } from "drizzle-orm";
import { utils } from "ssh2";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { seedCity } from "../seed/city";
import { MAX_SSH_KEYS, parseLogin, parsePublicKey, SshService } from "./ssh.service";

// A real key each time, as `ssh-keygen` would write it.
const newKey = () => {
  const made = utils.generateKeyPairSync("ed25519");
  return made.public;
};

let db: Db;
let ssh: SshService;
let awa: string;
let room: typeof rooms.$inferSelect;
let chef: string;

beforeAll(async () => {
  db = await testDb();
});

beforeEach(async () => {
  await seedCity(db, { agentSecret: "s", domain: (id) => id });
  ssh = new SshService(db);
  [{ id: awa }] = await db.select({ id: users.id }).from(users).where(eq(users.login, "awa"));
  [room] = await db.select().from(rooms).where(and(eq(rooms.houseId, "sacre-coeur"), eq(rooms.occupantId, awa)));
  [{ userId: chef }] = await db.select({ userId: memberships.userId }).from(memberships).where(and(eq(memberships.houseId, "sacre-coeur"), eq(memberships.role, "chef")));
  // In the seeded city this is an example room; here it's a real one.
  await db.update(rooms).set({ demo: false }).where(eq(rooms.id, room.id));
});

afterEach(() => vi.unstubAllGlobals());

describe("reading a key", () => {
  it("takes a public key, without its comment", () => {
    const key = parsePublicKey(`${newKey()} awa@laptop`);
    expect(key?.publicKey).toMatch(/^ssh-ed25519 [A-Za-z0-9+/=]+$/);
    expect(key?.fingerprint).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/);
  });

  it("refuses anything else", () => {
    expect(parsePublicKey("hello")).toBeNull();
    expect(parsePublicKey("")).toBeNull();
    expect(parsePublicKey(utils.generateKeyPairSync("ed25519").private)).toBeNull();
  });
});

describe("reading a login", () => {
  it("is a room and a house", () => {
    expect(parseLogin("djbrl.eaz")).toEqual({ room: "djbrl", houseId: "eaz" });
    expect(parseLogin("room-2.sacre-coeur")).toEqual({ room: "room-2", houseId: "sacre-coeur" });
  });

  it("isn't anything else", () => {
    for (const bad of ["root", "", ".eaz", "djbrl.", "Djbrl.eaz", "a.eaz", "djbrl.EAZ", "djbrl.eaz;rm", "../x.eaz", "djbrl.eaz.x"]) expect(parseLogin(bad)).toBeNull();
  });
});

describe("someone's keys", () => {
  it("adds, lists and removes, and adding one twice changes nothing", async () => {
    const key = newKey();
    await ssh.add(awa, key);
    const keys = await ssh.add(awa, `${key} another-comment`);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatchObject({ type: "ssh-ed25519", fromGithub: false });
    expect(await ssh.remove(awa, keys[0].id)).toEqual([]);
  });

  it("won't let someone remove another person's key", async () => {
    const [k] = await ssh.add(awa, newKey());
    await expect(ssh.remove(chef, k.id)).rejects.toThrow("No such key");
  });

  it("refuses a private key and says why, without keeping it", async () => {
    const refused = await ssh.add(awa, utils.generateKeyPairSync("ed25519").private).catch((e) => e);
    expect(refused.getResponse().code).toBe("sshPrivateKey");
    expect(await ssh.keys(awa)).toEqual([]);
  });

  it("has a limit", async () => {
    for (let i = 0; i < MAX_SSH_KEYS; i++) await ssh.add(awa, newKey());
    const refused = await ssh.add(awa, newKey()).catch((e) => e);
    expect(refused.getResponse().code).toBe("sshKeyLimit");
  });

  it("imports what GitHub lists, skipping what it can't read", async () => {
    const fetchMock = vi.fn(async () => new Response(`${newKey()}\nnot a key\n${newKey()}\n`));
    vi.stubGlobal("fetch", fetchMock);
    const { keys, found } = await ssh.importGithub(awa, "awa");
    expect(found).toBe(2);
    expect(keys.every((k) => k.fromGithub)).toBe(true);
    expect(fetchMock.mock.calls[0]).toEqual(["https://github.com/awa.keys", expect.anything()]);
    const [{ chosen }] = await db.select({ chosen: users.sshKeysChosen }).from(users).where(eq(users.id, awa));
    expect(chosen).toBe(true);
  });

  it("says so when GitHub doesn't answer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    const refused = await ssh.importGithub(awa, "awa").catch((e) => e);
    expect(refused.getResponse().code).toBe("sshGithubDown");
  });
});

describe("who may enter a room", () => {
  const openers = async () => (await ssh.keysFor("sacre-coeur", room.name)).map((k) => k.userId);

  beforeEach(async () => {
    await ssh.add(awa, newKey());
    await ssh.add(chef, newKey());
  });

  it("is the person who lives there, not the chef", async () => {
    expect(chef).not.toBe(awa);
    expect(await openers()).toEqual([awa]);
    expect(await ssh.mayStay("sacre-coeur", room.name, chef)).toBe(false);
  });

  it("is nobody else: not another flatmate, not a row left over from teaming up", async () => {
    const [{ id: moussa }] = await db.select({ id: users.id }).from(users).where(eq(users.login, "moussa"));
    await ssh.add(moussa, newKey());
    // Teaming up is gone, but an older database may still say Moussa was on Awa's team.
    await db.insert(roomTeammates).values({ roomId: room.id, userId: moussa });
    expect(await openers()).toEqual([awa]);
    expect(await ssh.mayStay("sacre-coeur", room.name, moussa)).toBe(false);
    expect(await ssh.mayStay("sacre-coeur", room.name, awa)).toBe(true);
  });

  it("is nobody for an empty room, an example room, or one that isn't there", async () => {
    expect(await ssh.keysFor("sacre-coeur", "no-such-room")).toEqual([]);
    expect(await ssh.keysFor("no-such-house", room.name)).toEqual([]);
    await db.update(rooms).set({ demo: true }).where(eq(rooms.id, room.id));
    expect(await openers()).toEqual([]);
    await db.update(rooms).set({ demo: false, occupantId: null }).where(eq(rooms.id, room.id));
    expect(await openers()).toEqual([]);
    expect(await ssh.mayStay("sacre-coeur", room.name, awa)).toBe(false);
  });
});
