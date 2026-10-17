import { afterEach, describe, expect, it } from "vitest";
import { language } from "./i18n";
import { frenchRefusals, refusalText } from "./refusals";

// The API's source, to find every code it writes (tests left out).
const api = import.meta.glob(["../../api/src/**/*.ts", "!../../api/src/**/*.test.ts"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;

afterEach(() => {
  language.lang = "en";
});

describe("the API's refusals", () => {
  it("show the API's English, or the French for its code", () => {
    const r = { message: "Slow down a little: wait a few seconds before writing again.", code: "slowDownMessages" };
    expect(refusalText(r)).toBe(r.message);
    language.lang = "fr";
    expect(refusalText(r)).toBe("Doucement : attendez quelques secondes avant de réécrire.");
    expect(refusalText({ message: "Keep it under 500 characters.", code: "tooLong", max: 500 })).toBe("Moins de 500 caractères, s'il vous plaît.");
  });

  it("keep the API's English when there's no code, or one this page doesn't know", () => {
    language.lang = "fr";
    expect(refusalText({ message: "Something new." })).toBe("Something new.");
    expect(refusalText({ message: "Something newer.", code: "somethingNewer" })).toBe("Something newer.");
  });

  it("have French for every code the API writes", () => {
    const codes = new Set<string>();
    for (const source of Object.values(api)) {
      // A refusal's code is a word in camelCase ("core_down" and "ECONNREFUSED" are other things).
      for (const m of source.matchAll(/\bcode: "([a-z][a-zA-Z]+)"/g)) codes.add(m[1]);
      // The reasons an invitation lapses (notifications.service.ts, LAPSED), and their fallback.
      const lapsed = /const LAPSED[^{]*\{([^}]*)\}/.exec(source)?.[1] ?? "";
      for (const m of lapsed.matchAll(/: "(\w+)"/g)) codes.add(m[1]);
      for (const m of source.matchAll(/LAPSED\[why\] \?\? "(\w+)"/g)) codes.add(m[1]);
    }
    expect(codes.size).toBeGreaterThan(40);
    expect([...codes].filter((c) => !frenchRefusals.includes(c))).toEqual([]);
  });
});
