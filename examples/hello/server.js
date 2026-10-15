// The starter page of "Your first home": the first thing a newcomer puts online, and shares. It says "I just moved
// in", in the city's own words, with a drawing of the house and their window lit.
// La Coloc tells every room where it lives through the environment: COLOC_ROOM, COLOC_HOUSE, COLOC_CITY,
// COLOC_COUNTRY, COLOC_LOGIN and COLOC_NAME (see apps/api/src/rooms/room-deployer.ts). PORT is the port to listen on.
// A browser gets the page (in French when it asks for French); curl and scripts get one line of JSON.
// One file, no dependencies, nothing fetched from elsewhere: the drawing is inline SVG, the fonts are the system's.
const http = require("node:http");
const os = require("node:os");

const port = Number(process.env.PORT || 3000);
const room = process.env.COLOC_ROOM || "a room";
const house = process.env.COLOC_HOUSE || "a house";
const city = process.env.COLOC_CITY || "";
const name = process.env.COLOC_NAME || process.env.COLOC_LOGIN || "";
const firstName = name.trim().split(/\s+/)[0] || "";
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

// Text that came from the environment or the request goes into HTML, so it's escaped.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Every visible sentence, in English and in French ("vous"). The values passed in are already escaped.
const WORDS = {
  en: {
    moved: "I just moved in.",
    where: (r, h, c) => `Room <b>${r}</b> of <b>${h}</b>${c ? `, ${c}` : ""}.`,
    address: "My address",
    drawing: (r) => `A house under the moon or the sun, a baobab beside it, and one lit window: room ${r}.`,
    yoursTitle: "Make it yours",
    yours: "Your room runs this ready-made page. To put your own project here, link a repo on GitHub from your room in La Coloc; every merge goes online.",
    merge: "merge",
    made: "Made in La Coloc",
    since: (when) => `Online since ${when} UTC`,
    container: "container",
    locale: "en-GB",
  },
  fr: {
    moved: "Je viens d’emménager.",
    where: (r, h, c) => `Chambre <b>${r}</b> de <b>${h}</b>${c ? `, ${c}` : ""}.`,
    address: "Mon adresse",
    drawing: (r) => `Une maison sous la lune ou le soleil, un baobab à côté, et une fenêtre allumée : la chambre ${r}.`,
    yoursTitle: "À vous de jouer",
    yours: "Votre chambre fait tourner cette page toute prête. Pour y mettre votre propre projet, liez un dépôt GitHub depuis votre chambre dans La Coloc : chaque merge est mis en ligne.",
    merge: "merge",
    made: "Fait à La Coloc",
    since: (when) => `En ligne depuis le ${when} UTC`,
    container: "conteneur",
    locale: "fr-FR",
  },
};

// French when the browser's first choice is French, English otherwise.
const pickLanguage = (header) => (/^\s*fr\b/i.test(header || "") ? "fr" : "en");

// The tab's icon: a small orange house, drawn inline so nothing is fetched.
const FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#f2600f"/><path d="M7 15h18v10H7z" fill="#1c1712"/><path d="M5 13h22v3H5z" fill="#1c1712"/><rect x="18" y="18" width="5" height="4" fill="#ffd27a"/></svg>`,
  );

