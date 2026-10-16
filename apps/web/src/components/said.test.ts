import { afterEach, describe, expect, it } from "vitest";
import { language } from "../i18n";
import { knockLine, noteText } from "./said";

afterEach(() => {
  language.lang = "en";
});

describe("sentences the API wrote", () => {
  it("say a fridge note in the reader's language, from its kind and blanks", () => {
    const n = { text: "Awa's app crashed. Restarting it.", said: { kind: "crashed", params: { name: "Awa" } } };
    expect(noteText(n)).toBe("Awa's app crashed. Restarting it.");
    language.lang = "fr";
    expect(noteText(n)).toBe("L'app de Awa a planté. Elle redémarre.");
    expect(noteText({ text: "x", said: { kind: "reviewLate", params: { name: "Jib", ref: "awa/site#3", hours: "24" } } })).toBe(
      "Jib n'a pas encore relu awa/site#3. C'était à faire dans les 24 h.",
    );
  });

  it("keep the API's English for a kind they don't know, or a note no template wrote", () => {
    language.lang = "fr";
    expect(noteText({ text: "Aïssatou put her first project online. Welcome!", said: null })).toBe("Aïssatou put her first project online. Welcome!");
    expect(noteText({ text: "Something new.", said: { kind: "somethingNew", params: {} } })).toBe("Something new.");
    expect(noteText({ text: "From an older API." })).toBe("From an older API.");
  });

  it("say a knock thread's house lines in the reader's language", () => {
    language.lang = "fr";
    expect(knockLine({ body: "The house said yes. Welcome home, Fatou!", said: { kind: "yes", params: { name: "Fatou" } } })).toBe("La maison a dit oui. Bienvenue, Fatou !");
    expect(knockLine({ body: "Hi!", said: null })).toBe("Hi!");
  });
});
