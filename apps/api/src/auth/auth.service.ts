import { Inject, Injectable, Logger } from "@nestjs/common";
import { type Db, type PublicRepo, sessions, users } from "@coloc/db";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { DB } from "../db/db.module";
import type { AuthConfig } from "./auth.config";
import { homeCityFor } from "./homeCity";
import { type HttpRequest, parseCookies } from "./http";

export const AUTH_CONFIG = Symbol("AUTH_CONFIG");
export const SESSION_COOKIE = "coloc_session";
export const STATE_COOKIE = "coloc_oauth_state";
export const SESSION_DAYS = 30;
// A login trip's state starts with this when it's a deleted account's trip to make GitHub forget us, not a login.
export const FORGET_STATE = "forget.";
const GITHUB_TIMEOUT_MS = 8000;

export type User = typeof users.$inferSelect;

export interface GithubProfile {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  // Ours, not GitHub's: their top public repos, read at login. Undefined when GitHub didn't say (keep what we had).
  repos?: PublicRepo[];
}

interface GithubRepo {
  full_name: string;
  html_url: string;
  language: string | null;
  fork: boolean;
  archived?: boolean;
  stargazers_count: number;
  pushed_at: string | null;
}

/** Someone's best public repos for their knock: their own (no forks, nothing archived), most stars first, then most recently pushed. */
export function topRepos(list: GithubRepo[], n = 3): PublicRepo[] {
  return list
    .filter((r) => !r.fork && !r.archived)
    .sort((a, b) => b.stargazers_count - a.stargazers_count || (b.pushed_at ?? "").localeCompare(a.pushed_at ?? ""))
    .slice(0, n)
    .map((r) => ({ fullName: r.full_name, url: r.html_url, language: r.language }));
}

const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

