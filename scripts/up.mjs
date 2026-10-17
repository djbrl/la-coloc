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
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { databaseRunning, ensureDevKeys, secureDatabase } from "./dev-keys.mjs";

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

/**
 * Runs a long-lived child with its output tagged; `again` restarts it if it dies on its own: after 5 s, then twice as
 * long each time it dies within a minute of starting (up to 5 min), so a piece that can't start doesn't spin.
 */
function run(tag, cmd, args, opts = {}, again = false, pause = 5000) {
  if (stopping) return;
  const started = Date.now();
  const child = spawn(cmd, args, { cwd: join(root, opts.cwd ?? "."), env: { ...process.env, ...opts.env }, stdio: ["ignore", "pipe", "pipe"], detached: true });
  children.add(child);
  child.stdout.on("data", (d) => say(tag, d));
  child.stderr.on("data", (d) => say(tag, d));
  child.on("exit", (code) => {
    children.delete(child);
    if (stopping) return;
    const wait = Date.now() - started < 60_000 ? pause : 5000;
    say(tag, `stopped (${code ?? "signal"})${again ? `, starting it again in ${Math.round(wait / 1000)} s` : ""}`);
    if (again) setTimeout(() => run(tag, cmd, args, opts, again, Math.min(wait * 2, 300_000)), wait);
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
// Closing the terminal window: the children are in their own process groups (detached), so they'd outlive it.
process.on("SIGHUP", stop);

// One launcher at a time: two would run four caretakers for two houses on one database, and fight over the port.
const LOCK = join(root, "dev/.up.lock");
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const holder = Number(existsSync(LOCK) ? readFileSync(LOCK, "utf8").trim() : 0);
if (holder && holder !== process.pid && alive(holder)) {
  say("up", `La Coloc already runs from another launcher (process ${holder}). Stop that one first (Ctrl+C there, or Stop in Multiprise).`);
  process.exit(1);
}
writeFileSync(LOCK, String(process.pid));
process.on("exit", () => {
  try {
    if (readFileSync(LOCK, "utf8").trim() === String(process.pid)) rmSync(LOCK);
  } catch {}
});

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
      // tsc writes dist/ even when it fails: drop it, or the next start would think it up to date and run it.
      rmSync(join(root, pkg, "dist"), { recursive: true, force: true });
      say("up", `${pkg} doesn't build: fix it and start again.`);
      process.exit(1);
    }
  }
}

// ---- 2. The API, at once (from apps/api: node's --env-file paths are relative to it) ----

// A port already taken (an API left over from a closed terminal, another app) would make the API die and restart
// every few seconds for ever: say who has it, and stop.
const free = await new Promise((resolve) => {
  const probe = createServer().once("error", () => resolve(false)).once("listening", () => probe.close(() => resolve(true)));
  probe.listen(PORT, "127.0.0.1");
});
if (!free) {
  const who = spawnSync("lsof", ["-nP", `-iTCP:${PORT}`, "-sTCP:LISTEN"], { encoding: "utf8" }).stdout?.split("\n")[1]?.split(/\s+/).slice(0, 2).join(" process ");
  say("up", `port ${PORT} is taken${who ? ` (by ${who})` : ""}: stop it, or start with PORT=<another>.`);
  process.exit(1);
}

// This laptop's own database password and caretaker key (scripts/dev-keys.mjs), made on the first run. If the database
// already runs, it gets them now, before the API dials it; otherwise once Docker is up (the API waits calmly meanwhile).
const keys = ensureDevKeys(root);
if (keys.made.length) say("up", `made ${keys.made.join(", ")} in dev/.env.local (this laptop's own keys)`);
let secured = false;
function secure() {
  if (secured || !databaseRunning()) return;
  const why = secureDatabase(keys);
  if (why) say("docker", `couldn't set the database's password: ${why}`);
  else secured = true;
}
secure();

// While the city is shared, the internet reaches this API: everything that is only for one developer at their own
// laptop goes off, whatever dev/.env.local says. Child env beats --env-file in Node, so these win.
const sharing = share
  ? { COLOC_DEV_LOGIN: "0", COLOC_DEV_ORIGINS: "0" }
  : // Any page on this machine (Multiprise picks the web's port) may open the lobby's socket.
    { COLOC_DEV_ORIGINS: "1" };

run(
  "api",
  "node",
  ["--env-file-if-exists=../../dev/.env.local", "--env-file-if-exists=../../dev/.env.github", "dist/main.js"],
  {
    env: {
      PORT: String(PORT),
      ...sharing,
      COLOC_PUBLIC_URL: process.env.COLOC_PUBLIC_URL ?? (share ? SITE : "http://localhost:5175"),
      // While sharing, the dev origins are off: name this machine's own site, on Multiprise's port too.
      COLOC_WEB_ORIGIN:
        process.env.COLOC_WEB_ORIGIN ??
        (share ? [SITE, "http://localhost:5175", ...(process.env.FRONTEND_PORT ? [`http://localhost:${process.env.FRONTEND_PORT}`] : [])].join(",") : "http://localhost:5175"),
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
        COLOC_AGENT_SECRET: keys.agentSecret,
        COLOC_API_URL: `ws://localhost:${PORT}/agent`,
        ...extra,
      },
      cwd: "apps/agent",
    },
    true,
  );

const dockerUp = await docker();
if (dockerUp) {
  // A database that just started may need a few seconds before psql gets in.
  for (let i = 0; i < 30 && !secured; i++) {
    secure();
    if (!secured) await new Promise((r) => setTimeout(r, 1000));
  }
  caretaker("sacre-coeur", { COLOC_USAGE_INTERVAL_MS: "5000" });
  // The workshop builds the quest's starter page from this clone (COLOC_TUTORIAL_REPO=file://…): that one local repo,
  // and no other folder on the laptop.
  const starter = /^COLOC_TUTORIAL_REPO=(file:\/\/\S+)/m.exec(env("dev/.env.local"))?.[1];
  // Its rooms at <room>.atelier.coloc.localhost, as the seed says (the house's domain), so two houses' rooms with the
  // same name never share an address.
  caretaker("atelier", { COLOC_USAGE_INTERVAL_MS: "30000", COLOC_HOUSE_DOMAIN: "atelier.coloc.localhost", ...(starter ? { COLOC_ALLOW_LOCAL_REPOS: starter } : {}) });
} else {
  say("up", "no Docker: the caretakers wait. Rooms won't build until Docker runs and this restarts.");
}

if (/^COLOC_GITHUB_WEBHOOK_PROXY=\S+/m.test(env("dev/.env.github"))) {
  run("webhooks", "node", ["--env-file=dev/.env.github", "scripts/webhooks.mjs"], { env: { COLOC_WEBHOOK_TARGET: `http://127.0.0.1:${PORT}/api/github/webhook` } }, true);
} else {
  say("up", "no smee channel in dev/.env.github: GitHub events (merges, reviews) won't arrive. See docs/dev.md.");
}

if (share) {
  // share.mjs stops when its tunnel dies or stops answering: it starts again (a new tunnel, so a new deploy).
  run("share", "node", ["scripts/share.mjs"], { env: { COLOC_API_PORT: String(PORT) } }, true, 30_000);
} else {
  say("up", "not sharing (COLOC_SHARE=0, or cloudflared / the Vercel CLI missing): the city is on this machine only.");
}

say("up", `API on http://127.0.0.1:${PORT}. Stop with Ctrl+C.`);
