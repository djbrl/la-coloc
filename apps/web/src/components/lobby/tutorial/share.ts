// Showing your project off (the quest's chapter 7), as plain functions: the WhatsApp link, and the QR code drawn as
// one SVG path. The QR's modules come from `uqr` (MIT, no dependencies, see docs/licences.md); drawing them here,
// rather than taking the library's SVG string, keeps it in our colours (currentColor) and out of v-html.
import { encode } from "uqr";

/**
 * Whether an address opens from anywhere, or only on the machine that serves it: a demo server on a laptop gives its
 * rooms <room>.coloc.localhost addresses, which no phone or friend can open. Those get no QR code, no WhatsApp and
 * no "anyone can open it" (the 16 Oct review: a juror scanning it got nothing).
 */
export function opensAnywhere(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".test")) return false;
    if (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || host === "[::1]") return false;
    return true;
  } catch {
    return false;
  }
}

/** A WhatsApp link that opens the app (or WhatsApp Web) with the message ready to send, to whoever you pick. */
export function whatsappLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/**
 * A QR code for an address, as the `d` of one SVG path in a `size`×`size` box of modules (one unit each), with a
 * quiet border of `border` modules all round so phones can read it. Each run of dark modules on a row is one
 * rectangle, which keeps the path short.
 */
export function qrPath(text: string, border = 2, ecc: "L" | "M" = "M"): { d: string; size: number } {
  const { data } = encode(text, { ecc, border: 0 });
  const n = data.length;
  const parts: string[] = [];
  data.forEach((row, y) => {
    let x = 0;
    while (x < n) {
      if (!row[x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < n && row[x]) x++;
      parts.push(`M${start + border} ${y + border}h${x - start}v1h-${x - start}z`);
    }
  });
  return { d: parts.join(""), size: n + border * 2 };
}

/** Whether this browser can hand a link to the phone's own share sheet (most phones; few desktops). */
export function canShareNatively(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}
