// A title won in the Arena (docs/arena.md), as the API sends it with a person, and how a name tag shows it: a small
// chip after the name, a trophy and the title in the chosen language, gold, silver or bronze by place. Pure: Lobby.ts
// builds the chip's element from this.
import type { Lang } from "../i18n";

export interface Badge {
  key: string;
  title: { en: string; fr: string };
  place: 1 | 2 | 3;
  city: string;
  week: string;
}

// A tag stays short: a longer title is cut, with an ellipsis (its hidden name has it whole).
const LONGEST = 18;

/** The chip for a badge: its text, its colour (by place) and its whole title. */
export function badgeChip(b: Badge, lang: Lang): { text: string; tone: "gold" | "silver" | "bronze"; full: string } {
  const full = (lang === "fr" ? b.title.fr : b.title.en) || b.title.en || b.title.fr;
  const text = full.length > LONGEST ? `${full.slice(0, LONGEST - 1).trimEnd()}…` : full;
  return { text, tone: b.place === 1 ? "gold" : b.place === 2 ? "silver" : "bronze", full };
}
