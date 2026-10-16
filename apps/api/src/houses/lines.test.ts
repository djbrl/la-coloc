import { describe, expect, it } from "vitest";
import { knockText, noteText, readKnockLine, readNote } from "./lines";

describe("the sentences the API writes", () => {
  it("write a fridge note in English and read it back into its kind and blanks", () => {
    const text = noteText("deployFailed", { name: "Awa Diop", reason: "npm ERR! missing script: start" });
    expect(text).toBe("Awa Diop's deploy failed: npm ERR! missing script: start. The previous version is still running.");
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
    // A note written before the templates, word for word the same.
    expect(readNote("Awa's app crashed. Restarting it.")).toEqual({ kind: "crashed", params: { name: "Awa" } });
    expect(readNote("Aïssatou put her first project online. Welcome!")).toBeNull();
  });

  it("do the same for the house's lines in a knock's thread", () => {
    expect(readKnockLine(knockText("yes", { name: "Fatou" }))).toEqual({ kind: "yes", params: { name: "Fatou" } });
    expect(readKnockLine(knockText("taken"))).toEqual({ kind: "taken", params: {} });
    expect(readKnockLine("Hello, I'd host a bot.")).toBeNull();
  });
});
