// Sharing a house: the link to send, and the ways offered. The link is the API's share page on the site's own origin
// (`/api/share/house/:id`): a page of its own saying "Join <house> on La Coloc", with its stats and a key into the city,
// and the same words for WhatsApp's preview. Plain functions, so they're tested; ShareHouse.vue draws them, and the
// message that goes with the link is in words.ts.
import { opensAnywhere } from "../tutorial/share";

/**
 * The link to share: the share page on this site, e.g. "https://la-coloc.vercel.app/api/share/house/sacre-coeur".
 * Shared from the French site, the preview's line is in French too (`?lang=fr`).
 */
export function houseShareLink(origin: string, houseId: string, lang: "en" | "fr" = "en"): string {
  const link = `${origin.replace(/\/+$/, "")}/api/share/house/${encodeURIComponent(houseId)}`;
  return lang === "fr" ? `${link}?lang=fr` : link;
}

/**
 * The ways offered: the copy always; WhatsApp and the phone's own share sheet only when the link opens from anywhere
 * (a laptop's `localhost` site opens on that laptop alone, so a friend would get nothing).
 */
export function shareWays(link: string, native: boolean): { whatsapp: boolean; native: boolean; anywhere: boolean } {
  const anywhere = opensAnywhere(link);
  return { whatsapp: anywhere, native: native && anywhere, anywhere };
}
