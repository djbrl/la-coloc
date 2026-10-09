#!/usr/bin/env node
// Creates the development GitHub App in two clicks, with GitHub's "App manifest" flow:
//   1. this script serves a page that sends GitHub the App's settings (name, permissions, events, URLs);
//   2. you confirm on GitHub; GitHub sends you back here with a one-time code;
//   3. we trade the code for the App's keys and write them to dev/.env.github and dev/github-app.pem
//      (both git-ignored). Nobody copies a secret by hand.
// Webhooks reach your machine through a smee.io channel (relayed by `npm run dev:webhooks`), so the API itself
// is never exposed to the internet.
//
// Usage: node scripts/github-app.mjs   then open http://localhost:4101
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 4101;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = path.join(ROOT, "dev", ".env.github");
const KEY_FILE = path.join(ROOT, "dev", "github-app.pem");
const WEB = process.env.COLOC_PUBLIC_URL ?? "http://localhost:5175";

if (existsSync(ENV_FILE) && !process.argv.includes("--force")) {
  console.error(`${ENV_FILE} already exists: an App was created before. Re-run with --force to create another.`);
  process.exit(1);
}

// A fresh smee.io channel: GitHub posts webhooks there, `npm run dev:webhooks` relays them to the local API.
async function smeeChannel() {
  const res = await fetch("https://smee.io/new", { redirect: "manual" });
  const url = res.headers.get("location");
  if (!url?.startsWith("https://smee.io/")) throw new Error("couldn't open a smee.io channel");
  return url;
}

const state = randomBytes(16).toString("hex");
const webhookUrl = await smeeChannel();
const manifest = {
  // GitHub lets you change the name on the next page. It must be unique across GitHub.
  name: `La Coloc dev ${randomBytes(2).toString("hex")}`,
  url: WEB,
  description: "Development App for La Coloc: login, and code-review chores between flatmates.",
  hook_attributes: { url: webhookUrl, active: true },
  redirect_url: `http://localhost:${PORT}/done`,
  // "Log in with GitHub" comes back here.
  callback_urls: [`${WEB}/api/auth/github/callback`],
  // Only installable on your own account while we develop.
  public: false,
  default_permissions: {
    metadata: "read",
    // Read code to build it into a room (private repos).
    contents: "read",
    // Comment "Corvée: @someone" and request their review.
    pull_requests: "write",
    issues: "write",
  },
  // Installation events come on their own.
  default_events: ["pull_request", "pull_request_review"],
};

const escape = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const page = (body) => `<!doctype html><meta charset="utf-8"><title>La Coloc: GitHub App</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:620px;margin:48px auto;padding:0 16px}button{font:inherit;padding:10px 16px;border-radius:8px;border:0;background:#1f1d1a;color:#fff;cursor:pointer}code{background:#eee;padding:1px 4px;border-radius:4px}</style>
${body}`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  if (url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      page(`<h1>Create the development GitHub App</h1>
<p>GitHub will show you the App's settings and ask you to confirm. It asks for: read your code, comment on pull
requests and request reviews. It's private to your account.</p>
<form action="https://github.com/settings/apps/new?state=${state}" method="post">
<input type="hidden" name="manifest" value="${escape(JSON.stringify(manifest))}">
<button>Continue on GitHub</button></form>`),
    );
    return;
  }
  if (url.pathname === "/done") {
    try {
      if (url.searchParams.get("state") !== state) throw new Error("this answer isn't for this page (state mismatch)");
      const code = url.searchParams.get("code");
      if (!code) throw new Error("GitHub didn't send a code");
      const r = await fetch(`https://api.github.com/app-manifests/${encodeURIComponent(code)}/conversions`, {
        method: "POST",
        headers: { Accept: "application/vnd.github+json", "User-Agent": "coloc.dev" },
      });
      if (!r.ok) throw new Error(`GitHub refused the code (${r.status})`);
      const app = await r.json();
      await writeFile(KEY_FILE, app.pem, { mode: 0o600 });
      await writeFile(
        ENV_FILE,
        [
          "# The development GitHub App. Written by scripts/github-app.mjs. Never commit this file.",
          `# ${app.html_url}`,
          `COLOC_GITHUB_APP_ID=${app.id}`,
          `COLOC_GITHUB_APP_SLUG=${app.slug}`,
          `COLOC_GITHUB_CLIENT_ID=${app.client_id}`,
          `COLOC_GITHUB_CLIENT_SECRET=${app.client_secret}`,
          `COLOC_GITHUB_WEBHOOK_SECRET=${app.webhook_secret}`,
          `COLOC_GITHUB_PRIVATE_KEY_FILE=${KEY_FILE}`,
          `COLOC_GITHUB_WEBHOOK_PROXY=${webhookUrl}`,
          "",
        ].join("\n"),
        { mode: 0o600 },
      );
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        page(`<h1>Done: ${escape(app.name)}</h1>
<p>Keys saved to <code>dev/.env.github</code> and <code>dev/github-app.pem</code> (git-ignored).</p>
<p>Next: restart the API, run <code>npm run dev:webhooks</code>, then
<a href="${escape(app.html_url)}/installations/new">install the App on a repo</a>.</p>`),
      );
      console.log(`Created ${app.name} (${app.html_url}). Keys in dev/.env.github. You can close this.`);
      setTimeout(() => process.exit(0), 500);
    } catch (e) {
      res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
      res.end(page(`<h1>That didn't work</h1><p>${escape(String(e.message))}</p><p><a href="/">Try again</a></p>`));
    }
    return;
  }
  res.writeHead(404).end();
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Open http://localhost:${PORT} to create the GitHub App. Webhooks will go to ${webhookUrl}`);
});
