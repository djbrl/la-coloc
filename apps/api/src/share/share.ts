// The page a shared house link opens: a few lines of HTML that chat apps (WhatsApp, Telegram, X…) read to draw a
// preview card (title, one line, a picture of the city), then send a person straight on to the house in the city.
// Crawlers don't run the site's JavaScript, so the preview has to be in the HTML the API sends.
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

// The preview's line, in the language the link asked for (`?lang=fr`), English otherwise.
const WORDS = {
  en: {
    site: "La Coloc",
    generic: "A city of dev houses: move into a room, put your project online, split the server bill.",
    rooms: (n: number) => `${n} room${n === 1 ? "" : "s"}`,
    free: (n: number) => (n ? `${n} free` : "full"),
    open: "Open the house",
    openCity: "Open the city",
  },
  fr: {
    site: "La Coloc",
    generic: "Une ville de maisons de devs : prenez une chambre, mettez votre projet en ligne, partagez la facture du serveur.",
    rooms: (n: number) => `${n} chambre${n === 1 ? "" : "s"}`,
    free: (n: number) => (n ? `${n} libre${n === 1 ? "" : "s"}` : "complet"),
    open: "Ouvrir la maison",
    openCity: "Ouvrir la ville",
  },
} as const;

// At most this many project names in the line; the rest are left out.
const PROJECTS = 3;

/** HTML-escapes text for an element or a double-quoted attribute. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** The house's one line, its projects in room order: "4 rooms · 1 free · Ndaje, Kër Bot, Prix Marché". */
export function shareLine(h: SharedHouse, lang: ShareLang): string {
  const w = WORDS[lang];
  const free = h.rooms.filter((r) => !r.occupied).length;
  const projects = [...new Set(h.rooms.filter((r) => r.occupied && r.project).map((r) => r.project!))].slice(0, PROJECTS);
  return [w.rooms(h.rooms.length), w.free(free), projects.join(", ")].filter(Boolean).join(" · ");
}

/** The city's picture for the card: /og/<City>.jpg for a city on the map, else the generic /og/city.jpg. */
export function ogImage(publicUrl: string, city: string | null): string {
  const known = city && CITIES.includes(city);
  return `${publicUrl}/og/${known ? encodeURIComponent(city) : "city"}.jpg`;
}

/**
 * The whole page. `publicUrl` is the site's own address (COLOC_PUBLIC_URL), for the picture and the card's link,
 * which crawlers want absolute. The redirect stays relative, so it lands on whichever address served the page.
 */
export function sharePage(h: SharedHouse | null, publicUrl: string, lang: ShareLang = "en"): string {
  const w = WORDS[lang];
  const title = h ? `${h.name}, ${h.city}` : w.site;
  const line = h ? shareLine(h, lang) : w.generic;
  const to = h ? `/?city=${encodeURIComponent(h.city)}&in=house:${encodeURIComponent(h.id)}` : "/";
  const self = h ? `${publicUrl}/api/share/house/${encodeURIComponent(h.id)}` : publicUrl;
  const image = ogImage(publicUrl, h?.city ?? null);
  const e = escapeHtml;
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(h ? `${title} · ${w.site}` : title)}</title>
<meta name="description" content="${e(line)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${e(w.site)}">
<meta property="og:title" content="${e(title)}">
<meta property="og:description" content="${e(line)}">
<meta property="og:image" content="${e(image)}">
<meta property="og:url" content="${e(self)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${e(title)}">
<meta name="twitter:description" content="${e(line)}">
<meta name="twitter:image" content="${e(image)}">
<meta http-equiv="refresh" content="0; url=${e(to)}">
</head>
<body>
<p><a href="${e(to)}">${e(h ? w.open : w.openCity)}: ${e(title)}</a></p>
</body>
</html>
`;
}
