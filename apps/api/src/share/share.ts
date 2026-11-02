// The page a shared house link opens: "Join <house> on La Coloc", with the city's picture, a few stats and one key into
// the city. It stands on its own, plain HTML and a little inline CSS with no JavaScript, and its head says the same
// thing to chat apps (WhatsApp, Telegram, X…) for their preview card: crawlers don't run the site's JavaScript, so
// the preview has to be in the HTML the API sends. The site's look, in the site's colours (style.css). Its fonts are
// bundled with the site and out of reach here, so the page falls back on what the system has.
//
// Everything that comes from the database (a house's name, a project's name) is escaped before it goes in.
import { CITIES } from "../chat/channels";

// What the page needs to know about a house. Null: no such house (or one the city doesn't show, like the workshop).
export interface SharedHouse {
  id: string;
  name: string;
  city: string;
  rooms: { occupied: boolean; project: string | null }[];
}

export type ShareLang = "en" | "fr";

// The page's words, in the language the link asked for (`?lang=fr`), English otherwise.
const WORDS = {
  en: {
    site: "La Coloc",
    join: (house: string) => `Join ${house} on La Coloc`,
    pitch: "Your own room on a shared server: put your project online and split the bill with friends.",
    generic: "A city of dev houses: move into a room, put your project online, split the server bill.",
    rooms: (n: number) => `${n} room${n === 1 ? "" : "s"}`,
    free: (n: number) => (n ? `${n} free` : "full"),
    // The stats' names.
    city: "City",
    allRooms: "Rooms",
    freeRooms: "Free",
    projects: "Projects",
    take: "Take a room",
    see: "See the house",
    lostTitle: "This house isn't on the map",
    lostLine: "It may have moved on. The city is still here, with plenty of other doors to knock on.",
    toCity: "Go to the city",
  },
  fr: {
    site: "La Coloc",
    join: (house: string) => `Rejoignez ${house} sur La Coloc`,
    pitch: "Votre chambre sur un serveur partagé\u00a0: mettez votre projet en ligne et divisez la facture entre amis.",
    generic: "Une ville de maisons de devs\u00a0: prenez une chambre, mettez votre projet en ligne, partagez la facture du serveur.",
    rooms: (n: number) => `${n} chambre${n === 1 ? "" : "s"}`,
    free: (n: number) => (n ? `${n} libre${n === 1 ? "" : "s"}` : "complet"),
    city: "Ville",
    allRooms: "Chambres",
    freeRooms: "Libres",
    projects: "Projets",
    take: "Prendre une chambre",
    see: "Voir la maison",
    lostTitle: "Cette maison n'est pas sur la carte",
    lostLine: "Elle a peut-être déménagé. La ville est toujours là, avec bien d'autres portes où frapper.",
    toCity: "Aller à la ville",
  },
} as const;

// At most this many project names in the preview's line, and on the page; the rest are left out.
const PROJECTS = 3;
const PAGE_PROJECTS = 6;

/** HTML-escapes text for an element or a double-quoted attribute. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// The flatmates' projects, in room order, each once.
const projectsOf = (h: SharedHouse) => [...new Set(h.rooms.filter((r) => r.occupied && r.project).map((r) => r.project!))];
const freeIn = (h: SharedHouse) => h.rooms.filter((r) => !r.occupied).length;

/** The house's one line, its projects in room order: "4 rooms · 1 free · Ndaje, Kër Bot, Prix Marché". */
export function shareLine(h: SharedHouse, lang: ShareLang): string {
  const w = WORDS[lang];
  return [w.rooms(h.rooms.length), w.free(freeIn(h)), projectsOf(h).slice(0, PROJECTS).join(", ")].filter(Boolean).join(" · ");
}

/**
 * The city's picture: /og/<City>.jpg for a city on the map, else the generic /og/city.jpg. Absolute for the preview,
 * which crawlers want that way (`publicUrl`); relative on the page itself (""), so it comes from whichever address
 * served the page.
 */
export function ogImage(publicUrl: string, city: string | null): string {
  const known = city && CITIES.includes(city);
  return `${publicUrl}/og/${known ? encodeURIComponent(city) : "city"}.jpg`;
}

