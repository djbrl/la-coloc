// The house's News tab (the API's "fridge"): the notice board where the house pins a note by itself when something
// happens in a room: a new version online, an app that crashed, a review gone late, a thank-you
// (apps/api/src/houses/fridge.ts and chores.service.ts write them). The panel says "news" and "notes" because a
// newcomer has no reason to know the fridge joke.
//
// This file decides how a note looks (its symbol, its line and what goes under it), when it was pinned in words, how
// the notes group by day, and the tab's one sentence. No DOM and no Vue here, so it's tested in notes.test.ts.
import { locale } from "../../../i18n";
import type { FridgeNote } from "../../../types";
import { commonWords as w } from "../../words";
import { houseWords as hw } from "./words";

// A note's tone is all we know of its kind, and enough. The tab says it with one quiet symbol per line, never a coloured
// row (Jib, 6 Nov): done (a tick), broken (a cross), or something waiting for you (a white dot on ink). Plain info,
// someone moving in say, reads as done. The names are style.css's `.status-mark` kinds.
export type NoteMark = "ok" | "fail" | "todo";

const MARKS: Record<FridgeNote["tone"], NoteMark> = {
  thanks: "ok",
  info: "ok",
  warning: "todo",
  danger: "fail",
};

export function noteMark(tone: FridgeNote["tone"]): NoteMark {
  return MARKS[tone] ?? "ok";
}

/** A note's first sentence as its line, the rest under it, smaller: "skindiff#85 merged without review" over "Strict
 *  house: not online. A review unblocks it." A note of one sentence keeps its words as they are. */
export function splitNote(text: string): { head: string; rest: string } {
  const cut = text.match(/^(.+?)[.!?]\s+(?=\p{Lu})/u);
  if (!cut) return { head: text, rest: "" };
  const rest = text.slice(cut[0].length).trim();
  // The line keeps its own "!" or "?", only a full stop goes: it's a line now, not a sentence among others.
  const head = cut[0].trim().replace(/\.$/, "");
  return { head, rest };
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

/** The heading of a day's notes: "Today", "Yesterday", or the date in full ("31 October", "31 octobre"). */
export function noteDay(iso: string, now = new Date()): string {
  switch (whenKind(iso, now)) {
    case "today":
      return hw.today;
    case "yesterday":
      return w.yesterday;
    case "older":
      return new Date(iso).toLocaleDateString(locale(), { day: "numeric", month: "long" });
  }
}

/** The notes in the order they came, in one group per day. */
export function byDay<N extends Pick<FridgeNote, "at">>(notes: N[], now = new Date()): { day: string; notes: N[] }[] {
  const days: { key: number; day: string; notes: N[] }[] = [];
  for (const n of notes) {
    const key = dayStart(new Date(n.at));
    const last = days[days.length - 1];
    if (last && last.key === key) last.notes.push(n);
    else days.push({ key, day: noteDay(n.at, now), notes: [n] });
  }
  return days.map(({ day, notes }) => ({ day, notes }));
}
