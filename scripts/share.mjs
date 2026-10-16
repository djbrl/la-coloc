#!/usr/bin/env node
// Puts the site on Vercel while the API (and Docker, the caretakers, everything else) keeps running on this laptop.
// Development only: until the real server exists, this is how a teammate tries the city without a local build.
//
//   npm run share                          opens a Cloudflare tunnel to the API, builds, deploys, keeps the tunnel open
//   npm run share -- --tunnel https://…    uses a tunnel you already opened
//
// Vercel serves the built site and forwards /api to the tunnel (vercel.json rewrites). It can't forward WebSockets,
// so the site opens the lobby's socket straight to the tunnel (VITE_LOBBY_WS) with a one-minute pass from
// /api/lobby/ticket. A quick tunnel gets a new address each time it opens, so run this again after a restart.
//
// Needs: cloudflared (brew install cloudflared), the Vercel CLI logged in (npx vercel login), and the API started
// with COLOC_PUBLIC_URL set to the site's address and COLOC_WEB_ORIGIN listing it too (this prints both).
import { spawn, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// Outside the repo on purpose: deployed from inside it, the Vercel CLI attaches our git details and Vercel's Hobby
// plan blocks the deploy. Holds the built site and Vercel's link to the project.
const out = join(tmpdir(), "la-coloc-share");
const PROJECT = process.env.COLOC_VERCEL_PROJECT ?? "la-coloc";

const arg = process.argv.indexOf("--tunnel");
let tunnel = arg > -1 ? process.argv[arg + 1]?.replace(/\/$/, "") : null;
let cloudflared = null;

if (!tunnel) {
  console.log("Opening a tunnel to the API on :4100…");
  cloudflared = spawn("cloudflared", ["tunnel", "--no-autoupdate", "--url", "http://127.0.0.1:4100"], { stdio: ["ignore", "pipe", "pipe"] });
  tunnel = await new Promise((resolve, reject) => {
    const seen = (chunk) => {
      const m = chunk.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m) resolve(m[0]);
    };
    cloudflared.stdout.on("data", seen);
    cloudflared.stderr.on("data", seen);
    cloudflared.on("exit", () => reject(new Error("cloudflared stopped before giving an address")));
    setTimeout(() => reject(new Error("no tunnel address after 30 s")), 30_000);
  });
}
console.log(`Tunnel: ${tunnel}`);

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: root, ...opts });
  if (r.status !== 0) {
    cloudflared?.kill();
    process.exit(r.status ?? 1);
  }
};

console.log("Building the site…");
run("npm", ["run", "build", "-w", "@coloc/web"], { env: { ...process.env, VITE_LOBBY_WS: `${tunnel.replace(/^http/, "ws")}/lobby-ws` } });

rmSync(join(out, "site"), { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(root, "apps/web/dist"), join(out, "site"), { recursive: true });
writeFileSync(
  join(out, "site/vercel.json"),
  JSON.stringify(
    {
      rewrites: [
        { source: "/api/:path*", destination: `${tunnel}/api/:path*` },
        // The site is one page: every other address is the app's own route.
        { source: "/((?!assets/|lobby/|loading/|.*\\..*).*)", destination: "/index.html" },
      ],
    },
    null,
    2,
  ),
);

console.log("Deploying to Vercel…");
run("vercel", ["link", "--yes", "--project", PROJECT], { cwd: join(out, "site") });
// Linking writes Vercel's own token to .env.local: never ship it with the site.
rmSync(join(out, "site/.env.local"), { force: true });
writeFileSync(join(out, "site/.vercelignore"), ".env*\n");
const deploy = spawnSync("vercel", ["deploy", "--prod", "--yes"], { cwd: join(out, "site"), encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
if (deploy.status !== 0) {
  cloudflared?.kill();
  process.exit(deploy.status ?? 1);
}
// The project's own address (stable across deploys), from "Production URL: https://….vercel.app".
const domain = deploy.stdout.match(/Production URL: (https:\/\/[a-z0-9.-]+)/)?.[1] ?? deploy.stdout.match(/https:\/\/[a-z0-9.-]+\.vercel\.app/)?.[0];

console.log(`
The site: ${domain}

Start (or restart) the API with:
  COLOC_PUBLIC_URL=${domain} COLOC_WEB_ORIGIN=${domain},http://localhost:5175 npm run start -w @coloc/api

and add ${domain}/api/auth/github/callback to the GitHub App's callback URLs.`);

if (cloudflared) {
  console.log("\nKeeping the tunnel open. Ctrl+C closes it (the site then can't reach the API).");
  process.on("SIGINT", () => {
    cloudflared.kill();
    process.exit(0);
  });
}
