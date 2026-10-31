// How fast the city runs at its worst: 100 houses and 100 people, all moving, walking around, with no frame-rate cap.
// In real life a lobby holds 32 people; this is the case we optimise for. Fails if the numbers fall under the budget,
// so a change that costs frames shows up here and not in front of the jury. Needs Chrome and a running site:
//   npm run up          (in another terminal)
//   npm run perf        (or: npm run perf -- http://localhost:5176)
// It measures your machine, and only means something plugged in, with nothing heavy running.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const site = process.argv[2] ?? "http://localhost:5175";
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9467;
// Frames a second at least, and milliseconds a frame at most.
const BUDGET = { fps: 90, slowFps: 30, styleMs: 1, tagsMs: 1 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Runs in the page. `window.lobby` is there in development only.
const inPage = `
window.__perf = async (houses, people, together) => {
  const l = window.lobby, proto = Object.getPrototypeOf(l);
  const { generateNeighbourhood } = await import("/src/lobby/neighbourhood.ts");
  const real = (await (await fetch("/api/city")).json()).houses;
  const model = real.find((h) => h.rooms.some((r) => r.occupant)) ?? real[0];
  const someone = model.rooms.find((r) => r.occupant).occupant;
  const made = Array.from({ length: houses }, (_, i) => ({
    ...model, id: "perf" + i, name: "Maison " + i, city: "Dakar", plot: null, recent: [], cpu: 0,
    rooms: Array.from({ length: 4 }, (_, k) => ({ ...model.rooms[0], name: "r" + k, occupant: k < 3 ? { ...someone, login: "u" + i + "_" + k, name: "U " + i, badge: null } : null })),
  }));
  // Nothing from the real city may rebuild the town under us.
  l.setNeighbourhood = () => {};
  l.updateHouses = () => {};
  clearInterval(window.__perfMoves);
  l.clearRemotes();
  proto.setNeighbourhood.call(l, generateNeighbourhood("Dakar", made), made, { passersBy: true, close: false });
  await new Promise((r) => setTimeout(r, 4000));
  const b = l.bounds, c = l.player.position, walkers = [];
  for (let i = 0; i < people; i++) {
    const x = together ? c.x + (Math.random() - 0.5) * 20 : b.minX + Math.random() * (b.maxX - b.minX);
    const z = together ? c.z + (Math.random() - 0.5) * 14 : b.minZ + Math.random() * (b.maxZ - b.minZ);
    walkers.push({ login: "p" + i, x, z, a: Math.random() * 6.28 });
    l.addRemote({ login: "p" + i, name: "Dev " + i, avatar: null, x, z, ry: 0, moving: true, badge: null });
  }
  window.__perfMoves = setInterval(() => {
    for (const w of walkers) {
      w.a += (Math.random() - 0.5) * 0.4;
      w.x += Math.sin(w.a) * 0.15;
      w.z += Math.cos(w.a) * 0.15;
      l.moveRemote(w.login, w.x, w.z, w.a, true);
    }
  }, 100);
  // You walk too, round a square.
  const legs = ["w", "d", "s", "s", "a", "a", "w", "d"];
  let leg = 0;
  l.keys.clear();
  l.keys.add(legs[0]);
  const walking = setInterval(() => { l.keys.clear(); l.keys.add(legs[++leg % 8]); }, 3000);
  await new Promise((r) => setTimeout(r, 3000));
  const frames = [], tags = [], style = [];
  const draw = l.tags.draw;
  l.tags.draw = function (...a) { const t = performance.now(); draw.apply(l.tags, a); tags.push(performance.now() - t); const s = performance.now(); getComputedStyle(l.tags.canvas).opacity; style.push(performance.now() - s); };
  let last = performance.now();
  const start = last;
  await new Promise((res) => { const f = () => { const n = performance.now(); frames.push(n - last); last = n; if (n - start < 8000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
  l.tags.draw = draw;
  clearInterval(walking);
  l.keys.clear();
  const mean = (x) => x.reduce((p, q) => p + q, 0) / x.length;
  const sorted = [...frames].sort((p, q) => p - q);
  return { fps: Math.round(frames.length / 8), p95: +sorted[Math.floor(sorted.length * 0.95)].toFixed(1), styleMs: +mean(style).toFixed(2), tagsMs: +mean(tags).toFixed(2), calls: l.renderer.info.render.calls };
};`;

const profile = mkdtempSync(join(tmpdir(), "coloc-perf-"));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--window-size=1440,900", "--force-device-scale-factor=2", "--use-angle=metal", "--ignore-gpu-blocklist", "--enable-gpu", "--disable-gpu-vsync", "--disable-frame-rate-limit", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows", "about:blank"], { stdio: "ignore" });
let failed = false;
try {
  let page;
  for (let i = 0; i < 40 && !page; i++) {
    await wait(300);
    page = await fetch(`http://127.0.0.1:${PORT}/json`).then((r) => r.json()).then((l) => l.find((t) => t.type === "page")).catch(() => null);
  }
  if (!page) throw new Error("Chrome didn't start");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); waiting.get(m.id)?.(m); waiting.delete(m.id); };
  const send = (method, params = {}) => new Promise((r) => { waiting.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  const run = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, timeout: 120000 });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
    return r.result.result.value;
  };
  await send("Page.enable");
  await send("Page.navigate", { url: `${site}/?city=Dakar` });
  for (let i = 0; i < 60; i++) {
    await wait(500);
    if (await run("!!window.lobby && window.lobby.placed.length > 0")) break;
    if (i === 59) throw new Error(`No city at ${site}: is the site running, in development?`);
  }
  await wait(4000);
  await run(inPage);
  const check = (name, r, fps) => {
    const ok = r.fps >= fps && r.styleMs <= BUDGET.styleMs && r.tagsMs <= BUDGET.tagsMs;
    failed ||= !ok;
    console.log(`${ok ? "ok  " : "SLOW"} ${name.padEnd(44)} ${String(r.fps).padStart(4)} fps (at least ${fps})  p95 ${String(r.p95).padStart(5)} ms  style ${r.styleMs} ms  tags ${r.tagsMs} ms  ${r.calls} calls`);
  };
  check("100 houses, 100 people spread out", await run("window.__perf(100, 100, false)"), BUDGET.fps);
  check("2 houses, 100 people all on screen", await run("window.__perf(2, 100, true)"), BUDGET.fps);
  await send("Emulation.setCPUThrottlingRate", { rate: 4 });
  check("100 houses, 100 people, CPU 4x slower", await run("window.__perf(100, 100, false)"), BUDGET.slowFps);
  ws.close();
} catch (e) {
  console.error(e.message);
  failed = true;
} finally {
  chrome.kill();
  await wait(300);
  rmSync(profile, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
