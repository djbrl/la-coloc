import "reflect-metadata";
import {
  applications,
  arenaChallenges,
  arenaEntries,
  arenaSubmissions,
  billPayments,
  blocks,
  boardPosts,
  chatReads,
  chores,
  creditEntries,
  type Db,
  deployments,
  fridgeNotes,
  githubInstallations,
  houseGuests,
  houses,
  leaseEnds,
  memberships,
  messages,
  notifications,
  repos,
  reports,
  roomSecrets,
  roomTeammates,
  rooms,
  sessions,
  sshKeys,
  users,
  votes,
} from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import { and, eq, like, or, sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AgentRegistry } from "../agents/agent.registry";
import { loadAuthConfig } from "../auth/auth.config";
import { AuthService, FORGET_STATE, SESSION_COOKIE, STATE_COOKIE } from "../auth/auth.service";
import { HousesService } from "../houses/houses.service";
import type { Landlord } from "../houses/landlord";
import { LeasesService } from "../houses/leases.service";
import { readNote } from "../houses/lines";
import { seedCity } from "../seed/city";
import { AccountController } from "./account.controller";
import { AccountService, type AppClient } from "./account.service";

let db: Db;
let housesService: HousesService;
let leases: LeasesService;
let sent: { house: string; cmd: { type: string; room?: string } }[];
let hungUp: string[];
let retired: string[];

// Stands in for GitHub's App API: records each call, and can be told to be down.
class FakeGithub implements AppClient {
  calls: string[] = [];
  live: number | null = null;
  down = false;
  async userInstallation(login: string, githubId?: number) {
    this.calls.push(`lookup ${login} ${githubId}`);
    if (this.down) throw new Error("fetch failed");
    return this.live;
  }
  async deleteInstallation(id: number) {
    this.calls.push(`delete ${id}`);
    if (this.down) throw new Error("fetch failed");
  }
}
let github: FakeGithub;
let account: AccountService;

beforeAll(async () => {
  db = await testDb();
});

beforeEach(async () => {
  // Sacré-Cœur: jib (chef), awa and moussa, room-4 free. Awa's room has Moussa on its team.
  await seedCity(db, { agentSecret: "s", domain: (id) => id });
  await db.delete(githubInstallations);
  await db.insert(users).values({ login: "fatou", name: "Fatou" }).onConflictDoNothing();
  housesService = new HousesService(db);
  sent = [];
  hungUp = [];
  retired = [];
  const agents = {
    isOnline: () => true,
    send: (house: string, cmd: { type: string; room?: string }) => sent.push({ house, cmd }),
    hangUp: (id: string) => hungUp.push(id),
  } as unknown as AgentRegistry;
  leases = new LeasesService(db, housesService, agents, { retire: (id: string) => retired.push(id) } as unknown as Landlord);
  github = new FakeGithub();
  account = new AccountService(db, housesService, leases, github);
});

const HOUSE = "sacre-coeur";
const person = async (login: string) => (await db.select().from(users).where(eq(users.login, login)))[0];
const roomOf = async (name: string, houseId = HOUSE) => (await db.select().from(rooms).where(and(eq(rooms.houseId, houseId), eq(rooms.name, name))))[0];
const chefOf = async (houseId = HOUSE) => (await db.select({ chefId: houses.chefId }).from(houses).where(eq(houses.id, houseId)))[0]?.chefId;
const notesOf = async (houseId = HOUSE) => (await db.select().from(fridgeNotes).where(eq(fridgeNotes.houseId, houseId))).map((n) => readNote(n.text)?.kind ?? n.text);

/**
 * How many rows still mention this person: every column that references users(id), read from the database itself so a
 * new table can't be forgotten, plus the chat channels and read marks named after them.
 */