// The site's look: the sign's off-white board, a white card with the red line inside its edge and a hard flat shadow,
// a red key with a darker lip, the yellow sticker. One radius. Colours copied from style.css, as this page can't read it.
const STYLE = `
*{box-sizing:border-box}
html,body{margin:0;min-height:100%}
body{display:grid;place-items:center;min-height:100dvh;padding:16px;background:#f7f5ef;color:#17151a;font:600 17px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
main{width:min(560px,100%);overflow:hidden;border-radius:9px;background:#fff;box-shadow:inset 0 0 0 3px #b3202c,0 7px 0 rgba(20,12,18,.45)}
img{display:block;width:100%;aspect-ratio:1200/630;object-fit:cover;background:#b3202c}
.body{display:grid;gap:16px;padding:22px 24px 26px}
.site{justify-self:start;margin:0;padding:3px 10px;border-radius:9px;background:#ffd21f;color:#17151a;font-size:14px;font-weight:800}
h1{margin:0;font:900 clamp(28px,7vw,38px)/1.05 "Arial Black","Helvetica Neue",Arial,sans-serif;text-transform:uppercase;overflow-wrap:anywhere}
p{margin:0}
.pitch{color:#5c5862}
dl{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0}
dl div{padding:10px 12px;border-radius:9px;background:#f1eee6;min-width:0}
dl .wide{grid-column:1/-1}
dt{font-size:14px;color:#5c5862}
dd{margin:0;font-size:20px;font-weight:800;overflow-wrap:anywhere}
dl .wide dd{font-size:17px}
.key{display:flex;align-items:center;justify-content:center;min-height:60px;padding:8px 20px;border-radius:9px;background:#b3202c;color:#fff;box-shadow:0 5px 0 #6e121b;font:900 19px/1.1 "Arial Black","Helvetica Neue",Arial,sans-serif;text-align:center;text-decoration:none;text-transform:uppercase}
.key:hover{background:#c8283a}
.key:focus-visible{outline:3px solid #1e4fa8;outline-offset:2px}
@media (max-width:520px){.body{padding:18px 18px 22px}}
`;

/**
 * The whole page. `publicUrl` is the site's own address (COLOC_PUBLIC_URL), for the preview's picture and link, which
 * crawlers want absolute. The key stays relative, so it lands on whichever address served the page.
 */
export function sharePage(h: SharedHouse | null, publicUrl: string, lang: ShareLang = "en"): string {
  const w = WORDS[lang];
  const e = escapeHtml;
  // What's previewed: the same title as the page, for a house; La Coloc itself, for a link to no house.
  const title = h ? w.join(h.name) : w.site;
  const line = h ? `${w.pitch} ${shareLine(h, lang)}` : w.generic;
  const self = h ? `${publicUrl}/api/share/house/${encodeURIComponent(h.id)}` : publicUrl;
  const preview = ogImage(publicUrl, h?.city ?? null);
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title)}</title>
<meta name="description" content="${e(line)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${e(w.site)}">
<meta property="og:title" content="${e(title)}">
<meta property="og:description" content="${e(line)}">
<meta property="og:image" content="${e(preview)}">
<meta property="og:url" content="${e(self)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${e(title)}">
<meta name="twitter:description" content="${e(line)}">
<meta name="twitter:image" content="${e(preview)}">
<style>${STYLE}</style>
</head>
<body>
<main>
<img src="${e(ogImage("", h?.city ?? null))}" alt="">
<div class="body">
<p class="site">${e(w.site)}</p>
${h ? houseBody(h, lang) : `<h1>${e(w.lostTitle)}</h1>\n<p class="pitch">${e(w.lostLine)}</p>\n<a class="key" href="/">${e(w.toCity)}</a>`}
</div>
</main>
</body>
</html>
`;
}

// The page's middle for a house: the title, the line, the stats, and the key: a free room to take, or the house to see.
function houseBody(h: SharedHouse, lang: ShareLang): string {
  const w = WORDS[lang];
  const e = escapeHtml;
  const free = freeIn(h);
  const to = `/?city=${encodeURIComponent(h.city)}&in=house:${encodeURIComponent(h.id)}`;
  const projects = projectsOf(h).slice(0, PAGE_PROJECTS).join(", ");
  return `<h1>${e(w.join(h.name))}</h1>
<p class="pitch">${e(w.pitch)}</p>
<dl>
<div><dt>${e(w.city)}</dt><dd>${e(h.city)}</dd></div>
<div><dt>${e(w.allRooms)}</dt><dd>${h.rooms.length}</dd></div>
<div><dt>${e(w.freeRooms)}</dt><dd>${free}</dd></div>
${projects ? `<div class="wide"><dt>${e(w.projects)}</dt><dd>${e(projects)}</dd></div>` : ""}
</dl>
<a class="key" href="${e(to)}">${e(free ? w.take : w.see)}</a>`;
}
