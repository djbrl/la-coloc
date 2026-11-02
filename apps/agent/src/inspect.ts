// Reading a project before it's built, so the room can say what it found and what's missing instead of failing later:
// how we'd run it, which port, which settings it expects. Only reads, and only plain small files: a repo is a stranger's,
// and a file in it may be a link to something on this machine.
import type { Findings } from "@coloc/protocol";
import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { recipeFor } from "./recipe";

const MAX_FILE_BYTES = 64 * 1024;
const ENV_FILES = [".env.example", ".env.sample", ".env.template", ".env.dist", "example.env"];
const README = /^readme(\.md|\.txt)?$/i;
const SKIP_FOLDERS = new Set(["node_modules", "vendor", "dist", "build", "out", "public", "static", "assets", "test", "tests", "docs", "examples"]);
// A setting whose name says the project wants something a sealed room can't reach.
const WANTS_DATABASE = /(DATABASE|POSTGRES|MYSQL|MONGO|REDIS|SUPABASE|DB_(URL|HOST|URI))/;
const WANTS_INTERNET = /(API_KEY|_TOKEN$|_SECRET$|OPENAI|ANTHROPIC|STRIPE|SMTP|WEBHOOK)/;
const DATABASE_PACKAGES = /"(pg|mysql2?|mongoose|mongodb|redis|ioredis|prisma|@prisma\/client|@supabase\/supabase-js)"\s*:/;

async function plainFile(dir: string, name: string): Promise<string | null> {
  const info = await lstat(path.join(dir, name)).catch(() => null);
  if (!info?.isFile() || info.size > MAX_FILE_BYTES) return null;
  return readFile(path.join(dir, name), "utf8").catch(() => null);
}

export interface ProjectFiles {
  names: string[];
  packageJson?: string | null;
  requirements?: string | null;
  nuxtConfig?: string | null;
  dockerfile?: string | null;
  envExample?: string | null;
  compose?: string | null;
  readme?: string | null;
}

/** The settings an env example names, in its order, without PORT (it's the room's to set) or anything malformed. */
export function envNames(text: string | null | undefined): string[] {
  const names = (text ?? "").split("\n").flatMap((l) => /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]{0,63})\s*=/.exec(l)?.[1].toUpperCase() ?? []);
  return [...new Set(names)].filter((n) => n !== "PORT").slice(0, 30);
}

/** The port a project says it listens on, and where it says so, surest first. Null: it says nothing. */
export function findPort(f: ProjectFiles): { port: number; from: NonNullable<Findings["portFrom"]> } | null {
  const scripts = /"(?:start|serve|preview)"\s*:\s*"[^"]*?(?:--port[= ]|\s-p\s|PORT=)(\d{2,5})/.exec(f.packageJson ?? "")?.[1];
  const looks: [string | undefined, NonNullable<Findings["portFrom"]>][] = [
    [/^\s*EXPOSE\s+(\d{2,5})/im.exec(f.dockerfile ?? "")?.[1], "dockerfile"],
    [/^\s*PORT\s*=\s*["']?(\d{2,5})/im.exec(f.envExample ?? "")?.[1], "env"],
    [scripts, "package"],
    [/["']?\d{2,5}:(\d{2,5})(?:\/tcp)?["']?\s*$/m.exec(f.compose ?? "")?.[1], "compose"],
    [/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{2,5})/.exec(f.readme ?? "")?.[1], "readme"],
  ];
  for (const [text, from] of looks) {
    const port = Number(text);
    if (port >= 1 && port <= 65535) return { port, from };
  }
  return null;
}

/** What the files say. No disk here, so it's easy to test. */
export function read(f: ProjectFiles): Omit<Findings, "branch" | "sha" | "folders"> {
  const recipe = recipeFor(f);
  const stack = f.dockerfile != null ? "dockerfile" : (recipe?.stack ?? null);
  const env = envNames(f.envExample);
  const flags: Findings["flags"] = [];
  if (!stack) flags.push("noRunner");
  if (stack === "static" && f.nuxtConfig && recipe?.dockerfile.includes("nuxt generate")) flags.push("forCloud");
  if (env.some((n) => WANTS_DATABASE.test(n)) || DATABASE_PACKAGES.test(f.packageJson ?? "")) flags.push("wantsDatabase");
  if (env.some((n) => WANTS_INTERNET.test(n))) flags.push("wantsInternet");
  // Plain pages are served by us, on whatever port the room says: nothing to ask.
  const port = stack === "static" || stack === "php" ? null : findPort(f);
  return { stack, port: port?.port ?? null, portFrom: port?.from ?? null, env, flags };
}

async function filesIn(dir: string): Promise<ProjectFiles> {
  const names = await readdir(dir);
  const file = (n: string | undefined) => (n ? plainFile(dir, n) : Promise.resolve(null));
  const named = (re: RegExp) => names.find((n) => re.test(n));
  const [packageJson, requirements, nuxtConfig, dockerfile, envExample, compose, readme] = await Promise.all([
    file("package.json").then((t) => (names.includes("package.json") ? t : null)),
    file("requirements.txt"),
    file(named(/^nuxt\.config\.[cm]?[jt]s$/)),
    file("Dockerfile"),
    file(ENV_FILES.find((n) => names.includes(n))),
    file(named(/^(docker-)?compose\.ya?ml$/)),
    file(named(README)),
  ]);
  return { names, packageJson, requirements, nuxtConfig, dockerfile, envExample, compose, readme };
}

// Nothing runnable here: where in the repo there is, for a monorepo. Two levels down at most.
async function runnableFolders(root: string, depth = 2, under = ""): Promise<string[]> {
  if (depth === 0) return [];
  const found: string[] = [];
  const entries = await readdir(path.join(root, under), { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith(".") || SKIP_FOLDERS.has(e.name)) continue;
    const rel = path.join(under, e.name);
    const f = await filesIn(path.join(root, rel));
    if (f.dockerfile != null || recipeFor(f)) found.push(rel);
    else found.push(...(await runnableFolders(root, depth - 1, rel)));
    if (found.length >= 6) break;
  }
  return found.slice(0, 6);
}

export async function inspectProject(root: string, folder: string): Promise<Omit<Findings, "branch" | "sha">> {
  const here = await lstat(folder).catch(() => null);
  if (!here?.isDirectory()) return { stack: null, port: null, portFrom: null, env: [], flags: ["noFolder"], folders: await runnableFolders(root) };
  const found = read(await filesIn(folder));
  return { ...found, folders: found.stack ? [] : await runnableFolders(root) };
}