async function mentions(id: string): Promise<Record<string, number>> {
  const fks = await db.execute<{ tbl: string; col: string }>(sql`
    select c.conrelid::regclass::text as tbl, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.contype = 'f' and c.confrelid = 'users'::regclass`);
  const rows = (fks as unknown as { rows: { tbl: string; col: string }[] }).rows;
  expect(rows.length).toBeGreaterThan(20);
  const found: Record<string, number> = {};
  for (const { tbl, col } of rows) {
    const res = await db.execute(sql.raw(`select count(*)::int as n from ${tbl} where "${col}" = '${id}'`));
    const n = (res as unknown as { rows: { n: number }[] }).rows[0].n;
    if (n) found[`${tbl}.${col}`] = n;
  }
  const [{ n: inChannels }] = await db.select({ n: sql<number>`count(*)::int` }).from(messages).where(like(messages.channel, `%${id}%`));
  const [{ n: inReads }] = await db.select({ n: sql<number>`count(*)::int` }).from(chatReads).where(like(chatReads.channel, `%${id}%`));
  if (inChannels) found["messages.channel"] = inChannels;
  if (inReads) found["chat_reads.channel"] = inReads;
  const [{ n: self }] = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(eq(users.id, id));
  if (self) found.users = self;
  return found;
}

// A life in the city for `login`: a bit of everything that names them, in every table that can.
async function liveALittle(login: string) {
  const me = await person(login);
  const fatou = await person("fatou");
  const moussa = await person("moussa");
  const jib = await person("jib");
  const dm = `dm:${[me.id, fatou.id].sort().join(":")}`;
  await db.insert(sessions).values({ tokenHash: `h-${login}`, userId: me.id, expiresAt: new Date(Date.now() + 86_400_000) });
  await db.insert(sshKeys).values({ userId: me.id, publicKey: "ssh-ed25519 AAAA", fingerprint: `SHA256:${login}` });
  await db.insert(creditEntries).values({ userId: me.id, amount: -1000, reason: "rent" });
  await db.insert(notifications).values([
    { userId: me.id, kind: "rent_together", fromId: fatou.id, state: "open" },
    { userId: fatou.id, kind: "rent_together", fromId: me.id, state: "open" },
  ]);
  await db.insert(blocks).values([{ blockerId: me.id, blockedId: fatou.id }, { blockerId: moussa.id, blockedId: me.id }]);
  // A knock on another house, its thread, a vote on someone else's knock in theirs.
  await db.insert(applications).values({ id: `knock-${login}`, houseId: "almadies", room: "room-3", applicantId: me.id, message: "Hi" });
  await db.insert(applications).values({ id: `knock-fatou-${login}`, houseId: HOUSE, room: "room-4", applicantId: fatou.id, message: "Hello" });
  await db.insert(votes).values({ applicationId: `knock-fatou-${login}`, voterId: me.id, yes: true });
  await db.insert(houseGuests).values({ houseId: "almadies", userId: me.id });
  await db.insert(billPayments).values({ houseId: HOUSE, userId: me.id, month: "2026-10", amount: 3000 });
  await db.insert(leaseEnds).values({ houseId: HOUSE, room: "room-4", userId: me.id, month: "2026-11", memoryMb: 256 });
  // Chat: a DM both ways, a word in the house, their knock's thread, a board post with someone's reply.
  const [post] = await db.insert(boardPosts).values({ city: "Dakar", authorId: me.id, tag: "help", title: "Help", body: "Please" }).returning();
  await db.insert(messages).values([
    { channel: dm, authorId: me.id, body: "salut" },
    { channel: dm, authorId: fatou.id, body: "ça va ?" },
    { channel: `house:${HOUSE}`, authorId: me.id, body: "hello house" },
    { channel: `house:${HOUSE}`, authorId: jib.id, body: "hello you" },
    { channel: `application:knock-${login}`, authorId: null, body: "They knocked." },
    { channel: `post:${post.id}`, authorId: fatou.id, body: "I can help" },
  ]);
  await db.insert(chatReads).values([{ userId: me.id, channel: dm, lastReadId: 1 }, { userId: fatou.id, channel: dm, lastReadId: 1 }]);
  await db.insert(reports).values([
    { reporterId: me.id, kind: "message", targetId: "1", channel: `house:${HOUSE}`, authorId: jib.id, body: "hello you" },
    { reporterId: fatou.id, kind: "post", targetId: post.id, channel: "city:Dakar", authorId: me.id, body: "Please" },
  ]);
  // The Arena.
  await db.insert(arenaChallenges).values({ id: "Dakar:2026-11-02", city: "Dakar", weekStart: "2026-11-02", startsAt: new Date("2026-11-02"), endsAt: new Date("2026-11-09"), slug: "bug-bounty", kind: "bounty", repo: "https://github.com/x/y", path: "c", prizeFcfa: 1 }).onConflictDoNothing();
  await db.insert(arenaEntries).values({ challengeId: "Dakar:2026-11-02", userId: me.id });
  await db.insert(arenaSubmissions).values({ challengeId: "Dakar:2026-11-02", userId: me.id, url: "https://github.com/x/y/pull/1", repo: "x/y", number: Math.floor(Math.random() * 1e6) });
  // Reviews: one asked of them, one of their pull request; a build they started in Moussa's room.
  await db.insert(chores).values([
    { houseId: HOUSE, repoId: 1, repoFullName: "jib/a", prNumber: 1, prTitle: "a", prUrl: "u", authorId: jib.id, assigneeId: me.id, status: "done", dueAt: new Date() },
    { houseId: HOUSE, repoId: 2, repoFullName: "moussa/b", prNumber: 2, prTitle: "b", prUrl: "u", authorId: me.id, assigneeId: moussa.id, status: "done", dueAt: new Date() },
  ]);
  await db.insert(deployments).values({ id: `d-${login}`, houseId: HOUSE, room: "moussa", kind: "prod", repo: "r", ref: "main", status: "live", requestedBy: me.id });
  return { me, dm, post };
}

