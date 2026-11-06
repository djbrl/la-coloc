import "reflect-metadata";
import { chores, type Db, githubInstallations, repos, roomTeammates, rooms, users } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import { and, eq } from "drizzle-orm";
import { createHmac, createVerify, generateKeyPairSync } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { HousesService } from "../houses/houses.service";
import { seedCity } from "../seed/city";
import { ChoresService, type GhEvent, repoList } from "./chores.service";
import { appJwt, type GithubAppClient } from "./github.client";
import { verifySignature } from "./webhook";

describe("webhook signatures", () => {
  const body = Buffer.from('{"action":"opened"}');
  const sign = (secret: string) => "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

  it("accepts GitHub's signature and nothing else", () => {
    expect(verifySignature("s3cret", body, sign("s3cret"))).toBe(true);
    expect(verifySignature("s3cret", body, sign("guess"))).toBe(false);
    expect(verifySignature("s3cret", Buffer.from('{"action":"closed"}'), sign("s3cret"))).toBe(false);
    expect(verifySignature("s3cret", body, undefined)).toBe(false);
    expect(verifySignature("s3cret", body, "sha256=abc")).toBe(false);
  });
});

describe("the App's token", () => {
  it("is a JWT signed with the App's private key, valid under ten minutes", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwt = appJwt({ appId: "12345", privateKey: privateKey.export({ type: "pkcs1", format: "pem" }).toString() }, 1_000_000_000_000);
    const [h, p, sig] = jwt.split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    const payload = JSON.parse(Buffer.from(p, "base64url").toString());
    expect(payload.iss).toBe("12345");
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(600);
    expect(createVerify("RSA-SHA256").update(`${h}.${p}`).verify(publicKey, Buffer.from(sig, "base64url"))).toBe(true);
  });
});

