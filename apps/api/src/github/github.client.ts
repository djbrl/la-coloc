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
