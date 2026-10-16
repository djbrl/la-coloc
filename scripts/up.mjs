#!/usr/bin/env node
// Everything the city needs, from one command: `npm run dev -w @coloc/api` (what Multiprise starts for apps/api), or
// `npm run up` from the root. Development only. Ctrl+C (or Stop in Multiprise) stops everything it started.
//
//   1. builds what changed (the packages, the API, the caretaker), so `dist/` is never stale;
//   2. starts the API at once, on $PORT (Multiprise's) or 4100. It copes with the database not being up yet: the
//      city shows "can't be reached" for a few seconds and heals by itself;
//   3. starts Docker Desktop if it isn't running, then Postgres and Traefik (dev/docker-compose.yml);
//   4. starts both caretakers (Sacré-Cœur and L'Atelier), restarting one that crashes;
//   5. starts the GitHub webhook relay, if dev/.env.github has a smee channel;
//   6. shares the city (scripts/share.mjs: a Cloudflare tunnel and the site on Vercel), unless COLOC_SHARE=0 or
//      cloudflared / the Vercel CLI aren't installed. While sharing, GitHub login sends people back to the Vercel site.
//
// The website itself is apps/web's own `npm run dev` (Multiprise starts it next to this one), or `npm run dev:web`.
// Docker keeps running after a stop: the database and the rooms stay up.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT ?? 4100);
const SITE = process.env.COLOC_SHARE_SITE ?? "https://la-coloc.vercel.app";
const env = (file) => (existsSync(join(root, file)) ? readFileSync(join(root, file), "utf8") : "");
const has = (cmd) => spawnSync("sh", ["-c", `command -v ${cmd}`]).status === 0;
const share = process.env.COLOC_SHARE !== "0" && has("cloudflared") && has("vercel");
const children = new Set();
let stopping = false;

const COLOURS = { up: 90, api: 36, "sacre-coeur": 33, atelier: 35, webhooks: 32, share: 34, docker: 90 };
function say(tag, line) {
  for (const l of String(line).split("\n")) if (l.trim()) console.log(`\x1b[${COLOURS[tag] ?? 37}m[${tag}]\x1b[0m ${l}`);
}

/** Runs a long-lived child with its output tagged; `again` restarts it (after a pause) if it dies on its own. */
function run(tag, cmd, args, opts = {}, again = false) {
  if (stopping) return;
  const child = spawn(cmd, args, { cwd: join(root, opts.cwd ?? "."), env: { ...process.env, ...opts.env }, stdio: ["ignore", "pipe", "pipe"], detached: true });
  children.add(child);
  child.stdout.on("data", (d) => say(tag, d));
  child.stderr.on("data", (d) => say(tag, d));
  child.on("exit", (code) => {
    children.delete(child);
    if (stopping) return;
    say(tag, `stopped (${code ?? "signal"})${again ? ", starting it again in 5 s" : ""}`);
    if (again) setTimeout(() => run(tag, cmd, args, opts, again), 5000);
  });
  return child;
}

function stop() {
  if (stopping) return;
  stopping = true;
  say("up", "stopping everything (Docker stays up)…");
  for (const c of children) {
    try {
      process.kill(-c.pid, "SIGTERM"); // the whole group: npm and what it started
    } catch {}
  }
  setTimeout(() => process.exit(0), 1500);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

// ---- 1. Build what changed ----

function newest(dir) {
  let t = 0;
  if (!existsSync(dir)) return t;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    t = Math.max(t, e.isDirectory() ? newest(p) : statSync(p).mtimeMs);
  }
  return t;
}
const stale = (pkg) => newest(join(root, pkg, "src")) > newest(join(root, pkg, "dist"));
const toBuild = ["packages/protocol", "packages/domain", "packages/db", "apps/agent", "apps/api"].filter(stale);
if (toBuild.length) {
  say("up", `building ${toBuild.join(", ")}…`);
  const order = ["packages/protocol", "packages/domain", "packages/db", "apps/agent", "apps/api"];
  // A package that changed rebuilds everything after it, since the apps compile against it.
  const from = order.indexOf(toBuild[0]);
  for (const pkg of order.slice(from)) {
    const r = spawnSync("npx", ["tsc", "-p", "tsconfig.json"], { cwd: join(root, pkg), stdio: "inherit" });
    if (r.status !== 0) {
      say("up", `${pkg} doesn't build: fix it and start again.`);
      process.exit(1);
    }
  }
}

