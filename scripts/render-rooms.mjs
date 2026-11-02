#!/usr/bin/env node
// Makes the pictures in a house's windows (public/rooms/<character>.webp): each of the lobby's twelve characters at home
// in a lit room, from the same furniture as the landing's scene, in headless Chrome. Needs Chrome, cwebp and the site in
// development:
//   npm run dev:web -- --port 5177 --host 127.0.0.1
//   npm run render:rooms                      (or: npm run render:rooms -- http://127.0.0.1:5175)
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const site = process.argv[2] ?? "http://127.0.0.1:5177";
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9457;
const profile = mkdtempSync(join(tmpdir(), "coloc-rooms-"));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--use-angle=metal", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader", "--no-first-run", "about:blank"], { stdio: "ignore" });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// The landing's scene brings the furniture: everything before its own room starts.
const scene = readFileSync(join(here, "render-landing.page.js"), "utf8");
const furniture = scene.slice(scene.indexOf("const THREE"), scene.indexOf("const C = {"));
const page = readFileSync(join(here, "render-rooms.page.js"), "utf8").replace("/* furniture */", () => furniture);
const out = join(here, "../apps/web/public/rooms");
mkdirSync(out, { recursive: true });
try {
  let tab;
  for (let i = 0; i < 40 && !tab; i++) {
    await wait(300);
    tab = await fetch(`http://127.0.0.1:${PORT}/json`).then((r) => r.json()).then((l) => l.find((t) => t.type === "page")).catch(() => null);
  }
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); waiting.get(m.id)?.(m); waiting.delete(m.id); };
  const send = (method, params = {}) => new Promise((r) => { waiting.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  await send("Page.enable");
  await send("Page.navigate", { url: `${site}/lobby/README.md` });
  await wait(1500);
  await send("Runtime.evaluate", { expression: page });
  const res = await send("Runtime.evaluate", { expression: "window.__render()", awaitPromise: true, returnByValue: true, timeout: 280000 });
  if (res.result.exceptionDetails) throw new Error(JSON.stringify(res.result.exceptionDetails).slice(0, 1500));
  for (const [name, url] of Object.entries(res.result.result.value)) {
    const png = join(profile, `${name}.png`);
    writeFileSync(png, Buffer.from(url.split(",")[1], "base64"));
    const webp = spawnSync("cwebp", ["-quiet", "-q", "80", "-m", "6", png, "-o", join(out, `${name}.webp`)]);
    if (webp.status !== 0) throw new Error(`cwebp failed for ${name}`);
    console.log(name);
  }
  ws.close();
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  chrome.kill();
  await wait(300);
  rmSync(profile, { recursive: true, force: true });
}
