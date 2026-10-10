// Prix Marché: Moussa's morning prices at Sandaga and Tilène, Dakar's two big markets, as an example app for a room.
// The prices are sample figures that move a little each day (the same all day, the same for everyone), not a real
// scrape: a real version would fetch them every morning. PORT comes from La Coloc (see examples/hello).
const http = require("node:http");

const port = Number(process.env.PORT || 3000);

// Typical prices in FCFA, per kilo unless said otherwise. Tilène is often a little cheaper than Sandaga.
const GOODS = [
  { name: "Onions", unit: "a kilo", base: 500 },
  { name: "Potatoes", unit: "a kilo", base: 450 },
  { name: "Broken rice", unit: "a kilo", base: 400 },
  { name: "Tomatoes", unit: "a kilo", base: 600 },
  { name: "Thiof", unit: "a kilo", base: 4500 },
  { name: "Cooking oil", unit: "a litre", base: 1300 },
  { name: "Sugar", unit: "a kilo", base: 650 },
];

// A small, fixed wobble per day, product and market: -6 % to +6 %, rounded to 25 francs as stalls do.
function priceOn(day, good, market) {
  let h = 2166136261;
  for (const c of `${day}/${good.name}/${market}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const wobble = ((h >>> 0) % 1201) / 10000 - 0.06;
  const cheaper = market === "Tilène" ? 0.96 : 1;
  return Math.round((good.base * cheaper * (1 + wobble)) / 25) * 25;
}

const fcfa = (n) => `${new Intl.NumberFormat("fr-FR").format(n)} FCFA`;

function today() {
  const day = new Date().toISOString().slice(0, 10);
  return GOODS.map((g) => ({ name: g.name, unit: g.unit, sandaga: priceOn(day, g, "Sandaga"), tilene: priceOn(day, g, "Tilène") }));
}

function page() {
  const rows = today()
    .map((g) => {
      const best = g.tilene < g.sandaga ? "tilene" : g.sandaga < g.tilene ? "sandaga" : "";
      return `<tr><th scope="row">${g.name} <small>${g.unit}</small></th><td class="${best === "sandaga" ? "best" : ""}">${fcfa(g.sandaga)}</td><td class="${best === "tilene" ? "best" : ""}">${fcfa(g.tilene)}</td></tr>`;
    })
    .join("");
  const when = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Dakar" });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Prix Marché</title>
<style>
  :root { color-scheme: light dark; --bg: #f6f5f1; --ink: #1d1b18; --soft: #6b655c; --line: #e3e0d8; --good: #1f6f5c; }
  @media (prefers-color-scheme: dark) { :root { --bg: #131311; --ink: #f2efe8; --soft: #a39d92; --line: #2c2b27; --good: #4cc09f; } }
  body { margin: 0; background: var(--bg); color: var(--ink); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
  main { max-width: 38rem; margin: 0 auto; padding: 48px 20px; }
  h1 { font-size: 2.8rem; margin: 0 0 8px; letter-spacing: -0.02em; }
  p { font-size: 1.15rem; line-height: 1.5; color: var(--soft); margin: 0 0 28px; }
  table { width: 100%; border-collapse: collapse; font-size: 1.05rem; font-variant-numeric: tabular-nums; }
  th, td { padding: 14px 6px; border-bottom: 1px solid var(--line); text-align: right; font-weight: 400; }
  th[scope="row"] { text-align: left; }
  thead th { color: var(--soft); font-size: 0.95rem; }
  small { color: var(--soft); }
  .best { color: var(--good); font-weight: 600; }
</style>
</head>
<body>
<main>
  <h1>Prix Marché</h1>
  <p>This ${when}, at Sandaga and Tilène. The better price is in green. These are sample figures that change each day.</p>
  <table>
    <thead><tr><td></td><th scope="col">Sandaga</th><th scope="col">Tilène</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</main>
</body>
</html>`;
}

http
  .createServer((req, res) => {
    if ((req.headers.accept || "").includes("text/html")) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(page());
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ day: new Date().toISOString().slice(0, 10), currency: "XOF", prices: today() }));
  })
  .listen(port, () => console.log(`prix-marche: today's prices on ${port}`));