describe("deleting a plain flatmate", () => {
  it("empties their room, keeps the house, and leaves nothing that names them", async () => {
    const { me, dm, post } = await liveALittle("awa");
    await db.insert(roomSecrets).values({ houseId: HOUSE, room: "awa", name: "API_KEY", value: "x" });
    await db.insert(repos).values({ githubId: 900, fullName: "awa/ndaje", houseId: HOUSE, room: "awa", installationId: 5 });
    // Awa also helps Moussa: a teammate on his room.
    await db.insert(roomTeammates).values({ roomId: (await roomOf("moussa")).id, userId: me.id });
    expect(Object.keys(await mentions(me.id)).length).toBeGreaterThan(15);

    await account.deleteAccount(me);

    expect(await mentions(me.id)).toEqual({});
    // Their room is free and clean, and the caretaker was told to stop its build and remove it.
    const room = await roomOf("awa");
    expect(room).toMatchObject({ occupantId: null, status: "empty", project: null, source: null });
    expect(await db.select().from(roomSecrets).where(eq(roomSecrets.room, "awa"))).toEqual([]);
    expect(await db.select().from(repos).where(eq(repos.githubId, 900))).toEqual([]);
    expect(sent).toEqual([
      { house: HOUSE, cmd: { type: "cancel_build", room: "awa" } },
      { house: HOUSE, cmd: { type: "remove_room", room: "awa" } },
    ]);
    expect(await notesOf()).toContain("flatmateLeft");
    // The house is as it was, chef included.
    expect(await chefOf()).toBe((await person("jib")).id);
    // What stays for others: the build in Moussa's room and the review of Awa's pull request, without her.
    expect((await db.select().from(deployments).where(eq(deployments.id, "d-awa")))[0].requestedBy).toBeNull();
    expect((await db.select().from(chores).where(eq(chores.repoId, 2)))[0].authorId).toBeNull();
    expect(await db.select().from(chores).where(eq(chores.repoId, 1))).toEqual([]);
    // Fatou's report keeps the words for the admins, with no author; Awa's own report is gone.
    expect(await db.select({ authorId: reports.authorId, body: reports.body }).from(reports)).toEqual([{ authorId: null, body: "Please" }]);
    // Chat: the DM is gone both ways, and so are the replies under her post. Jib's word in the house stays.
    expect(await db.select().from(messages).where(or(eq(messages.channel, dm), eq(messages.channel, `post:${post.id}`)))).toEqual([]);
    expect((await db.select({ body: messages.body }).from(messages).where(eq(messages.channel, `house:${HOUSE}`))).map((m) => m.body)).toContain("hello you");
    // Everyone else is untouched.
    expect(await person("fatou")).toBeDefined();
    expect(await db.select().from(memberships).where(eq(memberships.houseId, HOUSE))).toHaveLength(2);
  });

  it("removes their workshop room outright, as taking the tutorial again does", async () => {
    const awa = await person("awa");
    await db.insert(rooms).values({ houseId: "atelier", name: "awa-home", occupantId: awa.id, memoryMb: 256, cpus: 0.5 });
    await db.insert(memberships).values({ houseId: "atelier", userId: awa.id, role: "flatmate", tontinePosition: 9 });
    await account.deleteAccount(awa);
    expect(await roomOf("awa-home", "atelier")).toBeUndefined();
    expect(sent.map((s) => `${s.house}/${s.cmd.type}/${s.cmd.room}`)).toContain("atelier/remove_room/awa-home");
    // The workshop itself stays, with its host.
    expect(await chefOf("atelier")).toBe((await person("ndeye")).id);
    expect(await mentions(awa.id)).toEqual({});
  });
});