// The house, drawn by hand: a flat-roofed house with a water tank, a wax-print band, a baobab, the sun by day and
// the moon and stars by night. The lit window is the newcomer's room; the door's plaque carries its name.
function drawing(roomName, description) {
  const plaque = roomName.length > 13 ? `${roomName.slice(0, 12)}…` : roomName;
  return `<svg viewBox="0 0 360 260" role="img" aria-labelledby="art-title">
  <title id="art-title">${esc(description)}</title>
  <defs>
    <pattern id="wax" width="12" height="10" patternUnits="userSpaceOnUse">
      <rect width="12" height="10" fill="#f2600f"/><circle cx="6" cy="5" r="3.4" fill="#f9b233"/><circle cx="6" cy="5" r="1.4" fill="#1c1712"/>
      <path d="M0 0l3 5-3 5M12 0l-3 5 3 5" fill="#1c1712"/>
    </pattern>
    <radialGradient id="halo"><stop offset="0" stop-color="#ffcf6b" stop-opacity=".9"/><stop offset="1" stop-color="#ffcf6b" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="360" height="260" fill="var(--sky)"/>
  <g class="day"><circle cx="292" cy="50" r="24" fill="#f9b233"/><circle cx="292" cy="50" r="34" fill="#f9b233" opacity=".18"/></g>
  <g class="night">
    <circle cx="292" cy="48" r="18" fill="#f4ead2"/><circle cx="300" cy="42" r="15" fill="var(--sky)"/>
    <circle class="star" cx="40" cy="30" r="1.4" fill="#f4ead2"/><circle class="star s2" cx="120" cy="22" r="1.1" fill="#f4ead2"/>
    <circle class="star s3" cx="210" cy="40" r="1.3" fill="#f4ead2"/><circle class="star" cx="250" cy="16" r="1" fill="#f4ead2"/>
    <circle class="star s2" cx="335" cy="96" r="1.2" fill="#f4ead2"/><circle class="star s3" cx="16" cy="80" r="1" fill="#f4ead2"/>
  </g>
  <path d="M0 216 Q90 206 180 214 T360 212 V260 H0Z" fill="var(--ground)"/>
  <g fill="var(--bark)">
    <path d="M50 222c5-30 3-62 9-92h26c6 30 4 62 9 92z"/>
  </g>
  <g stroke="var(--bark)" stroke-width="6" stroke-linecap="round" fill="none">
    <path d="M62 134 40 104M70 132 68 96M80 134 104 106M58 140 30 128M86 140 114 130"/>
  </g>
  <g fill="var(--leaf)">
    <circle cx="38" cy="98" r="15"/><circle cx="68" cy="88" r="17"/><circle cx="104" cy="100" r="15"/>
    <circle cx="26" cy="124" r="11"/><circle cx="118" cy="126" r="11"/><circle cx="52" cy="92" r="11"/><circle cx="88" cy="90" r="12"/>
  </g>
  <rect x="152" y="76" width="28" height="22" rx="3" fill="var(--tank)"/>
  <path d="M156 98v4M176 98v4" stroke="var(--tank)" stroke-width="3"/>
  <rect x="140" y="108" width="172" height="114" fill="var(--wall)"/>
  <rect x="134" y="100" width="184" height="12" rx="2" fill="var(--wall-dark)"/>
  <rect x="140" y="112" width="172" height="10" fill="url(#wax)"/>
  <rect x="140" y="214" width="172" height="8" fill="var(--wall-dark)"/>
  <ellipse class="spill" cx="262" cy="230" rx="46" ry="6" fill="#ffcf6b"/>
  <circle class="glow" cx="259" cy="160" r="46" fill="url(#halo)"/>
  <rect x="234" y="136" width="50" height="46" rx="3" fill="var(--frame)"/>
  <rect class="pane" x="239" y="141" width="40" height="36" fill="#ffd27a"/>
  <path d="M259 141v36M239 159h40" stroke="var(--frame)" stroke-width="3"/>
  <path d="M244 177c2-8 6-10 8-10s4 4 3 10" fill="#3f7a4a"/>
  <rect x="230" y="182" width="58" height="5" rx="1.5" fill="var(--wall-dark)"/>
  <rect x="166" y="156" width="38" height="62" rx="3" fill="var(--door)"/>
  <path d="M172 166h26M172 178h26M172 190h26M172 202h26" stroke="var(--door-line)" stroke-width="2"/>
  <circle cx="197" cy="190" r="2.2" fill="#f9b233"/>
  <rect x="155" y="136" width="60" height="15" rx="3" fill="#f2600f"/>
  <text x="185" y="146.5" text-anchor="middle" font-family="ui-monospace, Menlo, Consolas, monospace" font-size="8.5" font-weight="700" fill="#1c1712">${esc(plaque)}</text>
  <rect x="160" y="218" width="50" height="5" rx="1" fill="var(--wall-dark)"/>
</svg>`;
}

