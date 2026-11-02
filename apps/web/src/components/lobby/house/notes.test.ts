import { afterEach, describe, expect, it } from "vitest";
import { language } from "../../../i18n";
import { noteLook, noteWhen, notesSummary, notesThisWeek, whenKind } from "./notes";
import { icons } from "./icons";

// Dates in the test machine's own time zone, as a viewer reads them.
const NOW = new Date(2026, 9, 15, 16, 30);
const at = (day: number, hour = 14, minute = 2) => new Date(2026, 9, day, hour, minute).toISOString();

afterEach(() => {
  language.lang = "en";
});

describe("the News tab", () => {
  it("draws each kind of note with its own icon and colour", () => {
    expect(noteLook("thanks")).toEqual({ icon: "heart", colour: "live" });
    expect(noteLook("warning")).toEqual({ icon: "warn", colour: "warn" });
    expect(noteLook("danger")).toEqual({ icon: "alert", colour: "danger" });
    expect(noteLook("info")).toEqual({ icon: "info", colour: "quiet" });
    for (const tone of ["thanks", "warning", "danger", "info"] as const) expect(icons[noteLook(tone).icon]).toBeTruthy();
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
