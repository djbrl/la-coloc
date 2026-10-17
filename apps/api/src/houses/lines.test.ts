import { describe, expect, it } from "vitest";
import { knockText, noteText, plainNote, readKnockLine, readNote } from "./lines";

describe("the sentences the API writes", () => {
  it("write a fridge note in English and read it back into its kind and blanks", () => {
    const text = noteText("deployFailed", { name: "Awa Diop", reason: "npm ERR! missing script: start" });
    expect(plainNote(text)).toBe("Awa Diop's deploy failed: npm ERR! missing script: start. The previous version is still running.");
    expect(readNote(text)).toEqual({ kind: "deployFailed", params: { name: "Awa Diop", reason: "npm ERR! missing script: start" } });
  });

  it("tell apart notes that start the same way", () => {
    expect(readNote(noteText("reviewedLate", { name: "Jib", ref: "awa/site#3" }))).toEqual({ kind: "reviewedLate", params: { name: "Jib", ref: "awa/site#3" } });
    expect(readNote(noteText("reviewed", { name: "Jib", ref: "awa/site#3" }))?.kind).toBe("reviewed");
    expect(readNote(noteText("restartedOwn", { name: "Jib" }))?.kind).toBe("restartedOwn");
    expect(readNote(noteText("restartedFree", { name: "Jib" }))?.kind).toBe("restartedFree");
    expect(readNote(noteText("restartedOther", { name: "Jib", other: "Awa" }))).toEqual({ kind: "restartedOther", params: { name: "Jib", other: "Awa" } });
    expect(readNote(noteText("movedIn", { name: "Fatou" }))?.kind).toBe("movedIn");
    expect(readNote(noteText("reposMoved", { name: "Fatou", repos: "fatou/a, fatou/b" }))?.params.repos).toBe("fatou/a, fatou/b");
  });

  it("read old rows the same way, and leave a text no template wrote alone", () => {
    // A note written before the templates and their marks, word for word the same.
    expect(readNote("Awa's app crashed. Restarting it.")).toEqual({ kind: "crashed", params: { name: "Awa" } });
    expect(readNote("Awa reviewed Djbrl/coloc-test#6. Merci!")).toEqual({ kind: "reviewed", params: { name: "Awa", ref: "Djbrl/coloc-test#6" } });
    expect(readNote("Something no template says.")).toBeNull();
  });

  // An older seed planted this note on every reset. A ref is "owner/repo#12", so it isn't read as a review note and
  // the French page doesn't say "Jib a relu Moussa's pull request".
  it("don't read an old note no template wrote as one", () => {
    expect(readNote("Jib reviewed Moussa's pull request. Merci!")).toBeNull();
  });

  // A display name is free text on GitHub, and may hold the template's own words. The marks keep each blank whole.
  it("give back a name whole, even with the template's words in it", () => {
    const name = "Bob's deploy failed: lol";
    expect(readNote(noteText("deployFailed", { name, reason: "npm ERR! missing script: start" }))?.params.name).toBe(name);
    expect(readNote(noteText("restartedOther", { name: "Ana restarted Bob", other: "Awa" }))).toEqual({
      kind: "restartedOther",
      params: { name: "Ana restarted Bob", other: "Awa" },
    });
    // A value can't bring marks of its own.
    expect(readNote(noteText("restartedOther", { name: "Ana⁩ restarted ⁨Bob", other: "Awa" }))?.params.name).toBe("Ana restarted Bob");
  });

  it("never let a name change the kind of a note", () => {
    expect(readNote(noteText("shipped", { name: "Eve's app crashed. Restarting it. Mallory" }))?.kind).toBe("shipped");
  });

  // The reason is the first line of a failed build's message, of any length.
  it("read a note with a very long reason quickly", () => {
    const reason = "'s deploy failed: ".repeat(5000) + "x";
    const text = noteText("deployFailed", { name: "Awa", reason }).replace(/ The previous version is still running\.$/, "");
    const t0 = performance.now();
    readNote(text);
    readNote(plainNote(text));
    expect(performance.now() - t0).toBeLessThan(200);
  });

  it("do the same for the house's lines in a knock's thread", () => {
    expect(readKnockLine(knockText("yes", { name: "Fatou" }))).toEqual({ kind: "yes", params: { name: "Fatou" } });
    expect(readKnockLine(knockText("taken"))).toEqual({ kind: "taken", params: {} });
    expect(readKnockLine("Hello, I'd host a bot.")).toBeNull();
  });
});