describe("deleting a chef", () => {
  it("passes the chef's role to the next in the tontine line when flatmates stay", async () => {
    const { me } = await liveALittle("jib");
    await account.deleteAccount(me);
    expect(await mentions(me.id)).toEqual({});
    // Awa came right after Jib in the line.
    const awa = await person("awa");
    expect(await chefOf()).toBe(awa.id);
    expect((await db.select().from(memberships).where(and(eq(memberships.houseId, HOUSE), eq(memberships.userId, awa.id))))[0].role).toBe("chef");
    expect(await notesOf()).toEqual(expect.arrayContaining(["flatmateLeft", "newChef"]));
    expect((await roomOf("jib")).occupantId).toBeNull();
    expect(hungUp).toEqual([]);
  });

  it("closes the house when they lived there alone", async () => {
    await db.insert(users).values({ login: "solo", name: "Solo" });
    const solo = await person("solo");
    const { id } = await housesService.rent(solo.id, { city: "Dakar", plot: "9.9.9.9", name: "Solo House", tagline: null });
    await db.insert(messages).values({ channel: `house:${id}`, authorId: null, body: "Welcome" });
    await account.deleteAccount(solo);
    expect(await db.select().from(houses).where(eq(houses.id, id))).toEqual([]);
    expect(await db.select().from(rooms).where(eq(rooms.houseId, id))).toEqual([]);
    expect(await db.select().from(messages).where(eq(messages.channel, `house:${id}`))).toEqual([]);
    expect(hungUp).toEqual([id]);
    expect(retired).toEqual([id]);
    expect(await mentions(solo.id)).toEqual({});
  });
});

