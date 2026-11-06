import { afterEach, describe, expect, it } from "vitest";
import { language } from "../../../i18n";
import { byDay, noteDay, noteMark, noteWhen, notesSummary, notesThisWeek, splitNote, whenKind } from "./notes";

// Dates in the test machine's own time zone, as a viewer reads them.
const NOW = new Date(2026, 9, 15, 16, 30);
const at = (day: number, hour = 14, minute = 2) => new Date(2026, 9, day, hour, minute).toISOString();

afterEach(() => {
  language.lang = "en";
});

describe("the News tab", () => {
  it("marks each kind of note with one quiet symbol: done, broken, or waiting for you", () => {
    expect(noteMark("thanks")).toBe("ok");
    expect(noteMark("info")).toBe("ok");
    expect(noteMark("warning")).toBe("todo");
    expect(noteMark("danger")).toBe("fail");
  });

  it("puts a note's first sentence on its line and the rest under it", () => {
    expect(splitNote("skindiff#85 merged without review. Strict house: not online.")).toEqual({ head: "skindiff#85 merged without review", rest: "Strict house: not online." });
    expect(splitNote("Awa moved in.")).toEqual({ head: "Awa moved in.", rest: "" });
    expect(splitNote("It crashed! The old version still runs.")).toEqual({ head: "It crashed!", rest: "The old version still runs." });
  });

  it("groups the notes by day, in the order they came", () => {
    const groups = byDay([{ at: at(15, 9) }, { at: at(15, 8) }, { at: at(14) }, { at: at(12) }], NOW);
    expect(groups.map((g) => [g.day, g.notes.length])).toEqual([["Today", 2], ["Yesterday", 1], ["12 October", 1]]);
    language.lang = "fr";
    expect(noteDay(at(15), NOW)).toBe("Aujourd'hui");
    expect(noteDay(at(12), NOW)).toBe("12 octobre");
  });

  it("counts the notes of the last seven days", () => {
    const notes = [{ at: at(15) }, { at: at(10) }, { at: at(1) }];
    expect(notesThisWeek(notes, NOW.getTime())).toBe(2);
  });

  it("says the week's notes in one sentence, or what the board is for when it's empty", () => {
    expect(notesSummary([{ at: at(15) }, { at: at(14) }, { at: at(12) }], NOW.getTime())).toBe("3 notes this week.");
    expect(notesSummary([{ at: at(15) }], NOW.getTime())).toBe("1 note this week.");
    expect(notesSummary([{ at: at(1) }], NOW.getTime())).toBe("Nothing new this week.");
    expect(notesSummary([], NOW.getTime())).toBe("Nothing pinned yet.");
    language.lang = "fr";
    expect(notesSummary([{ at: at(15) }, { at: at(14) }], NOW.getTime())).toBe("2 mots cette semaine.");
  });

  it("says when a note was pinned as a reader counts days", () => {
    expect(whenKind(at(15, 0, 5), NOW)).toBe("today");
    expect(whenKind(at(14, 23, 59), NOW)).toBe("yesterday");
    expect(whenKind(at(12), NOW)).toBe("older");
    expect(noteWhen(at(15), NOW)).toBe("14:02");
    expect(noteWhen(at(14), NOW)).toBe("Yesterday");
    expect(noteWhen(at(12), NOW)).toBe("12 Oct");
    language.lang = "fr";
    expect(noteWhen(at(14), NOW)).toBe("Hier");
  });
});
