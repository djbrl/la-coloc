// Sharing a house: the link to send, and what the message says. The link is the API's share page on the site's own
// origin (`/api/share/house/:id`): a tiny page with the house's name, city and picture for WhatsApp's preview, which
// then sends the visitor on to the house in the city. Plain functions, so they're tested; ShareHouse.vue draws them.
import { opensAnywhere } from "../tutorial/share";

/**
 * The link to share: the share page on this site, e.g. "https://la-coloc.vercel.app/api/share/house/sacre-coeur".
 * Shared from the French site, the preview's line is in French too (`?lang=fr`).
 */
export function houseShareLink(origin: string, houseId: string, lang: "en" | "fr" = "en"): string {
  const link = `${origin.replace(/\/+$/, "")}/api/share/house/${encodeURIComponent(houseId)}`;
  return lang === "fr" ? `${link}?lang=fr` : link;
}

/** The message that goes with it: "Sacré-Cœur, Dakar: https://…". The same in every language: names and a link. */
export function houseShareText(house: string, city: string, link: string): string {
  return `${house}, ${city}: ${link}`;
}

/**
 * The ways offered: the copy always; WhatsApp and the phone's own share sheet only when the link opens from anywhere
 * (a laptop's `localhost` site opens on that laptop alone, so a friend would get nothing).
 */
export function shareWays(link: string, native: boolean): { whatsapp: boolean; native: boolean; anywhere: boolean } {
  const anywhere = opensAnywhere(link);
  return { whatsapp: anywhere, native: native && anywhere, anywhere };
}