@Injectable()
export class AuthService {
  private readonly log = new Logger("auth");
  // Swappable in tests, so the GitHub flow can be checked without calling GitHub.
  fetch: typeof globalThis.fetch = (...args) => globalThis.fetch(...args);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AUTH_CONFIG) readonly config: AuthConfig,
  ) {}

  /** Starts a session and returns the token for the cookie. Only its hash is stored. */
  async createSession(userId: string): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
    await this.db.insert(sessions).values({ tokenHash: tokenHash(token), userId, expiresAt });
    // Housekeeping while we're here.
    await this.db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
    return token;
  }

  // One-minute, single-use passes for the lobby's WebSocket, for a page served from another host than the API (the
  // site on Vercel, the API behind a tunnel): the page asks for one through /api (where its cookie goes), then
  // opens the socket straight to the API with it. Kept in memory: a restart only means asking again.
  private tickets = new Map<string, { userId: string; expires: number }>();

  issueTicket(userId: string): string {
    const now = Date.now();
    for (const [t, v] of this.tickets) if (v.expires < now) this.tickets.delete(t);
    const ticket = randomBytes(24).toString("base64url");
    this.tickets.set(ticket, { userId, expires: now + 60_000 });
    return ticket;
  }

  /** The person a pass was issued to, once: the pass is gone after this, used or not. */
  async userFromTicket(ticket: string): Promise<User | null> {
    const t = this.tickets.get(ticket);
    this.tickets.delete(ticket);
    if (!t || t.expires < Date.now()) return null;
    const [u] = await this.db.select().from(users).where(eq(users.id, t.userId));
    return u ?? null;
  }

  async userFromRequest(req: HttpRequest): Promise<User | null> {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!token) return null;
    const [row] = await this.db
      .select({ user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, tokenHash(token)), gt(sessions.expiresAt, new Date())));
    return row?.user ?? null;
  }

  async endSession(req: HttpRequest) {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token) await this.db.delete(sessions).where(eq(sessions.tokenHash, tokenHash(token)));
  }

  githubAuthorizeUrl(state: string): string {
    if (!this.config.github) throw new Error("GitHub login isn't configured");
    const u = new URL("https://github.com/login/oauth/authorize");
    u.searchParams.set("client_id", this.config.github.clientId);
    u.searchParams.set("redirect_uri", `${this.config.publicUrl}/api/auth/github/callback`);
    u.searchParams.set("state", state);
    return u.toString();
  }

  /**
   * Trades GitHub's one-time code for the user's profile, plus their top public repos (shown to a house they knock
   * on). We don't keep GitHub's token: it's used for these two reads and forgotten.
   */
  async githubProfile(code: string): Promise<GithubProfile> {
    const accessToken = await this.exchangeCode(code);
    const profile = await this.githubUser(accessToken);
    return { ...profile, repos: await this.publicRepos(profile.login, accessToken) };
  }

  // GitHub's one-time code, traded for the person's token.
  private async exchangeCode(code: string, timeoutMs?: number): Promise<string> {
    if (!this.config.github) throw new Error("GitHub login isn't configured");
    const tokenRes = await this.fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: this.config.github.clientId,
        client_secret: this.config.github.clientSecret,
        code,
        redirect_uri: `${this.config.publicUrl}/api/auth/github/callback`,
      }),
      ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
    });
    const token = (await tokenRes.json()) as { access_token?: string; error?: string };
    if (!token.access_token) throw new Error(`GitHub refused the login: ${token.error ?? tokenRes.status}`);
    return token.access_token;
  }

  private async githubUser(accessToken: string, timeoutMs?: number): Promise<GithubProfile> {
    const userRes = await this.fetch("https://api.github.com/user", {
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${accessToken}`, "User-Agent": "coloc.dev" },
      ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
    });
    if (!userRes.ok) throw new Error(`couldn't read the GitHub profile (${userRes.status})`);
    return (await userRes.json()) as GithubProfile;
  }

  // ---- Forgetting a deleted account on GitHub ----
  //
  // We never keep a person's GitHub token, and GitHub only revokes an authorization given one. So once an account is
  // deleted, the browser goes through GitHub's login once more (instant: they already said yes to the App), and the
  // token that comes back is used for one thing: telling GitHub to drop the authorization, and every token with it.
  // Each trip is tied to the deleted account's GitHub id, kept in memory for ten minutes, and used once.
  private forgets = new Map<string, { githubId: number; expires: number }>();

  /** The state for a forget trip (it goes in the state cookie too), and where to send the browser. */
  startForget(githubId: number): { state: string; url: string } {
    const now = Date.now();
    for (const [s, v] of this.forgets) if (v.expires < now) this.forgets.delete(s);
    const state = `${FORGET_STATE}${randomBytes(16).toString("base64url")}`;
    this.forgets.set(state, { githubId, expires: now + 10 * 60_000 });
    return { state, url: this.githubAuthorizeUrl(state) };
  }

  /**
   * Back from GitHub on a forget trip: revokes the App's authorization for the deleted account. False when it couldn't
   * (an unknown or old trip, GitHub down, or a different GitHub account signed in, whose token is revoked alone).
   */
  async forgetOnGithub(code: string, state: string): Promise<boolean> {
    const trip = this.forgets.get(state);
    this.forgets.delete(state);
    if (!trip || trip.expires < Date.now() || !this.config.github) return false;
    try {
      const token = await this.exchangeCode(code, GITHUB_TIMEOUT_MS);
      const who = await this.githubUser(token, GITHUB_TIMEOUT_MS);
      if (who.id !== trip.githubId) {
        // Someone else's GitHub is signed in in this browser: leave nothing behind for them, and say it didn't work.
        await this.revoke("token", token);
        return false;
      }
      return await this.revoke("grant", token);
    } catch (e) {
      this.log.warn(`couldn't revoke a deleted account's GitHub authorization: ${(e as Error).message}`);
      return false;
    }
  }

  // DELETE /applications/{client_id}/grant drops the person's whole authorization (and every token); …/token only that
  // token. Both answer with the App's own client id and secret.
  private async revoke(what: "grant" | "token", accessToken: string): Promise<boolean> {
    const { clientId, clientSecret } = this.config.github!;
    const res = await this.fetch(`https://api.github.com/applications/${encodeURIComponent(clientId)}/${what}`, {
      method: "DELETE",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/json",
        "User-Agent": "coloc.dev",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ access_token: accessToken }),
      signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
    });
    if (!res.ok) this.log.warn(`GitHub refused to revoke the ${what} (${res.status})`);
    return res.ok;
  }

  // Their public repos, best first. Never fails the login: if GitHub doesn't answer, we keep what we had.
  private async publicRepos(login: string, accessToken: string): Promise<PublicRepo[] | undefined> {
    try {
      const res = await this.fetch(`https://api.github.com/users/${encodeURIComponent(login)}/repos?type=owner&sort=pushed&per_page=50`, {
        headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${accessToken}`, "User-Agent": "coloc.dev" },
      });
      const list = res.ok ? await res.json() : null;
      return Array.isArray(list) ? topRepos(list as GithubRepo[]) : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Finds or creates the user for a GitHub account, keyed by GitHub's numeric id (logins can change).
   * If a seeded demo user already holds that login, the demo user is renamed: a GitHub account never
   * inherits anything from a seeded one. `ip`: where they logged in from, for the city they belong to; it isn't kept.
   * A city once given stays: moving around never changes it.
   */
  async upsertGithubUser(p: GithubProfile, ip: string | null = null): Promise<User> {
    const fields = {
      login: p.login,
      name: p.name,
      avatarUrl: p.avatar_url,
      bio: p.bio,
      location: p.location,
      ...(p.repos !== undefined ? { githubRepos: p.repos } : {}),
    };
    return this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ login: `${p.login}-demo` })
        .where(and(eq(users.login, p.login), isNull(users.githubId)));
      const [existing] = await tx.select().from(users).where(eq(users.githubId, p.id));
      if (existing) {
        const [u] = await tx.update(users).set({ ...fields, homeCity: existing.homeCity ?? homeCityFor(ip) }).where(eq(users.id, existing.id)).returning();
        return u;
      }
      const [u] = await tx.insert(users).values({ githubId: p.id, ...fields, homeCity: homeCityFor(ip) }).returning();
      return u;
    });
  }

  async setAvatar(userId: string, avatar: string) {
    await this.db.update(users).set({ avatar }).where(eq(users.id, userId));
  }

  // Done keeps the first time they finished; not done clears it, so the tutorial starts again.
  async setTutorialDone(userId: string, done: boolean) {
    if (done) await this.db.update(users).set({ tutorialDoneAt: new Date() }).where(and(eq(users.id, userId), isNull(users.tutorialDoneAt)));
    else await this.db.update(users).set({ tutorialDoneAt: null }).where(eq(users.id, userId));
  }

  /** Development only (COLOC_DEV_LOGIN=1): be anyone, creating them if needed. */
  async devLogin(login: string, ip: string | null = null): Promise<User> {
    if (!this.config.devLogin) throw new Error("dev login is off");
    if (!LOGIN.test(login)) throw new Error("not a valid login");
    const [existing] = await this.db.select().from(users).where(eq(users.login, login));
    if (existing) return existing;
    const [u] = await this.db.insert(users).values({ login, name: login, homeCity: homeCityFor(ip) }).returning();
    return u;
  }
}
