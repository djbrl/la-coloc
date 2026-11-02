// The walkthrough's words: one card per control or corner of the screen, while everything stands still (the cards'
// order and which ones show are in tutorial.ts). Each has a title and a tiny line, on a keyboard and on a touch screen
// (null: not shown there), and the thing on screen it points at (TourCard draws a ring around it; null: nothing to
// point at). Words in braces are keys, drawn as key caps. {W} {A} {S} {D} {E} are places on the keyboard, drawn with the letter this keyboard
// prints there (Z Q S D on AZERTY: lobby/keys.ts); French calls Shift "Maj".
import { defineWords } from "../../../i18n";
import { caps } from "../../../lobby/keys";
import type { TourCardName } from "./tutorial";

export const TOUR_TARGET: Record<TourCardName, string | null> = {
  help: ".hud.help",
  walk: null,
  dash: null,
  use: null,
  search: ".hud.find-key",
  map: ".hud.map",
  pick: null,
  chat: '[data-tour="chat"]',
  bell: '[data-tour="bell"]',
  settings: '[data-tour="settings"]',
};

const CARDS: Record<TourCardName, { title: string; keys: string; touch: string | null }> = {
  help: { title: "Every key", keys: "{?} shows them, any time.", touch: null },
  walk: { title: "Walk", keys: "{W} {A} {S} {D}, or click the ground.", touch: "Tap the ground." },
  dash: { title: "Dash", keys: "Tap {Shift}.", touch: "The round arrow button." },
  use: { title: "Go in", keys: "{E} at a door, or on anything in reach.", touch: "Tap the button that shows up at a door." },
  search: { title: "Search", keys: "{F} finds a house or a person.", touch: "Finds a house or a person." },
  map: { title: "Map", keys: "{M}: pick a house, go to its door.", touch: "Tap it: pick a house, go to its door." },
  pick: { title: "What's around you", keys: "{[} and {]} pick it.", touch: null },
  chat: { title: "Chat", keys: "Your house and your friends.", touch: "Your house and your friends." },
  bell: { title: "News", keys: "Knocks, invitations, a flatmate's build.", touch: "Knocks, invitations, a flatmate's build." },
  settings: { title: "Settings", keys: "Language, sound, log out.", touch: "Language, sound, log out." },
};
export const TOUR_TEXT = defineWords("tour", CARDS, {
  help: { title: "Toutes les touches", keys: "{?} les montre, à tout moment.", touch: null },
  walk: { title: "Marcher", keys: "{W} {A} {S} {D}, ou cliquez sur le sol.", touch: "Touchez le sol." },
  dash: { title: "Sprinter", keys: "Appuyez sur {Maj}.", touch: "Le bouton rond à flèche." },
  use: { title: "Entrer", keys: "{E} à une porte, ou sur ce qui est à portée.", touch: "Touchez le bouton qui apparaît à une porte." },
  search: { title: "Chercher", keys: "{F} trouve une maison ou une personne.", touch: "Trouve une maison ou une personne." },
  map: { title: "Carte", keys: "{M} : choisissez une maison, allez à sa porte.", touch: "Touchez-la : choisissez une maison, allez à sa porte." },
  pick: { title: "Autour de vous", keys: "{[} et {]} choisissent.", touch: null },
  chat: { title: "Discussions", keys: "Votre maison et vos amis.", touch: "Votre maison et vos amis." },
  bell: { title: "Nouvelles", keys: "Coups à la porte, invitations, la construction d'un coloc.", touch: "Coups à la porte, invitations, la construction d'un coloc." },
  settings: { title: "Réglages", keys: "Langue, son, déconnexion.", touch: "Langue, son, déconnexion." },
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
