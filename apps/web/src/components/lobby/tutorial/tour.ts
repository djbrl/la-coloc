// The city's cards' words: one card per thing, with the keys still yours (which cards show, and when, is in
// tutorial.ts). Each has a title and a tiny line, on a keyboard and on a touch screen (null: not shown there), and the
// thing on screen it points at (TourCard draws a ring around it; null: nothing to point at). Words in braces are keys,
// drawn as key caps. Walking shows the arrows (lobby/keys.ts); a letter read by its place on the keyboard would be
// drawn with what this keyboard prints there.
import { defineWords } from "../../../i18n";
import { ARROWS, caps } from "../../../lobby/keys";
import type { TourCardName } from "./tutorial";

export const TOUR_TARGET: Record<TourCardName, string | null> = {
  walk: null,
  map: ".hud.map",
  help: ".hud.help",
};

const arrows = `{${ARROWS.up}} {${ARROWS.left}} {${ARROWS.down}} {${ARROWS.right}}`;
const CARDS: Record<TourCardName, { title: string; keys: string; touch: string | null }> = {
  walk: { title: "Walk", keys: `${arrows}, or click the ground.`, touch: "Tap the ground." },
  map: { title: "Map", keys: "{M}: pick a house, go to its door.", touch: "Tap it: pick a house, go to its door." },
  help: { title: "Every key", keys: "{?} shows them, any time.", touch: null },
};
export const TOUR_TEXT = defineWords("tour", CARDS, {
  walk: { title: "Marcher", keys: `${arrows}, ou cliquez sur le sol.`, touch: "Touchez le sol." },
  map: { title: "Carte", keys: "{M} : choisissez une maison, allez à sa porte.", touch: "Touchez-la : choisissez une maison, allez à sa porte." },
  help: { title: "Toutes les touches", keys: "{?} les montre, à tout moment.", touch: null },
});

/** Words cut into plain text and key caps: "Tap {Shift} to dash." → text, key, text. A key read by its place shows what
 *  this keyboard prints there. */
export function keyParts(text: string): { key: boolean; text: string }[] {
  return text
    .split(/(\{[^}]+\})/)
    .filter(Boolean)
    .map((part) => (part.startsWith("{") ? { key: true, text: placed(part.slice(1, -1)) } : { key: false, text: part }));
}

function placed(key: string): string {
  const name = key.toLowerCase();
  return key.length === 1 && name in caps ? caps[name as keyof typeof caps] : key;
}
