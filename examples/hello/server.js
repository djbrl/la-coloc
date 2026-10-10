// The tutorial's first project: a small page that says hello, in the city's own words when it can.
// La Coloc tells every room where it lives through the environment: COLOC_ROOM, COLOC_HOUSE, COLOC_CITY,
// COLOC_COUNTRY, COLOC_LOGIN and COLOC_NAME (see apps/api/src/rooms/room-deployer.ts). PORT is the port to listen on.
// A browser gets the page; curl and scripts get one line of JSON.
const http = require("node:http");
const os = require("node:os");

const port = Number(process.env.PORT || 3000);
const room = process.env.COLOC_ROOM || "a room";
const house = process.env.COLOC_HOUSE || "a house";
const city = process.env.COLOC_CITY || "";
const name = process.env.COLOC_NAME || process.env.COLOC_LOGIN || "";
const startedAt = new Date();

// How each city says hello. Have someone from there check them before showing them off.
const GREETINGS = {
  Dakar: { text: "Nanga def", lang: "wo" },
  "Lomé": { text: "Woezɔ", lang: "ee" },
  Abidjan: { text: "Akwaba", lang: "fr" },
  Douala: { text: "On dit quoi", lang: "fr" },
  Kigali: { text: "Muraho", lang: "rw" },
  Tunis: { text: "Aslema", lang: "aeb" },
  Marrakech: { text: "Salam", lang: "ary" },
  Cotonou: { text: "Bonjour", lang: "fr" },
};
const greeting = GREETINGS[city] || { text: "Hello", lang: "en" };

// Text that came from the environment goes into HTML, so it's escaped.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function page() {
  const where = city ? `${house}, ${city}` : house;
  const when = startedAt.toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(greeting.text)}${name ? `, ${esc(name)}` : ""}</title>
<style>
  :root { color-scheme: light dark; --bg: #f7f4ee; --ink: #1d1b18; --soft: #6b655c; }
  @media (prefers-color-scheme: dark) { :root { --bg: #15140f; --ink: #f2efe8; --soft: #a39d92; } }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--bg); color: var(--ink);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
  main { padding: 32px 24px; max-width: 34rem; }
  h1 { font-size: clamp(2.6rem, 9vw, 4.5rem); line-height: 1.05; letter-spacing: -0.02em; margin: 0 0 24px; font-weight: 700; }
  p { font-size: 1.25rem; line-height: 1.5; margin: 0 0 12px; }
  .soft { color: var(--soft); font-size: 1rem; margin-top: 32px; }
</style>
</head>
<body>
<main>
  <h1><span lang="${greeting.lang}">${esc(greeting.text)}</span>${name ? `, ${esc(name)}` : ""}!</h1>
  <p>This page runs in room ${esc(room)} of ${esc(where)}.</p>
  <p>You put it online yourself. Next time, it's your own project.</p>
  <p class="soft">It started on ${esc(when)} UTC, in container ${esc(os.hostname())}.</p>
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
    res.end(JSON.stringify({ hello: name || "from my room", room, house, city, container: os.hostname(), at: new Date().toISOString() }));
  })
  .listen(port, () => console.log(`hello: ${room} of ${house} listening on ${port}`));