function page({ host, lang }) {
  const w = WORDS[lang];
  const address = host || "localhost";
  const when = startedAt.toLocaleString(w.locale, { dateStyle: "long", timeStyle: "short", timeZone: "UTC" });
  const hello = `${greeting.text}${firstName ? `, ${firstName}` : ""}!`;
  // The same sentence without its bold, for link previews (WhatsApp shows the title and this line).
  const whereText = w.where(room, house, city).replace(/<\/?b>/g, "");
  const art = drawing(room, w.drawing(room));
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(hello)} ${esc(w.moved)}</title>
<meta name="description" content="${esc(`${whereText} ${w.made}.`)}">
<meta property="og:title" content="${esc(hello)} ${esc(w.moved)}">
<meta property="og:description" content="${esc(`${whereText} ${w.made}.`)}">
<meta property="og:type" content="website">
<meta name="theme-color" content="#f2600f">
<link rel="icon" href="${FAVICON}">
<style>
  :root { color-scheme: light dark; --bg: #f7f1e6; --ink: #1c1712; --soft: #67594b; --card: #fffaf2; --line: #e7dcc9;
    --sky: #fbe3c4; --ground: #e0bf8f; --wall: #e9a774; --wall-dark: #c9804e; --tank: #6f7f86; --frame: #7a3f1d;
    --door: #1f5f5b; --door-line: #184c49; --bark: #8a6448; --leaf: #6d8f3f; --glow: .55; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #11100e; --ink: #f4ede1; --soft: #b3a796; --card: #1b1916; --line: #2f2a24;
      --sky: #1a2034; --ground: #2b2219; --wall: #8c5735; --wall-dark: #6a3f25; --tank: #46525a; --frame: #3d2312;
      --door: #173f3c; --door-line: #113230; --bark: #4f3a2a; --leaf: #2f4626; --glow: .85; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--ink); display: flex; flex-direction: column;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
  .band { height: 14px; flex: none;
    background: radial-gradient(circle, #1c1712 0 2.5px, transparent 3px) 0 0 / 22px 14px,
      radial-gradient(circle, #f9b233 0 5.5px, transparent 6px) 0 0 / 22px 14px,
      repeating-linear-gradient(135deg, #f2600f 0 7px, #c94a07 7px 14px); }
  main { flex: 1; width: 100%; max-width: 1060px; margin: 0 auto; padding: 32px 20px 24px; display: grid;
    grid-template-columns: minmax(0, 1fr); gap: 28px; align-items: center; }
  @media (min-width: 860px) { main { grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); padding: 56px 40px 32px; gap: 48px; } .art { order: 2; } }
  .art { margin: 0; border-radius: 24px; overflow: hidden; background: var(--sky); }
  .art svg { display: block; width: 100%; height: auto; }
  .night { display: none; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  @media (prefers-color-scheme: dark) { .day { display: none; } .night { display: inline; } }
  .glow { opacity: var(--glow); animation: glow 5s ease-in-out infinite; }
  .spill { opacity: calc(var(--glow) * .35); }
  .pane { animation: flicker 9s steps(1) infinite; }
  .star { animation: twinkle 3.2s ease-in-out infinite; } .s2 { animation-delay: 1.1s; } .s3 { animation-delay: 2.2s; }
  @keyframes glow { 50% { opacity: calc(var(--glow) * .6); } }
  @keyframes flicker { 0%, 90%, 92%, 100% { opacity: 1; } 91% { opacity: .72; } 93% { opacity: .86; } }
  @keyframes twinkle { 50% { opacity: .3; } }
  @keyframes rise { from { opacity: 0; transform: translateY(10px); } }
  .words > * { animation: rise .6s cubic-bezier(.2,.8,.2,1) both; } .words > :nth-child(2) { animation-delay: .08s; }
  .words > :nth-child(3) { animation-delay: .16s; } .words > :nth-child(4) { animation-delay: .24s; } .words > :nth-child(5) { animation-delay: .32s; }
  @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; } }
  h1 { font-size: clamp(2.6rem, 10vw, 4.6rem); line-height: 1; letter-spacing: -0.035em; margin: 0 0 14px; font-weight: 800; }
  .moved { font-size: clamp(1.4rem, 4.6vw, 1.9rem); font-weight: 700; letter-spacing: -0.015em; margin: 0 0 6px; }
  .where { font-size: 1.15rem; line-height: 1.5; color: var(--soft); margin: 0 0 22px; } .where b { color: var(--ink); font-weight: 600; }
  .address { display: inline-flex; align-items: center; gap: 10px; max-width: 100%; padding: 10px 16px 10px 12px; border-radius: 14px;
    background: #f2600f; color: #1c1712; font: 600 0.98rem/1.2 ui-monospace, Menlo, Consolas, monospace; margin: 0 0 28px; }
  .address span { overflow-wrap: anywhere; } .address svg { flex: none; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 20px; padding: 20px 22px; }
  .card h2 { font-size: 1.05rem; margin: 0 0 8px; display: flex; align-items: center; gap: 10px; }
  .card h2::before { content: ""; width: 10px; height: 10px; border-radius: 3px; background: #f2600f; }
  .card p { margin: 0 0 14px; line-height: 1.55; color: var(--soft); font-size: 0.98rem; }
  pre { margin: 0; padding: 12px 14px; border-radius: 12px; background: var(--bg); border: 1px solid var(--line); overflow-x: auto;
    font: 0.85rem/1.6 ui-monospace, Menlo, Consolas, monospace; color: var(--ink); }
  pre .soft { color: var(--soft); } pre .hot { color: #f2600f; font-weight: 700; }
  footer { width: 100%; max-width: 1060px; margin: 0 auto; padding: 8px 20px 28px; font-size: 0.82rem; color: var(--soft);
    display: flex; flex-wrap: wrap; gap: 6px 16px; align-items: center; }
  @media (min-width: 860px) { footer { padding: 8px 40px 36px; } }
  footer b { color: var(--ink); font-weight: 650; display: inline-flex; align-items: center; gap: 8px; }
  footer code { font-family: ui-monospace, Menlo, Consolas, monospace; }
</style>
</head>
<body>
<div class="band" aria-hidden="true"></div>
<main>
  <figure class="art">${art}</figure>
  <div class="words">
    <h1><span lang="${greeting.lang}">${esc(greeting.text)}</span>${firstName ? `, ${esc(firstName)}` : ""}!</h1>
    <p class="moved">${esc(w.moved)}</p>
    <p class="where">${w.where(esc(room), esc(house), esc(city))}</p>
    <p class="address"><span class="sr-only">${esc(w.address)}</span><svg width="18" height="18" viewBox="0 0 32 32" aria-hidden="true"><path d="M7 15h18v11H7zM5 12h22v3H5z" fill="#1c1712"/><rect x="18" y="18" width="5" height="4" fill="#f2600f"/></svg><span>${esc(address)}</span></p>
    <section class="card">
      <h2>${esc(w.yoursTitle)}</h2>
      <p>${esc(w.yours)}</p>
<pre><code><span class="soft">github.com/you/project</span>
  └─ <span class="hot">${esc(w.merge)}</span> → ${esc(address)}</code></pre>
    </section>
  </div>
</main>
<footer>
  <b><svg width="16" height="16" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#f2600f"/><path d="M7 15h18v10H7zM5 13h22v3H5z" fill="#1c1712"/></svg>${esc(w.made)}</b>
  <span>${esc(w.since(when))}</span>
  <span>${esc(w.container)} <code>${esc(os.hostname())}</code></span>
</footer>
</body>
</html>`;
}

http
  .createServer((req, res) => {
    if ((req.headers.accept || "").includes("text/html")) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Language", pickLanguage(req.headers["accept-language"]));
      res.end(page({ host: req.headers.host, lang: pickLanguage(req.headers["accept-language"]) }));
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ hello: name || "from my room", room, house, city, container: os.hostname(), at: new Date().toISOString() }));
  })
  .listen(port, () => console.log(`hello: ${room} of ${house} listening on ${port}`));
