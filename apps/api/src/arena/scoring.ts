// Turning a pull request into Arena points. A submission is a pull request to the arena repo, by the person who
// sends it, opened after the week started. Merged, it scores (by label for a bounty); open, it's waiting (0);
// closed without a merge, 0. GitHub is asked through the App when it's installed on the arena repo, else through
// its public API with no token (60 questions an hour per server: fine for a contest, and webhooks do the rest).
import type { ArenaKind, ArenaPrState } from "@coloc/db";
import { z } from "zod";
import type { GithubAppClient } from "../github/github.client";
import { catalogueEntry } from "./catalogue";

// The public repo contestants fork (built from this one by scripts/arena-repo.mjs): the product repo is private.
const DEFAULT_REPO = "https://github.com/Djbrl/la-coloc-arena";
// How long GitHub gets to answer before we say it's down.
export const GITHUB_TIMEOUT_MS = 8000;

export interface ArenaRepo {
  // As people open it: https://github.com/Djbrl/la-coloc-arena
  url: string;
  // "djbrl/la-coloc": lower case, as submissions store it and webhooks are matched.
  fullName: string;
}

/** The arena repo, from COLOC_ARENA_REPO (a GitHub URL, or "owner/name"). */
export function arenaRepo(env = process.env): ArenaRepo {
  const raw = (env.COLOC_ARENA_REPO || DEFAULT_REPO).trim();
  const m = /^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i.exec(raw);
  if (!m) throw new Error(`COLOC_ARENA_REPO isn't a GitHub repo: ${raw}`);
  return { url: `https://github.com/${m[1]}/${m[2]}`, fullName: `${m[1]}/${m[2]}`.toLowerCase() };
}

/** The repo ("owner/name", lower case) and number of a pull request's address, or null if it isn't one. */
export function parsePrUrl(url: string): { repo: string; number: number } | null {
  const m = /^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d{1,9})(?:[/?#].*)?$/i.exec(url.trim());
  if (!m) return null;
  return { repo: `${m[1]}/${m[2]}`.toLowerCase(), number: Number(m[3]) };
}

/** What we need to know about a pull request, from GitHub's API or one of its webhooks (the same shape). */
export interface PullFacts {
  number: number;
  title: string;
  url: string;
  state: ArenaPrState;
  labels: string[];
  authorLogin: string;
  authorId: number | null;
  createdAt: Date;
  mergedAt: Date | null;
}

const GhPull = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  html_url: z.string(),
  state: z.string(),
  merged: z.boolean().nullish(),
  merged_at: z.string().nullish(),
  created_at: z.string(),
  user: z.object({ login: z.string(), id: z.number().nullish() }),
  labels: z.array(z.object({ name: z.string() })).nullish(),
});

/** GitHub's JSON for a pull request, checked; null if it isn't one. */
export function readPull(raw: unknown): PullFacts | null {
  const r = GhPull.safeParse(raw);
  if (!r.success) return null;
  const p = r.data;
  const merged = !!p.merged || !!p.merged_at;
  return {
    number: p.number,
    title: p.title.slice(0, 300),
    url: p.html_url,
    state: merged ? "merged" : p.state === "closed" ? "closed" : "open",
    labels: (p.labels ?? []).map((l) => l.name),
    authorLogin: p.user.login,
    authorId: p.user.id ?? null,
    createdAt: new Date(p.created_at),
    mergedAt: p.merged_at ? new Date(p.merged_at) : null,
  };
}

/**
 * What a pull request is worth in a challenge: nothing until it's merged, and then only with one of the challenge's
 * labels, which the judges put on (its best one counts). A merged pull request with no arena label is an ordinary
 * contribution to the repo, not an entry.
 */
export function scoreOf(slug: string, kind: ArenaKind, pull: Pick<PullFacts, "state" | "labels">): { points: number; label: string | null } {
  if (pull.state !== "merged") return { points: 0, label: null };
  const table = catalogueEntry(slug, kind).points;
  const labelled = table.filter((row) => pull.labels.includes(row.label)).sort((a, b) => b.points - a.points)[0];
  return labelled ? { points: labelled.points, label: labelled.label } : { points: 0, label: null };
}

/**
 * The judges: they merge and label the arena's pull requests, so they don't play. COLOC_ARENA_JUDGES (GitHub
 * logins, comma list), else the admins (COLOC_ADMINS). Lower case.
 */
export function arenaJudges(env = process.env): Set<string> {
  const raw = env.COLOC_ARENA_JUDGES ?? env.COLOC_ADMINS ?? "";
  return new Set(raw.split(",").map((l) => l.trim().toLowerCase()).filter(Boolean));
}

/** Did this person open it? By GitHub's numeric id when both are known (logins change), else by login, ignoring case. */
export function isAuthor(user: { login: string; githubId: number | null }, pull: Pick<PullFacts, "authorLogin" | "authorId">): boolean {
  if (user.githubId !== null && pull.authorId !== null) return user.githubId === pull.authorId;
  return user.login.toLowerCase() === pull.authorLogin.toLowerCase();
}

/** GitHub didn't answer, or answered with an error of its own. */
export class GithubDown extends Error {}

/**
 * Asks GitHub about a pull request: its facts, or null if there's no such pull request. Throws GithubDown when
 * GitHub can't be reached, is too slow, or answers with anything but the pull request or a 404 (5xx, rate limit).
 */
export async function fetchPull(repo: string, n: number, via: { client: GithubAppClient | null; fetch: typeof globalThis.fetch }): Promise<PullFacts | null> {
  let answer: { status: number; body: unknown } | null = null;
  if (via.client) answer = await via.client.pullRequest(repo, n, GITHUB_TIMEOUT_MS).catch(() => null);
  if (!answer) {
    try {
      const res = await via.fetch(`https://api.github.com/repos/${repo}/pulls/${n}`, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "coloc.dev", "X-GitHub-Api-Version": "2022-11-28" },
        signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
      });
      answer = { status: res.status, body: res.ok ? await res.json() : null };
    } catch (e) {
      throw new GithubDown((e as Error).message);
    }
  }
  if (answer.status === 404) return null;
  if (answer.status < 200 || answer.status >= 300) throw new GithubDown(`GitHub answered ${answer.status}`);
  const facts = readPull(answer.body);
  if (!facts) throw new GithubDown("GitHub's answer wasn't a pull request");
  return facts;
}

/**
 * Whether anyone can open a challenge's folder on GitHub: the repo is public and the folder is pushed. Asked without
 * credentials on purpose (the App sees private repos; contestants don't). True, false, or null when GitHub can't
 * say right now.
 */
export async function folderIsOpen(repo: string, path: string, fetch: typeof globalThis.fetch): Promise<boolean | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`, {
      method: "GET",
      headers: { Accept: "application/vnd.github+json", "User-Agent": "coloc.dev", "X-GitHub-Api-Version": "2022-11-28" },
      signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
    });
    if (res.ok) return true;
    // 404 is both "private repo" and "folder not pushed": either way, nobody but its owner can take part.
    if (res.status === 404) return false;
    return null;
  } catch {
    return null;
  }
}