// ---- 2. The API, at once (from apps/api: node's --env-file paths are relative to it) ----

run(
  "api",
  "node",
  ["--env-file-if-exists=../../dev/.env.local", "--env-file-if-exists=../../dev/.env.github", "dist/main.js"],
  {
    env: {
      PORT: String(PORT),
      // Any page on this machine (Multiprise picks the web's port) may open the lobby's socket.
      COLOC_DEV_ORIGINS: "1",
      COLOC_PUBLIC_URL: process.env.COLOC_PUBLIC_URL ?? (share ? SITE : "http://localhost:5175"),
      COLOC_WEB_ORIGIN: process.env.COLOC_WEB_ORIGIN ?? (share ? `${SITE},http://localhost:5175` : "http://localhost:5175"),
    },
    cwd: "apps/api",
  },
  true,
);

// ---- 3. Docker, Postgres and Traefik ----

async function docker() {
  const up = () => spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;
  if (!up()) {
    say("docker", "starting Docker Desktop…");
    spawnSync("open", ["-a", "Docker"]);
    for (let i = 0; i < 90 && !up(); i++) await new Promise((r) => setTimeout(r, 2000));
    if (!up()) {
      say("docker", "Docker didn't start: open Docker Desktop, then restart this.");
      return false;
    }
  }
  mkdirSync("/tmp/coloc-agent/proxy", { recursive: true });
  const r = spawnSync("docker", ["compose", "-f", "dev/docker-compose.yml", "up", "-d"], { cwd: root, encoding: "utf8" });
  say("docker", r.status === 0 ? "Postgres and Traefik are up" : r.stderr);
  return r.status === 0;
}

// ---- 4–6. Caretakers, webhooks, sharing ----

const caretaker = (house, extra = {}) =>
  run(
    house,
    "node",
    ["dist/index.js"],
    {
      env: {
        COLOC_HOUSE_ID: house,
        COLOC_AGENT_SECRET: "dev-secret-change-me",
        COLOC_ALLOW_LOCAL_REPOS: "1",
        COLOC_API_URL: `ws://localhost:${PORT}/agent`,
        ...extra,
      },
      cwd: "apps/agent",
    },
    true,
  );

const dockerUp = await docker();
if (dockerUp) {
  caretaker("sacre-coeur", { COLOC_USAGE_INTERVAL_MS: "5000" });
  caretaker("atelier", { COLOC_USAGE_INTERVAL_MS: "30000" });
} else {
  say("up", "no Docker: the caretakers wait. Rooms won't build until Docker runs and this restarts.");
}

if (/^COLOC_GITHUB_WEBHOOK_PROXY=\S+/m.test(env("dev/.env.github"))) {
  run("webhooks", "node", ["--env-file=dev/.env.github", "scripts/webhooks.mjs"], { env: { COLOC_WEBHOOK_TARGET: `http://127.0.0.1:${PORT}/api/github/webhook` } }, true);
} else {
  say("up", "no smee channel in dev/.env.github: GitHub events (merges, reviews) won't arrive. See docs/dev.md.");
}

if (share) {
  run("share", "node", ["scripts/share.mjs"], { env: { COLOC_API_PORT: String(PORT) } });
} else {
  say("up", "not sharing (COLOC_SHARE=0, or cloudflared / the Vercel CLI missing): the city is on this machine only.");
}

say("up", `API on http://127.0.0.1:${PORT}. Stop with Ctrl+C.`);
