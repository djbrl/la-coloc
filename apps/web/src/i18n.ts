// The site's two languages, English and French, without a library. Each area keeps its words in a small dictionary
// next to its code (panel/words.ts, house/words.ts, tutorial/words.ts, components/words.ts), written twice with
// `defineWords(name, en, fr)`. The French one must have exactly the English one's shape: a missing or extra key, or a
// sentence-making function that takes different arguments, is a type error, so `npm run build` fails until it's fixed.
// `defineWords` gives back one object that answers in the language chosen now; Vue tracks that choice, so every
// template and computed that reads a word redraws when the language changes.
//
// The language: what this browser chose, else English. `<html lang>` follows it, for screen readers and the browser's hyphenation.
import { reactive, watchEffect } from "vue";

export type Lang = "en" | "fr";
export const LANGS: readonly Lang[] = ["en", "fr"];

const KEY = "coloc.lang";

// The choice saved in this browser, or null when there's none (or no storage: private mode, a sandbox).
function saved(): Lang | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === "en" || value === "fr" ? value : null;
  } catch {
    return null;
  }
}

/** The language at start: the saved choice, else English. */
export function startingLang(): Lang {
  return saved() ?? "en";
}

export const language = reactive<{ lang: Lang }>({ lang: startingLang() });

/** Switches the whole site to `lang`, and remembers it in this browser. */
export function setLang(lang: Lang) {
  language.lang = lang;
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // No storage: the choice lasts until the tab closes.
  }
}

/** The locale for dates and numbers (Intl): French as written in France and West Africa, English as in Britain. */
export const locale = (lang: Lang = language.lang) => (lang === "fr" ? "fr-FR" : "en-GB");

/** "1 room", "2 rooms": English counts only 1 as singular. For the English dictionaries. */
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** "0 chambre", "1 chambre", "2 chambres": French counts 0 and 1 as singular. For the French dictionaries. */
export const pluriel = (n: number, one: string, many: string) => `${n} ${n <= 1 ? one : many}`;

/** "0.5" or "0,5": a number as the current language writes it. */
export const num = (n: number) => new Intl.NumberFormat(locale()).format(n);

if (typeof document !== "undefined") watchEffect(() => (document.documentElement.lang = language.lang));

// The shape a French dictionary must have, from the English one: every string a string, every function the same
// arguments giving a string, every group the same keys.
export type Words<T> = T extends string
  ? string
  : T extends (...args: infer A) => string
    ? (...args: A) => string
    : { readonly [K in keyof T]: Words<T[K]> };

// Every dictionary, both languages, for the tests (i18n.test.ts checks they have the same keys and nothing empty).
export const dictionaries: { name: string; en: object; fr: object }[] = [];

/** One area's words in both languages. Read them as a plain object (`words.title`, `words.owes(…)`): each read
 *  answers in the current language. */
export function defineWords<T extends object>(name: string, en: T, fr: Words<T>): T {
  const french = typeset(fr);
  dictionaries.push({ name, en, fr: french });
  return new Proxy(en, { get: (_target, key) => Reflect.get(language.lang === "fr" ? french : en, key) });
}

/** French puts a space before : ; ! ? % and inside « »; it must never break there, or a line could start with "?". The
 *  dictionaries are written with plain spaces, readable in the code; this swaps in no-break spaces. */
export const nbsp = (text: string) => text.replace(/ ([:;!?»%])/g, "\u00a0$1").replace(/« /g, "«\u00a0");

// The French dictionary with every sentence, and every sentence a function makes, run through nbsp().
function typeset<T>(words: T): T {
  if (typeof words === "string") return nbsp(words) as T;
  if (typeof words === "function") {
    const say = words as (...args: unknown[]) => string;
    return ((...args: unknown[]) => nbsp(say(...args))) as T;
  }
  if (Array.isArray(words)) return words.map(typeset) as T;
  if (words && typeof words === "object") return Object.fromEntries(Object.entries(words).map(([k, v]) => [k, typeset(v)])) as T;
  return words;
}
