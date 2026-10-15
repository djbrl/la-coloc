// Showing your project off (the quest's chapter 7), as plain functions: the WhatsApp link, and the QR code drawn as
// one SVG path. The QR's modules come from `uqr` (MIT, no dependencies, see docs/licences.md); drawing them here,
// rather than taking the library's SVG string, keeps it in our colours (currentColor) and out of v-html.
import { encode } from "uqr";

/** A WhatsApp link that opens the app (or WhatsApp Web) with the message ready to send, to whoever you pick. */
export function whatsappLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/**
 * A QR code for an address, as the `d` of one SVG path in a `size`×`size` box of modules (one unit each), with a
 * quiet border of `border` modules all round so phones can read it. Each run of dark modules on a row is one
 * rectangle, which keeps the path short.
 */
export function qrPath(text: string, border = 2): { d: string; size: number } {
  const { data } = encode(text, { ecc: "M", border: 0 });
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
