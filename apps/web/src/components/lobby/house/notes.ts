// The house's News tab (the API's "fridge"): the notice board where the house pins a note by itself when something
// happens in a room: a new version online, an app that crashed, a review gone late, a thank-you
// (apps/api/src/houses/fridge.ts and chores.service.ts write them). The panel says "news" and "notes" because a
// newcomer has no reason to know the fridge joke.
//
// This file decides how a note looks (which icon, which colour), when it was pinned in words, and the tab's one
// sentence. No DOM and no Vue here, so it's tested in notes.test.ts.
import { locale } from "../../../i18n";
import type { FridgeNote } from "../../../types";
import { commonWords as w } from "../../words";
import type { IconName } from "./icons";

// A note's tone is all we know of its kind, and enough: good news, a heads-up, something broken, plain info.
// `colour` names a token in style.css (--live, --warn, --danger, or the muted text for plain info).
export interface NoteLook {
  icon: IconName;
  colour: "live" | "warn" | "danger" | "quiet";
}

const LOOKS: Record<FridgeNote["tone"], NoteLook> = {
  thanks: { icon: "heart", colour: "live" },
  warning: { icon: "warn", colour: "warn" },
  danger: { icon: "alert", colour: "danger" },
  info: { icon: "info", colour: "quiet" },
};

export function noteLook(tone: FridgeNote["tone"]): NoteLook {
  return LOOKS[tone] ?? LOOKS.info;
}

const WEEK_MS = 7 * 24 * 3_600_000;

/** How many notes were pinned in the last seven days. */
export function notesThisWeek(notes: Pick<FridgeNote, "at">[], now = Date.now()): number {
  return notes.filter((n) => now - Date.parse(n.at) < WEEK_MS).length;
}

/** The tab's one sentence: "3 notes this week.", "Nothing new this week." when every note is older, or what the
 *  board is for when it's empty. */
export function notesSummary(notes: Pick<FridgeNote, "at">[], now = Date.now()): string {
  if (!notes.length) return w.noNotes;
  const week = notesThisWeek(notes, now);
  return week ? w.notesWeek(week) : w.notesOlder;
}

// When a note was pinned, as a reader counts days: today, yesterday, or before (in the viewer's own time zone).
export type WhenKind = "today" | "yesterday" | "older";

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function whenKind(iso: string, now = new Date()): WhenKind {
  const days = Math.round((dayStart(now) - dayStart(new Date(iso))) / (24 * 3_600_000));
  return days <= 0 ? "today" : days === 1 ? "yesterday" : "older";
}

/** "14:02" for today, "Yesterday", or "12 Oct" (or "12 oct.") for older notes. */
export function noteWhen(iso: string, now = new Date()): string {
  const at = new Date(iso);
  switch (whenKind(iso, now)) {
    case "today":
      return at.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
    case "yesterday":
      return w.yesterday;
    case "older":
      return at.toLocaleDateString(locale(), { day: "numeric", month: "short" });
  }
}
