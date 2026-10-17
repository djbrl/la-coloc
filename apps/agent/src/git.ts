// Fetching a flatmate's code. Arguments go to git as an array (never through a shell),
// and anything that could be read as a git option is refused.
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";

const SAFE_REF = /^[A-Za-z0-9._\/-]+$/;

// file:// reads straight from the house server's disk, so a flatmate could build an image out of any
// folder on it. Only local development turns it on, and then only for the repos it names (the tutorial's
// starter page): `true` lets any local repo in, a list lets in only those.
export type LocalRepos = boolean | readonly string[];

export function assertSafeRepo(repo: string, allowLocal: LocalRepos = false): void {
  if (repo.startsWith("file://")) {
    const same = (a: string) => a.replace(/\/+$/, "") === repo.replace(/\/+$/, "");
    const allowed = allowLocal === true || (Array.isArray(allowLocal) && allowLocal.some(same));
    if (!allowed) throw new Error("this local file:// repo isn't allowed here (COLOC_ALLOW_LOCAL_REPOS)");
    return;
  }
  if (!repo.startsWith("https://")) throw new Error("repo must be an https:// URL");
}

export function assertSafeRef(ref: string): void {
  if (ref.startsWith("-") || !SAFE_REF.test(ref) || ref.includes("..")) throw new Error(`unsafe ref: ${ref}`);
}

// Resolves a sub-folder inside the checkout, refusing anything that climbs out of it.
export function resolveInside(root: string, sub: string): string {
  const resolved = path.resolve(root, sub);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) throw new Error(`path escapes the repo: ${sub}`);
  return resolved;
}

function run(cmd: string, args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(err.trim() || `${cmd} exited ${code}`))));
  });
}

export interface Checkout {
  dir: string;
  sha: string;
  cleanup: () => Promise<void>;
}

export async function shallowClone(workDir: string, repo: string, ref: string, allowLocal: LocalRepos = false): Promise<Checkout> {
  assertSafeRepo(repo, allowLocal);
  assertSafeRef(ref);
  const dir = await mkdtemp(path.join(workDir, "checkout-"));
  try {
    await run("git", ["clone", "--quiet", "--depth", "1", "--branch", ref, "--", repo, dir]);
    const sha = await run("git", ["rev-parse", "HEAD"], dir);
    return { dir, sha, cleanup: () => rm(dir, { recursive: true, force: true }) };
  } catch (e) {
    await rm(dir, { recursive: true, force: true });
    // Never echo the URL back: it may carry a GitHub token.
    throw new Error(`git clone failed: ${(e as Error).message.replace(/https:\/\/[^@\s]+@/g, "https://***@")}`);
  }
}
