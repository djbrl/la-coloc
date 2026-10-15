import { afterEach, describe, expect, it } from "vitest";
import { commonWords, lobbyWords, settingsWords, welcomeWords } from "./components/words";
import { billHead, dayName, lineWords, reviewsLine, tontineLine } from "./components/lobby/house/exchange";
import { fcfa } from "./components/lobby/house/server";
import { houseWords } from "./components/lobby/house/words";
import { explain, houseLine, roomLine } from "./components/lobby/panel/words";
import { TIP_TEXT } from "./components/lobby/tutorial/tips";
import { goingWord } from "./components/lobby/tutorial/tutorial";
import { tutorialWords } from "./components/lobby/tutorial/words";
import { defineWords, dictionaries, langFrom, language, nbsp, startingLang, type Words } from "./i18n";

// Every dictionary the site has. Importing the modules above registers them; a new one belongs in this list.
const AREAS = ["explain", "states", "house", "tutorial", "tips", "welcome", "settings", "lobby", "common"];

// Every path to a leaf ("tour.next", "room.live"), with what's there.
function leaves(words: object, path = ""): Map<string, unknown> {
  const found = new Map<string, unknown>();
  for (const [key, value] of Object.entries(words)) {
    const at = path ? `${path}.${key}` : key;
    if (value && typeof value === "object") for (const [p, v] of leaves(value, at)) found.set(p, v);
    else found.set(at, value);
  }
  return found;
}

afterEach(() => {
  language.lang = "en";
});

describe("the language", () => {
  it("is French for any French browser, English for everything else", () => {
    expect(langFrom("fr")).toBe("fr");
    expect(langFrom("fr-SN")).toBe("fr");
    expect(langFrom("fr-CI")).toBe("fr");
    expect(langFrom("FR-fr")).toBe("fr");
    expect(langFrom("en-GB")).toBe("en");
    expect(langFrom("wo")).toBe("en");
    expect(langFrom("fry")).toBe("en");
    expect(langFrom("")).toBe("en");
    expect(langFrom(undefined)).toBe("en");
  });

  it("starts from the browser's language when nothing was chosen in this browser", () => {
    // No storage here (Node): nothing saved, so the browser decides.
    expect(startingLang({ language: "fr-SN" })).toBe("fr");
    expect(startingLang({ language: "en-US" })).toBe("en");
    expect(startingLang(undefined)).toBe("en");
  });
});

describe("the dictionaries", () => {
  it("are all here", () => {
    expect(dictionaries.map((d) => d.name).sort()).toEqual([...AREAS].sort());
  });

  it("have every key in both languages, of the same kind, and nothing empty", () => {
    for (const { name, en, fr } of dictionaries) {
      const english = leaves(en);
      const french = leaves(fr);
      expect([...french.keys()], name).toEqual([...english.keys()]);
      for (const [path, value] of english) {
        const other = french.get(path);
        expect(typeof other, `${name}.${path}`).toBe(typeof value);
        if (typeof value === "string") {
          expect(value.trim(), `${name}.${path} (English)`).not.toBe("");
          expect(String(other).trim(), `${name}.${path} (French)`).not.toBe("");
        }
        // A null (a tip with nothing to say on a touch screen) is null in both.
        if (value === null) expect(other, `${name}.${path}`).toBeNull();
      }
    }
  });

  it("write French with no-break spaces before : ; ! ? and inside « »", () => {
    expect(nbsp("Revues strictes : un merge ? Oui !")).toBe("Revues strictes\u00a0: un merge\u00a0? Oui\u00a0!");
    expect(nbsp("« Bonjour »")).toBe("«\u00a0Bonjour\u00a0»");
    for (const { name, fr } of dictionaries)
      for (const [path, value] of leaves(fr)) if (typeof value === "string") expect(value, `${name}.${path}`).not.toMatch(/ [:;!?»]|« /);
    language.lang = "fr";
    expect(houseWords.owes("Awa", false, "1 000 FCFA")).toBe("Awa doit 1 000 FCFA.");
    expect(lobbyWords.cityLine("Dakar", "7 projets en ligne.")).toBe("Dakar\u00a0: 7 projets en ligne.");
  });

  it("refuse a French dictionary that misses a key, at compile time", () => {
    // These lines only compile because the errors are expected: `npm run build` fails if a missing or extra key,
    // or a function with other arguments, were ever accepted.
    const english = { hello: "Hello", count: (n: number) => `${n} rooms` };
    // @ts-expect-error: "count" is missing
    const missing: Words<typeof english> = { hello: "Bonjour" };
    // @ts-expect-error: "goodbye" isn't in the English
    const extra: Words<typeof english> = { hello: "Bonjour", count: (n) => `${n} chambres`, goodbye: "Au revoir" };
    // @ts-expect-error: the function takes a number, not a string
    const wrong: Words<typeof english> = { hello: "Bonjour", count: (n: string) => n };
    expect([missing, extra, wrong]).toHaveLength(3);
  });
});

