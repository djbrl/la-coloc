import "reflect-metadata";
import { type Db, sessions, users } from "@coloc/db";
import { testDb } from "@coloc/db/dist/testing";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedCity } from "../seed/city";
import { loadAuthConfig } from "./auth.config";
import { AuthService, SESSION_COOKIE } from "./auth.service";

let db: Db;
beforeAll(async () => {
  db = await testDb();
});
beforeEach(async () => {
  await seedCity(db, { agentSecret: "s", domain: (id) => id });
});

const config = (env: Record<string, string> = {}) =>
  loadAuthConfig({ COLOC_PUBLIC_URL: "http://localhost:5173", COLOC_GITHUB_CLIENT_ID: "cid", COLOC_GITHUB_CLIENT_SECRET: "csecret", ...env });
const cookie = (token: string) => ({ headers: { cookie: `other=1; ${SESSION_COOKIE}=${token}` } });

// Stands in for GitHub: hands out a token for the right code, then the profile for that token.
function fakeGithub(profile: object) {
  const calls: string[] = [];
  const fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push(String(url));
    if (String(url).includes("access_token")) {
      const body = JSON.parse(String(init?.body));
      if (body.code !== "good-code" || body.client_secret !== "csecret") return Response.json({ error: "bad_verification_code" });
      return Response.json({ access_token: "gho_x" });
    }
    if ((init?.headers as Record<string, string>).Authorization !== "Bearer gho_x") return new Response("", { status: 401 });
    if (String(url).includes("/repos")) {
      return Response.json([
        { full_name: "jib/old", html_url: "https://github.com/jib/old", language: "C", fork: false, stargazers_count: 0, pushed_at: "2020-01-01T00:00:00Z" },
        { full_name: "jib/forked", html_url: "https://github.com/jib/forked", language: "Go", fork: true, stargazers_count: 99, pushed_at: "2026-01-01T00:00:00Z" },
        { full_name: "jib/coloc", html_url: "https://github.com/jib/coloc", language: "TypeScript", fork: false, stargazers_count: 12, pushed_at: "2026-10-01T00:00:00Z" },
        { full_name: "jib/new", html_url: "https://github.com/jib/new", language: null, fork: false, stargazers_count: 0, pushed_at: "2026-10-09T00:00:00Z" },
        { full_name: "jib/mid", html_url: "https://github.com/jib/mid", language: "Python", fork: false, stargazers_count: 3, pushed_at: "2025-01-01T00:00:00Z" },
      ]);
    }
    return Response.json(profile);
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

describe("sessions", () => {
  it("logs you in with the cookie, and only stores the token's hash", async () => {
    const auth = new AuthService(db, config());
    const jib = (await db.query.users.findFirst({ where: (u, { eq }) => eq(u.login, "jib") }))!;
    const token = await auth.createSession(jib.id);
    expect((await auth.userFromRequest(cookie(token)))!.login).toBe("jib");
    const stored = await db.select().from(sessions);
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it("refuses unknown, expired and ended sessions", async () => {
    const auth = new AuthService(db, config());
    expect(await auth.userFromRequest(cookie("made-up"))).toBeNull();
    expect(await auth.userFromRequest({ headers: {} })).toBeNull();

    const jib = (await db.query.users.findFirst({ where: (u, { eq }) => eq(u.login, "jib") }))!;
    const token = await auth.createSession(jib.id);
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await auth.userFromRequest(cookie(token))).toBeNull();

    const again = await auth.createSession(jib.id);
    await auth.endSession(cookie(again));
    expect(await auth.userFromRequest(cookie(again))).toBeNull();
  });
});

describe("GitHub login", () => {
  const profile = { id: 4242, login: "jib", name: "Jib", avatar_url: "https://avatars/jib", bio: null, location: "Dakar" };

  it("sends people to GitHub with our client id, callback and state", () => {
    const url = new URL(new AuthService(db, config()).githubAuthorizeUrl("st4te"));
    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("cid");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:5173/api/auth/github/callback");
    expect(url.searchParams.get("state")).toBe("st4te");
  });

  it("trades the code for the profile", async () => {
    const auth = new AuthService(db, config());
    auth.fetch = fakeGithub(profile).fetch;
    expect((await auth.githubProfile("good-code")).id).toBe(4242);
    await expect(auth.githubProfile("stolen-code")).rejects.toThrow(/refused/);
  });

  it("keeps their top three public repos, their own, best first", async () => {
    const auth = new AuthService(db, config());
    auth.fetch = fakeGithub(profile).fetch;
    const p = await auth.githubProfile("good-code");
    expect(p.repos!.map((r) => r.fullName)).toEqual(["jib/coloc", "jib/mid", "jib/new"]);
    const u = await auth.upsertGithubUser(p);
    expect(u.githubRepos).toEqual([
      { fullName: "jib/coloc", url: "https://github.com/jib/coloc", language: "TypeScript" },
      { fullName: "jib/mid", url: "https://github.com/jib/mid", language: "Python" },
      { fullName: "jib/new", url: "https://github.com/jib/new", language: null },
    ]);
    // A login where GitHub didn't list the repos keeps the ones we had.
    expect((await auth.upsertGithubUser(profile)).githubRepos).toHaveLength(3);
  });

  it("never lets a GitHub account inherit a seeded demo user with the same login", async () => {
    const auth = new AuthService(db, config());
    const demoJib = (await db.query.users.findFirst({ where: (u, { eq }) => eq(u.login, "jib") }))!;
    const real = await auth.upsertGithubUser(profile);
    expect(real.id).not.toBe(demoJib.id);
    expect(real.login).toBe("jib");
    const [renamed] = await db.select().from(users).where(eq(users.id, demoJib.id));
    expect(renamed.login).toBe("jib-demo");
  });

  it("finds the same person again by GitHub id, even after they rename", async () => {
    const auth = new AuthService(db, config());
    const first = await auth.upsertGithubUser(profile);
    const second = await auth.upsertGithubUser({ ...profile, login: "jib-new" });
    expect(second.id).toBe(first.id);
    expect(second.login).toBe("jib-new");
  });

  it("is off when no client id is configured", () => {
    const auth = new AuthService(db, loadAuthConfig({}));
    expect(auth.config.github).toBeNull();
    expect(() => auth.githubAuthorizeUrl("s")).toThrow();
  });
});

describe("dev login", () => {
  it("only works when COLOC_DEV_LOGIN=1", async () => {
    await expect(new AuthService(db, config()).devLogin("jib")).rejects.toThrow(/off/);
    const auth = new AuthService(db, config({ COLOC_DEV_LOGIN: "1" }));
    expect((await auth.devLogin("jib")).login).toBe("jib");
    expect((await auth.devLogin("fatou")).login).toBe("fatou");
    await expect(auth.devLogin("../etc")).rejects.toThrow();
  });
});
