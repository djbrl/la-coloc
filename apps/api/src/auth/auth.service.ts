import { Inject, Injectable } from "@nestjs/common";
import { type Db, type PublicRepo, sessions, users } from "@coloc/db";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { DB } from "../db/db.module";
import type { AuthConfig } from "./auth.config";
import { type HttpRequest, parseCookies } from "./http";

export const AUTH_CONFIG = Symbol("AUTH_CONFIG");
export const SESSION_COOKIE = "coloc_session";
export const STATE_COOKIE = "coloc_oauth_state";
export const SESSION_DAYS = 30;

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
    });
    const token = (await tokenRes.json()) as { access_token?: string; error?: string };
    if (!token.access_token) throw new Error(`GitHub refused the login: ${token.error ?? tokenRes.status}`);

    const userRes = await this.fetch("https://api.github.com/user", {
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token.access_token}`, "User-Agent": "coloc.dev" },
    });
    if (!userRes.ok) throw new Error(`couldn't read the GitHub profile (${userRes.status})`);
    const profile = (await userRes.json()) as GithubProfile;
    return { ...profile, repos: await this.publicRepos(profile.login, token.access_token) };
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
   * inherits anything from a seeded one.
   */
  async upsertGithubUser(p: GithubProfile): Promise<User> {
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
        const [u] = await tx.update(users).set(fields).where(eq(users.id, existing.id)).returning();
        return u;
      }
      const [u] = await tx.insert(users).values({ githubId: p.id, ...fields }).returning();
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
  async devLogin(login: string): Promise<User> {
    if (!this.config.devLogin) throw new Error("dev login is off");
    if (!LOGIN.test(login)) throw new Error("not a valid login");
    const [existing] = await this.db.select().from(users).where(eq(users.login, login));
    if (existing) return existing;
    const [u] = await this.db.insert(users).values({ login, name: login }).returning();
    return u;
  }
}
