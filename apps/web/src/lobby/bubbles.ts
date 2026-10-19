// Speech bubbles over people in the street (`Lobby.say`): what someone just wrote in the house's or the city's
// chat, over their head for a few seconds. One bubble per person: a newer line replaces the older one. Plain text
// only: the words go in with `textContent`, never as HTML, cut to about 80 characters with an ellipsis.
// The bubble is a name-tag-style card (style.css's `.lobby-label`), anchored by its bottom just over the name tag.
import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";

export const SAY = { max: 80, ms: 5000 };

/**
 * The text a bubble shows: line breaks, tabs and other control characters become spaces, runs of spaces become one,
 * and anything longer than `max` characters is cut to `max - 1` and ends with "…". Characters are counted as a reader
 * sees them (an emoji, or a letter with its accent, is one), so a cut never splits one in half. Empty: "".
 */
export function bubbleText(text: string, max = SAY.max): string {
  // \p{Cc}: control characters (new lines, tabs, escape…); \p{Zl}\p{Zp}: line and paragraph separators.
  const flat = text.replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, " ").replace(/\s+/g, " ").trim();
  const chars = graphemes(flat);
  if (chars.length <= max) return flat;
  return `${chars.slice(0, max - 1).join("").trimEnd()}…`;
}

// The characters of a text as a reader sees them, where the browser can tell (Intl.Segmenter), else code points.
function graphemes(text: string): string[] {
  const Segmenter = (Intl as unknown as { Segmenter?: new (lang?: string, opts?: { granularity: "grapheme" }) => { segment(t: string): Iterable<{ segment: string }> } }).Segmenter;
  if (Segmenter) return Array.from(new Segmenter(undefined, { granularity: "grapheme" }).segment(text), (s) => s.segment);
  return Array.from(text);
}

/** The bubbles on screen, by login. */
export class SpeechBubbles {
  private shown = new Map<string, { object: CSS2DObject; on: THREE.Object3D; timer: number }>();

  /**
   * A bubble over `figure` (someone's avatar: feet at its origin), saying `text`, for `SAY.ms`. `name` is who says it,
   * for screen readers. An older bubble of theirs goes. Nothing for an empty text.
   */
  say(login: string, name: string, figure: THREE.Object3D, text: string) {
    const words = bubbleText(text);
    if (!words) return;
    this.drop(login);
    // The anchor is a bare box, padded at the bottom so the card sits over the name tag (which is centred 1.75 up)
    // whatever the zoom: the padding is in pixels, not world units.
    const anchor = document.createElement("div");
    anchor.className = "lobby-say";
    anchor.style.paddingBottom = "20px";
    anchor.style.pointerEvents = "none";
    const card = document.createElement("div");
    card.className = "lobby-label small say";
    card.style.whiteSpace = "normal";
    card.style.width = "max-content";
    card.style.maxWidth = "180px";
    card.style.textAlign = "center";
    card.style.overflowWrap = "anywhere";
    card.textContent = words;
    card.setAttribute("aria-label", `${name}: ${words}`);
    anchor.append(card);
    const object = new CSS2DObject(anchor);
    // Anchored by its bottom middle, at the name tag's height.
    object.center.set(0.5, 1);
    object.position.set(0, 1.75, 0);
    figure.add(object);
    const timer = window.setTimeout(() => this.drop(login), SAY.ms);
    this.shown.set(login, { object, on: figure, timer });
  }

  /** Takes someone's bubble away (it timed out, a newer one came, or they left). */
  drop(login: string) {
    const b = this.shown.get(login);
    if (!b) return;
    window.clearTimeout(b.timer);
    b.object.element.remove();
    b.on.remove(b.object);
    this.shown.delete(login);
  }

  /** Every bubble goes (a new neighbourhood, the lobby closing). */
  clear() {
    for (const login of [...this.shown.keys()]) this.drop(login);
  }
}
