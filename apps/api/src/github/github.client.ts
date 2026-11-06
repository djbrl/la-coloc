// Talking to GitHub as the coloc App. The App proves who it is with a short JWT signed by its private key,
// then trades it for an installation token: valid one hour, and only for the repos that installation covers.
import { createSign } from "node:crypto";
import type { GithubAppConfig } from "./github.config";

const API = "https://api.github.com";

function base64url(data: string | Buffer): string {
  return Buffer.from(data).toString("base64url");
}

export function appJwt(cfg: Pick<GithubAppConfig, "appId" | "privateKey">, now = Date.now()): string {
  const iat = Math.floor(now / 1000) - 60; // a minute back, in case our clock runs ahead of GitHub's
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ iat, exp: iat + 9 * 60, iss: cfg.appId }));
  const signature = createSign("RSA-SHA256").update(`${header}.${payload}`).sign(cfg.privateKey);
  return `${header}.${payload}.${base64url(signature)}`;
}

/** What GitHub says about a repo, as much as the picker shows. */
export interface GhRepoInfo {
  id: number;
  full_name: string;
  description: string | null;
  language: string | null;
  private: boolean;
  pushed_at: string | null;
}

export class GithubAppClient {
  // Swappable in tests.
  fetch: typeof globalThis.fetch = (...args) => globalThis.fetch(...args);
  private tokens = new Map<number, { token: string; expiresAt: number }>();

  constructor(private readonly cfg: GithubAppConfig) {}

  async installationToken(installationId: number): Promise<string> {
    const cached = this.tokens.get(installationId);
    if (cached && cached.expiresAt - Date.now() > 5 * 60_000) return cached.token;
    const res = await this.fetch(`${API}/app/installations/${installationId}/access_tokens`, {
      method: "POST",
      headers: this.headers(`Bearer ${appJwt(this.cfg)}`),
    });
    if (!res.ok) throw new Error(`GitHub refused an installation token (${res.status})`);
    const body = (await res.json()) as { token: string; expires_at: string };
    this.tokens.set(installationId, { token: body.token, expiresAt: Date.parse(body.expires_at) });
    return body.token;
  }

  /** The repo's default branch: what a redeploy builds when the room doesn't pin one. */
  async defaultBranch(installationId: number, repo: string): Promise<string> {
    const token = await this.installationToken(installationId);
    const res = await this.fetch(`${API}/repos/${repo}`, { headers: this.headers(`token ${token}`) });
    if (!res.ok) throw new Error(`couldn't read ${repo} (${res.status})`);
    return ((await res.json()) as { default_branch: string }).default_branch;
  }

