#!/usr/bin/env node
// Development only: relays GitHub's webhooks from the App's smee.io channel to the local API.
// The API isn't exposed to the internet; this only pulls events in. Run with `npm run dev:webhooks`.
import SmeeClient from "smee-client";

const source = process.env.COLOC_GITHUB_WEBHOOK_PROXY;
if (!source) {
  console.error("No COLOC_GITHUB_WEBHOOK_PROXY: create the App first (node scripts/github-app.mjs).");
  process.exit(1);
}
const target = process.env.COLOC_WEBHOOK_TARGET ?? "http://127.0.0.1:4100/api/github/webhook";
new SmeeClient({ source, target, logger: console }).start();
console.log(`Relaying ${source} → ${target}`);
