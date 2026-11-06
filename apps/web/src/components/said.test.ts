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

  it("say the workshop's hello by name, in both languages", () => {
    const hello = { body: "x", said: { kind: "welcome", params: { name: "Fatou", house: "L'Atelier" } } };
    expect(knockLine(hello)).toBe("Hello Fatou, welcome to L'Atelier! This is the house's channel: say hi anytime.");
    language.lang = "fr";
    // French spaces before "!" and ":" don't break (i18n.ts): compared as plain spaces.
    expect(knockLine(hello).replace(/\s/g, " ")).toBe("Bonjour Fatou, bienvenue à L'Atelier ! C'est le salon de la maison : dites bonjour quand vous voulez.");
  });

  it("say why a deploy failed in French when the caretaker used known words, and keep the rest as it came", () => {
    language.lang = "fr";
    const failed = (reason: string) => noteText({ text: "x", said: { kind: "deployFailed", params: { name: "Awa", reason } } });
    expect(failed("exited with code 1")).toBe("Le déploiement de Awa a échoué : l'app s'est arrêtée avec le code 1. La version d'avant tourne toujours.");
    expect(failed("build failed: npm ERR! missing script: start")).toContain("la construction s'est arrêtée (npm ERR! missing script: start)");
    expect(failed("Something new went wrong")).toContain("a échoué : Something new went wrong.");
  });
});