describe("telling GitHub", () => {
  // Awa logged in with GitHub (id 101). She installed the App on her own account (11, and GitHub knows of 12 today)
  // and on an organisation (22). Installation 33 is on an account that once had her login, installed by a stranger.
  async function githubAwa() {
    await db.update(users).set({ githubId: 101 }).where(eq(users.login, "awa"));
    await db.insert(githubInstallations).values([
      { id: 11, account: "awa", installerGithubId: 101 },
      { id: 22, account: "awa-org", installerGithubId: 101 },
      { id: 33, account: "Awa", installerGithubId: 999 },
    ]);
    // Her repos: one in her room, one in Moussa's room (through her own installation), one of the org's in Jib's.
    await db.insert(repos).values([
      { githubId: 1, fullName: "awa/ndaje", houseId: HOUSE, room: "awa", installationId: 11 },
      { githubId: 2, fullName: "awa/prix", houseId: HOUSE, room: "moussa", installationId: 12 },
      { githubId: 3, fullName: "awa-org/bot", houseId: HOUSE, room: "jib", installationId: 22 },
    ]);
    await db.update(rooms).set({ source: null }).where(eq(rooms.houseId, HOUSE));
    github.live = 12;
    return person("awa");
  }

  it("uninstalls the App from their own account only, and drops our links", async () => {
    const awa = await githubAwa();
    const { github: told } = await account.deleteAccount(awa);
    expect(github.calls).toEqual(["lookup awa 101", "delete 11", "delete 12"]);
    expect(told).toEqual({ removed: [11, 12], failed: [], orgs: ["awa-org"], down: false });
    // Our record of her installations is gone, the stranger's stays.
    expect((await db.select({ id: githubInstallations.id }).from(githubInstallations)).map((r) => r.id)).toEqual([33]);
    // Her repo in Moussa's room is unlinked (it keeps the address); the org's repo in Jib's room isn't hers to drop.
    expect((await db.select({ id: repos.githubId }).from(repos)).map((r) => r.id)).toEqual([3]);
    expect((await roomOf("moussa")).source).toBe("https://github.com/awa/prix");
  });

  it("still deletes everything when GitHub is down, and says so", async () => {
    const awa = await githubAwa();
    github.down = true;
    const { github: told } = await account.deleteAccount(awa);
    expect(told.down).toBe(true);
    expect(told.failed).toEqual([11]);
    expect(await mentions(awa.id)).toEqual({});
    expect((await db.select({ id: githubInstallations.id }).from(githubInstallations)).map((r) => r.id)).toEqual([33]);
  });

  it("logs out, then sends the browser to GitHub to forget us, or says what's left to do by hand", async () => {
    const auth = new AuthService(db, loadAuthConfig({ COLOC_PUBLIC_URL: "http://localhost:5175", COLOC_GITHUB_CLIENT_ID: "cid", COLOC_GITHUB_CLIENT_SECRET: "csecret" }));
    const controller = new AccountController(account, auth);
    const deleteAs = async (login: string, typed: string) => {
      const token = await auth.createSession((await person(login)).id);
      const headers: Record<string, string[]> = {};
      const res = { setHeader: (n: string, v: string[]) => (headers[n] = v), getHeader: (n: string) => headers[n], redirect: () => undefined };
      const out = await controller.remove({ login: typed }, { headers: { cookie: `${SESSION_COOKIE}=${token}` } }, res);
      return { out, cookies: headers["Set-Cookie"] ?? [] };
    };

    await expect(deleteAs("moussa", "awa")).rejects.toMatchObject({ response: { code: "typeYourLogin" } });
    expect(await person("moussa")).toBeDefined();

    await githubAwa();
    const ok = await deleteAs("awa", "AWA");
    expect(ok.out).toMatchObject({ ok: true, manual: false });
    expect(ok.out.forgetUrl).toMatch(/^https:\/\/github\.com\/login\/oauth\/authorize\?client_id=cid&.*state=forget\./);
    expect(ok.cookies.some((c) => c.startsWith(`${SESSION_COOKIE}=;`))).toBe(true);
    expect(ok.cookies.some((c) => c.startsWith(`${STATE_COOKIE}=${encodeURIComponent(FORGET_STATE)}`))).toBe(true);

    // Moussa, with GitHub down: no trip, and the landing will link to GitHub's pages.
    await db.update(users).set({ githubId: 202 }).where(eq(users.login, "moussa"));
    github.down = true;
    const down = await deleteAs("moussa", "moussa");
    expect(down.out).toMatchObject({ ok: true, manual: true, forgetUrl: null });
    expect(await person("moussa")).toBeUndefined();
  });
});