describe("reading words", () => {
  it("answers in the language chosen now, and follows a change", () => {
    const hello = defineWords("test", { hi: "Hello" }, { hi: "Bonjour" });
    dictionaries.pop();
    expect(hello.hi).toBe("Hello");
    language.lang = "fr";
    expect(hello.hi).toBe("Bonjour");
    language.lang = "en";
    expect(hello.hi).toBe("Hello");
  });

  it("says the first-visit path in French", () => {
    language.lang = "fr";
    expect(tutorialWords.welcome).toBe("Bienvenue à La Coloc.");
    expect(welcomeWords.count(2, 6)).toBe("2 sur 6");
    expect(settingsWords.title).toBe("Réglages");
    expect(commonWords.tryAgain).toBe("Réessayer");
    expect(explain.room(256, 0.5)).toBe("Votre part du serveur de la maison\u00a0: 256 Mo de mémoire et 0,5 CPU, pour un projet.");
    expect(roomLine({ status: "failed", occupant: { login: "awa", name: "Awa", avatarUrl: null } })).toBe("Sa dernière construction a échoué.");
    expect(houseLine({ city: "Dakar", status: "live", agentOnline: true, demo: false })).toBe("Dakar. Son serveur tourne.");
    expect(goingWord("building", true)).toBe("Construction…");
    expect(TIP_TEXT.dash.keys).toBe("Appuyez sur {Maj} pour sprinter.");
    expect(lobbyWords.online(0)).toBe("0 projet en ligne");
    expect(lobbyWords.online(2)).toBe("2 projets en ligne");
  });

  it("says the bill and the tontine in French, with French dates", () => {
    language.lang = "fr";
    const awa = { login: "awa", name: "Awa", share: 3000, reviews: 4, credit: 2000, skipped: 0, surcharge: 0, due: 1000, paid: false };
    expect(lineWords(awa, "jib")).toEqual({ reviews: `Awa a relu 4 PR\u00a0: ${fcfa(2000)} en moins.`, owes: `Awa doit ${fcfa(1000)}.` });
    expect(lineWords(awa, "awa")).toEqual({ reviews: `Vous avez relu 4 PR\u00a0: ${fcfa(2000)} en moins.`, owes: `Vous devez ${fcfa(1000)}.` });
    expect(lineWords({ ...awa, reviews: 0 }, "awa").reviews).toBe("Vous n'avez pas encore relu de PR ce mois-ci.");
    expect(reviewsLine(1)).toBe("1 revue échangée ce mois-ci.");
    expect(reviewsLine(23)).toBe("23 revues échangées ce mois-ci.");
    expect(billHead({ total: 12000, month: "2026-10", reviewCredit: 500 })).toBe(
      `${fcfa(12000)} pour octobre, partagés selon ce qu'utilise chaque projet. Chaque revue en retire ${fcfa(500)}.`,
    );
    expect(dayName("2026-11-01T00:00:00.000Z")).toBe("1er novembre");
    const moussa = { login: "moussa", name: "Moussa Diop", avatarUrl: null };
    const t = { current: { ...moussa, project: "Prix Marché" }, line: [], until: "2026-10-24T00:00:00.000Z" };
    expect(tontineLine(t, "jib")).toBe("Jusqu'au 24 octobre, la maison se mobilise pour Prix Marché, le projet de Moussa\u00a0: ses PR sont relues en premier.");
  });
});