  /**
   * The App's installation on this person's own account, or null if they haven't installed it there. With their
   * GitHub id, also null when the account behind that login today is someone else's (they renamed, a stranger took it).
   */
  async userInstallation(login: string, githubId?: number, timeoutMs?: number): Promise<number | null> {
    const res = await this.fetch(`${API}/users/${encodeURIComponent(login)}/installation`, {
      headers: this.headers(`Bearer ${appJwt(this.cfg)}`),
      ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`couldn't look up ${login}'s installation (${res.status})`);
    const found = (await res.json()) as { id: number; account?: { id?: number } };
    if (githubId !== undefined && found.account?.id !== undefined && found.account.id !== githubId) return null;
    return found.id;
  }

  /**
   * Uninstalls the App from an account: GitHub drops its access to every repo there and stops sending its events.
   * Already gone (404) counts as done. Throws when GitHub refuses or doesn't answer in time.
   */
  async deleteInstallation(installationId: number, timeoutMs = 8000): Promise<void> {
    const res = await this.fetch(`${API}/app/installations/${installationId}`, {
      method: "DELETE",
      headers: this.headers(`Bearer ${appJwt(this.cfg)}`),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok && res.status !== 404) throw new Error(`GitHub refused to remove installation ${installationId} (${res.status})`);
    this.tokens.delete(installationId);
    for (const [repo, known] of this.repoInstallations) if (known.id === installationId) this.repoInstallations.delete(repo);
  }

  /** The repos an installation covers (the first hundred: plenty for a newcomer). */
  async installationRepos(installationId: number): Promise<GhRepoInfo[]> {
    const token = await this.installationToken(installationId);
    const res = await this.fetch(`${API}/installation/repositories?per_page=100`, { headers: this.headers(`token ${token}`) });
    if (!res.ok) throw new Error(`couldn't list the installation's repos (${res.status})`);
    return ((await res.json()) as { repositories: GhRepoInfo[] }).repositories;
  }

  /**
   * A pull request as GitHub's API returns it (`status`, and the JSON when it's found), read with the App's token,
   * which has a far bigger allowance than asking with none. Null when the App isn't installed on that repo: the
   * caller asks the public API instead. Throws when GitHub doesn't answer in time.
   */
  async pullRequest(repo: string, n: number, timeoutMs = 8000): Promise<{ status: number; body: unknown } | null> {
    const installationId = await this.repoInstallation(repo, timeoutMs);
    if (installationId === null) return null;
    const token = await this.installationToken(installationId);
    const res = await this.fetch(`${API}/repos/${repo}/pulls/${n}`, { headers: this.headers(`token ${token}`), signal: AbortSignal.timeout(timeoutMs) });
    return { status: res.status, body: res.ok ? await res.json() : null };
  }

  // The App's installation on a repo, or null if it isn't installed there. Remembered for ten minutes either way.
  private repoInstallations = new Map<string, { id: number | null; until: number }>();
  private async repoInstallation(repo: string, timeoutMs: number): Promise<number | null> {
    const cached = this.repoInstallations.get(repo);
    if (cached && cached.until > Date.now()) return cached.id;
    const res = await this.fetch(`${API}/repos/${repo}/installation`, { headers: this.headers(`Bearer ${appJwt(this.cfg)}`), signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok && res.status !== 404) throw new Error(`couldn't look up the App on ${repo} (${res.status})`);
    const id = res.ok ? ((await res.json()) as { id: number }).id : null;
    this.repoInstallations.set(repo, { id, until: Date.now() + 10 * 60_000 });
    return id;
  }

  /** Puts a label on an issue or pull request and takes the others in `remove` off (those already gone don't matter). */
  async relabel(installationId: number, repo: string, issue: number, add: string, remove: string[]): Promise<void> {
    await this.call(installationId, "POST", `/repos/${repo}/issues/${issue}/labels`, { labels: [add] });
    for (const name of remove) {
      await this.call(installationId, "DELETE", `/repos/${repo}/issues/${issue}/labels/${encodeURIComponent(name)}`, undefined).catch(() => undefined);
    }
  }

  async comment(installationId: number, repo: string, issue: number, text: string): Promise<void> {
    await this.call(installationId, "POST", `/repos/${repo}/issues/${issue}/comments`, { body: text });
  }

  /** Asks GitHub to request a review. GitHub refuses people without access to the repo; the comment still names them. */
  async requestReview(installationId: number, repo: string, pr: number, login: string): Promise<boolean> {
    try {
      await this.call(installationId, "POST", `/repos/${repo}/pulls/${pr}/requested_reviewers`, { reviewers: [login] });
      return true;
    } catch {
      return false;
    }
  }

  private async call(installationId: number, method: string, path: string, body: unknown) {
    const token = await this.installationToken(installationId);
    const res = await this.fetch(`${API}${path}`, { method, headers: this.headers(`token ${token}`), body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`GitHub ${method} ${path} failed (${res.status})`);
  }

  private headers(authorization: string) {
    return {
      Accept: "application/vnd.github+json",
      Authorization: authorization,
      "Content-Type": "application/json",
      "User-Agent": "coloc.dev",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }
}