describe("chores", () => {
  let db: Db;
  let houses: HousesService;
  let svc: ChoresService;
  let calls: string[];
  const gh = { jib: { id: 1, login: "jib" }, awa: { id: 2, login: "awa" }, moussa: { id: 3, login: "moussa" } };
  const repo = { id: 100, full_name: "awa/ndaje", private: false };

  beforeAll(async () => {
    db = await testDb();
  });

  beforeEach(async () => {
    await seedCity(db, { agentSecret: "s", domain: (id) => id });
    // Pretend the three flatmates logged in with GitHub.
    for (const [login, u] of Object.entries(gh)) await db.update(users).set({ githubId: u.id }).where(eq(users.login, login));
    calls = [];
    const fake = {
      comment: async (_i: number, r: string, n: number, text: string) => void calls.push(`comment ${r}#${n}: ${text}`),
      requestReview: async (_i: number, r: string, n: number, login: string) => (calls.push(`review ${r}#${n} ${login}`), true),
    } as unknown as GithubAppClient;
    houses = new HousesService(db);
    svc = new ChoresService(db, houses, fake);
    await svc.handle("installation", { action: "created", installation: { id: 7 }, sender: gh.awa, repositories: [repo] });
  });

  const opened = (n: number, by = gh.awa, extra: object = {}): GhEvent => ({
    action: "opened",
    installation: { id: 7 },
    repository: repo,
    pull_request: { number: n, title: `PR ${n}`, html_url: `https://github.com/awa/ndaje/pull/${n}`, user: by, ...extra },
  });
  const review = (n: number, by: { id: number; login: string }, state = "approved"): GhEvent => ({
    action: "submitted",
    repository: repo,
    pull_request: { number: n, title: "", html_url: "", user: gh.awa },
    review: { state, user: by },
  });

  it("links an installed repo to the installer's room, and ignores strangers", async () => {
    const jibs = await houses.view("sacre-coeur", (await db.query.users.findFirst({ where: (u, { eq }) => eq(u.login, "jib") }))!.id);
    expect(jibs!.notes!.some((n) => n.text.includes("moved awa/ndaje into their room"))).toBe(true);
    expect(await svc.handle("installation", { action: "created", installation: { id: 8 }, sender: { id: 999, login: "x" }, repositories: [{ id: 5, full_name: "x/y" }] })).toBe(
      "installer isn't a coloc user",
    );
  });

  it("names public repos in the house's news, and only counts private ones", () => {
    expect(repoList([{ full_name: "awa/ndaje", private: false }, { full_name: "awa/secret", private: true }, { full_name: "awa/unknown" }])).toBe("awa/ndaje, +2");
    expect(repoList([{ full_name: "awa/secret", private: true }])).toBe("+1");
  });

  it("assigns a flatmate who isn't the author, comments, and requests the review", async () => {
    expect(await svc.handle("pull_request", opened(1))).toBe("assigned jib");
    expect(calls[0]).toMatch(/^comment awa\/ndaje#1: \*\*Corvée:\*\* @jib/);
    expect(calls[1]).toBe("review awa/ndaje#1 jib");
  });

  it("never @-mentions someone whose GitHub account isn't linked: the name may belong to a stranger", async () => {
    await db.update(users).set({ githubId: null }).where(eq(users.login, "jib"));
    expect(await svc.handle("pull_request", opened(1))).toBe("assigned jib");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("jib (no GitHub account linked)");
    expect(calls[0]).not.toContain("@jib");
  });

  it("spreads the work: the next PR goes to whoever has the fewest open reviews", async () => {
    await svc.handle("pull_request", opened(1));
    expect(await svc.handle("pull_request", opened(2))).toBe("assigned moussa");
    expect(await svc.handle("pull_request", opened(1))).toBe("already assigned");
  });

  it("never asks the room's teammates to review its project, and finds nobody when everyone is on it", async () => {
    const id = async (login: string) => (await db.query.users.findFirst({ where: (u, { eq }) => eq(u.login, login) }))!.id;
    const [awaRoom] = await db.select().from(rooms).where(and(eq(rooms.houseId, "sacre-coeur"), eq(rooms.name, "awa")));
    // Jib teams up on Ndaje, and Moussa opens the pull request (a collaborator on Awa's repo): Awa is the occupant,
    // Jib her teammate, so neither may review it, and Moussa wrote it.
    await db.insert(roomTeammates).values({ roomId: awaRoom.id, userId: await id("jib") });
    expect(await svc.handle("pull_request", opened(1, gh.moussa))).toBe("nobody to review");
    expect(await db.select().from(chores)).toHaveLength(0);
    // Awa opens one herself: Moussa isn't on the project, so he reviews it, never Jib.
    expect(await svc.handle("pull_request", opened(2))).toBe("assigned moussa");
  });

  it("waits for drafts to be ready", async () => {
    expect(await svc.handle("pull_request", opened(3, gh.awa, { draft: true }))).toMatch(/draft/);
    expect(await svc.handle("pull_request", { ...opened(3), action: "ready_for_review" })).toBe("assigned jib");
  });

  it("counts the review when the assignee submits it, not when someone else does", async () => {
    await svc.handle("pull_request", opened(1));
    expect(await svc.handle("pull_request_review", review(1, gh.moussa))).toBe("not the assignee");
    expect(await svc.handle("pull_request_review", review(1, gh.jib))).toBe("done");
    const [c] = await db.select().from(chores);
    expect(c).toMatchObject({ status: "done", outcome: "approved" });
    // It earned the reviewer credit, once, and nothing for reviewing it again.
    await svc.handle("pull_request_review", review(1, gh.jib));
    expect((await db.select().from(users).where(eq(users.login, "jib")))[0].credit).toBe(15_500);
    expect((await db.select().from(users).where(eq(users.login, "moussa")))[0].credit).toBe(15_000);

    const view = await houses.view("sacre-coeur");
    expect(view!.ledger.find((l) => l.login === "jib")).toEqual({ login: "jib", given: 1, received: 0 });
    expect(view!.ledger.find((l) => l.login === "awa")).toEqual({ login: "awa", given: 0, received: 1 });
  });

  it("puts a note on the fridge once when a review is late", async () => {
    await svc.handle("pull_request", opened(1));
    const later = new Date(Date.now() + 25 * 3600_000);
    expect(await svc.noteLateChores(later)).toBe(1);
    expect(await svc.noteLateChores(later)).toBe(0);
    const jib = (await db.query.users.findFirst({ where: (u, { eq }) => eq(u.login, "jib") }))!;
    const notes = (await houses.view("sacre-coeur", jib.id))!.notes!;
    expect(notes.filter((n) => n.text.includes("hasn't reviewed"))).toHaveLength(1);
  });

  it("shows flatmates the open chores, and nobody else", async () => {
    await svc.handle("pull_request", opened(1));
    const awa = (await db.query.users.findFirst({ where: (u, { eq }) => eq(u.login, "awa") }))!;
    const mine = (await houses.view("sacre-coeur", awa.id))!.chores!;
    expect(mine.map((c) => [c.repo, c.prNumber, c.assignee.login, c.author?.login, c.late])).toEqual([["awa/ndaje", 1, "jib", "awa", false]]);
    expect((await houses.view("sacre-coeur"))!.chores).toBeNull();
  });

  it("ignores PRs in repos that aren't in any room", async () => {
    expect(await svc.handle("pull_request", { ...opened(1), repository: { id: 555, full_name: "else/where" } })).toBe("repo not in any room");
  });
});

describe("installing the App during the tutorial", () => {
  let db: Db;
  let svc: ChoresService;
  const jib = { id: 1, login: "jib" };
  const install = (id: number, names: string[], sender = jib): GhEvent => ({
    action: "created",
    installation: { id },
    sender,
    repositories: names.map((n, i) => ({ id: id * 100 + i, full_name: n })),
  });
  // "house/room": Jib's workshop room and their real room are both called "jib", so the house tells them apart.
  const roomOf = async (repoId: number) => {
    const [r] = await db.select().from(repos).where(eq(repos.githubId, repoId));
    return r && `${r.houseId}/${r.room}`;
  };

  beforeAll(async () => {
    db = await testDb();
  });

  beforeEach(async () => {
    await seedCity(db, { agentSecret: "s", domain: (id) => id });
    await db.update(users).set({ githubId: jib.id }).where(eq(users.login, "jib"));
    // Jib lives in a real house, and is halfway through the tutorial: a second room, in the workshop.
    const [u] = await db.select().from(users).where(eq(users.login, "jib"));
    await db.insert(rooms).values({ houseId: "atelier", name: "jib", occupantId: u.id, memoryMb: 256, cpus: 0.5, status: "empty" });
    svc = new ChoresService(db, new HousesService(db), null);
  });

  it("links the first repo to the workshop room, though the installer lives in two rooms", async () => {
    expect(await svc.handle("installation", install(1, ["jib/hello", "jib/other"]))).toBe("linked 1");
    expect(await roomOf(100)).toBe("atelier/jib");
    expect(await roomOf(101)).toBeUndefined();
  });

  it("puts one repo in the workshop room even when it's the installer's only room", async () => {
    await db.delete(rooms).where(and(eq(rooms.houseId, "sacre-coeur"), eq(rooms.name, "jib")));
    expect(await svc.handle("installation", install(1, ["jib/a", "jib/b", "jib/c"]))).toBe("linked 1");
    expect(await roomOf(100)).toBe("atelier/jib");
    expect(await roomOf(101)).toBeUndefined();
  });

  it("keeps the workshop room to one repo: a second installation is not linked", async () => {
    await svc.handle("installation", install(1, ["jib/hello"]));
    expect(await svc.handle("installation", install(2, ["jib/again"]))).toBe("installer doesn't live in exactly one room");
    expect(await roomOf(200)).toBeUndefined();
    expect(await roomOf(100)).toBe("atelier/jib");
  });

  it("remembers who installed the App on an organisation, and forgets it when it's removed", async () => {
    await db.delete(githubInstallations);
    const onOrg: GhEvent = { ...install(4, ["dakar-devs/meteo"]), installation: { id: 4, account: { login: "dakar-devs" } } };
    await svc.handle("installation", onOrg);
    expect(await db.select().from(githubInstallations)).toMatchObject([{ id: 4, account: "dakar-devs", installerGithubId: 1 }]);
    // Someone else adding repos to it later becomes the one who may pick them.
    await svc.handle("installation_repositories", { action: "added", installation: { id: 4, account: { login: "dakar-devs" } }, sender: { id: 2, login: "awa" }, repositories_added: [] });
    expect((await db.select().from(githubInstallations))[0].installerGithubId).toBe(2);
    // Removed on GitHub: the repo it linked stops following merges, and its room keeps the address.
    expect(await svc.handle("installation", { action: "deleted", installation: { id: 4 }, sender: jib })).toBe("forgot the installation and unlinked 1");
    expect(await db.select().from(githubInstallations)).toEqual([]);
    expect(await db.select().from(repos).where(eq(repos.installationId, 4))).toEqual([]);
    expect(await svc.handle("installation", { action: "deleted", installation: { id: 4 }, sender: jib })).toBe("forgot the installation");
  });

  it("works for repos added to an installation too", async () => {
    const added: GhEvent = { action: "added", installation: { id: 3 }, sender: jib, repositories_added: [{ id: 300, full_name: "jib/added" }] };
    expect(await svc.handle("installation_repositories", added)).toBe("linked 1");
    expect(await roomOf(300)).toBe("atelier/jib");
  });

  it("follows the usual rule once the tutorial is done", async () => {
    await db.update(users).set({ tutorialDoneAt: new Date() }).where(eq(users.login, "jib"));
    expect(await svc.handle("installation", install(1, ["jib/hello"]))).toBe("installer doesn't live in exactly one room");
    expect(await roomOf(100)).toBeUndefined();
  });

  it("never picks one of the workshop's example learners to review", async () => {
    await svc.handle("installation", install(1, ["jib/hello"]));
    const pr: GhEvent = {
      action: "opened",
      installation: { id: 1 },
      sender: jib,
      repository: { id: 100, full_name: "jib/hello" },
      pull_request: { number: 1, title: "Hello", html_url: "https://github.com/jib/hello/pull/1", user: jib },
    };
    // The host and the learners are scenery: with nobody real beside the newcomer, nobody reviews.
    expect(await svc.handle("pull_request", pr)).toBe("nobody to review");
  });

  it("links to the real room when the installer left the workshop room and lives in just one", async () => {
    await db.delete(rooms).where(and(eq(rooms.houseId, "atelier"), eq(rooms.name, "jib")));
    expect(await svc.handle("installation", install(1, ["jib/hello"]))).toBe("linked 1");
    expect((await db.select().from(repos))[0].houseId).toBe("sacre-coeur");
  });
});