describe("the forget trip", () => {
  // Stands in for GitHub's OAuth: a token for the code, the profile for the token, and the revocations.
  function oauth(profileId: number) {
    const calls: { url: string; method: string; auth?: string; body?: string }[] = [];
    const auth = new AuthService(db, loadAuthConfig({ COLOC_PUBLIC_URL: "http://localhost:5175", COLOC_GITHUB_CLIENT_ID: "cid", COLOC_GITHUB_CLIENT_SECRET: "csecret" }));
    auth.fetch = (async (url: string | URL, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ url: String(url), method: init?.method ?? "GET", auth: headers.Authorization, body: init?.body ? String(init.body) : undefined });
      if (String(url).includes("access_token")) return Response.json({ access_token: "ghu_once" });
      if (String(url).endsWith("/user")) return Response.json({ id: profileId, login: "awa" });
      return new Response(null, { status: 204 });
    }) as typeof fetch;
    return { auth, calls };
  }

  it("revokes the deleted account's authorization with the App's own keys", async () => {
    const { auth, calls } = oauth(101);
    const { state } = auth.startForget(101);
    expect(await auth.forgetOnGithub("code", state)).toBe(true);
    const revoke = calls.at(-1)!;
    expect(revoke).toEqual({
      url: "https://api.github.com/applications/cid/grant",
      method: "DELETE",
      auth: `Basic ${Buffer.from("cid:csecret").toString("base64")}`,
      body: JSON.stringify({ access_token: "ghu_once" }),
    });
    // A trip is used once.
    expect(await auth.forgetOnGithub("code", state)).toBe(false);
  });

  it("only revokes the stray token when another GitHub account comes back", async () => {
    const { auth, calls } = oauth(555);
    const { state } = auth.startForget(101);
    expect(await auth.forgetOnGithub("code", state)).toBe(false);
    expect(calls.at(-1)).toMatchObject({ url: "https://api.github.com/applications/cid/token", method: "DELETE" });
    expect(calls.some((c) => c.url.endsWith("/grant"))).toBe(false);
  });
});

describe("removing the GitHub App, keeping the account", () => {
  it("uninstalls it from their account and unlinks their repos; their rooms and login stay", async () => {
    await db.update(users).set({ githubId: 101 }).where(eq(users.login, "awa"));
    await db.insert(githubInstallations).values([
      { id: 11, account: "awa", installerGithubId: 101 },
      { id: 22, account: "awa-org", installerGithubId: 101 },
    ]);
    await db.insert(repos).values([
      { githubId: 1, fullName: "awa/ndaje", houseId: HOUSE, room: "awa", installationId: 11 },
      { githubId: 3, fullName: "awa-org/bot", houseId: HOUSE, room: "awa", installationId: 22 },
    ]);
    await db.update(rooms).set({ source: null, status: "live", url: "http://awa.sacre-coeur" }).where(eq(rooms.name, "awa"));
    await db.insert(chores).values({ houseId: HOUSE, repoId: 1, repoFullName: "awa/ndaje", prNumber: 7, prTitle: "x", prUrl: "u", assigneeId: (await person("jib")).id, dueAt: new Date() });
    const awa = await person("awa");

    expect(await account.removeApp(awa)).toEqual({ unlinked: 2, orgs: ["awa-org"] });
    expect(github.calls).toEqual(["lookup awa 101", "delete 11"]);
    expect(await db.select().from(repos)).toEqual([]);
    expect(await db.select().from(githubInstallations)).toEqual([]);
    expect(await db.select().from(chores).where(eq(chores.repoId, 1))).toEqual([]);
    // Still running its last build, still hers, with the repo's address for the page.
    expect(await roomOf("awa")).toMatchObject({ occupantId: awa.id, status: "live", source: expect.stringMatching(/^https:\/\/github\.com\/awa/) });
    expect(await person("awa")).toBeDefined();
    expect(sent).toEqual([]);
  });

  it("changes nothing when GitHub is down", async () => {
    await db.update(users).set({ githubId: 101 }).where(eq(users.login, "awa"));
    await db.insert(githubInstallations).values({ id: 11, account: "awa", installerGithubId: 101 });
    await db.insert(repos).values({ githubId: 1, fullName: "awa/ndaje", houseId: HOUSE, room: "awa", installationId: 11 });
    github.down = true;
    await expect(account.removeApp(await person("awa"))).rejects.toMatchObject({ response: { code: "githubDown" } });
    expect(await db.select().from(repos)).toHaveLength(1);
    expect(await db.select().from(githubInstallations)).toHaveLength(1);
  });
});
