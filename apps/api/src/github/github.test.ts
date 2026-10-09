import "reflect-metadata";
import { chores, type Db, users } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import { eq } from "drizzle-orm";
import { createHmac, createVerify, generateKeyPairSync } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { HousesService } from "../houses/houses.service";
import { seedCity } from "../seed/city";
import { ChoresService, type GhEvent } from "./chores.service";
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
  const repo = { id: 100, full_name: "awa/ndaje" };

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
    expect(jibs!.notes!.some((n) => n.text.includes("moved awa/ndaje into awa"))).toBe(true);
    expect(await svc.handle("installation", { action: "created", installation: { id: 8 }, sender: { id: 999, login: "x" }, repositories: [{ id: 5, full_name: "x/y" }] })).toBe(
      "installer isn't a coloc user",
    );
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
