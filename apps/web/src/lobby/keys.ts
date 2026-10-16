// The keys that walk and turn are places on the keyboard, not letters: W A S D on a QWERTY keyboard are Z Q S D on a
// French AZERTY one, and the hand sits the same way on both. So the lobby reads them by `KeyboardEvent.code` (the
// physical key: "KeyW" is the one above S, whatever it prints), and shows the letter this keyboard
// prints there (`navigator.keyboard.getLayoutMap`, in Chrome and Edge; elsewhere the QWERTY letters). Every other
// shortcut (M, F, T, ?, [ and ]) stays a letter, which is easier to remember.
import { reactive } from "vue";

// The physical keys the lobby reads by place, and the name it gives each (its QWERTY letter).
const PLACES: Record<string, string> = { KeyW: "w", KeyA: "a", KeyS: "s", KeyD: "d", KeyQ: "q", KeyE: "e", KeyR: "r" };
const TAKEN = new Set(Object.values(PLACES));

/**
 * The key a press means to the lobby: "w", "a", "s", "d", "q", "e" or "r" by place; any other letter key by what it
 * prints, except that a letter the lobby reads by place, printed somewhere else (AZERTY's W, where QWERTY has Z),
 * means nothing; every other key ("arrowup", "enter", "shift", "]"…) as it is, in lower case.
 */
export function cityKey(e: Pick<KeyboardEvent, "code" | "key">): string {
  const place = PLACES[e.code];
  if (place) return place;
  const key = e.key.toLowerCase();
  if (e.code?.startsWith("Key") && TAKEN.has(key)) return "";
  return key;
}

/** What to print on the caps of the keys read by place: their QWERTY letters until the keyboard says otherwise. */
export const caps = reactive<Record<"w" | "a" | "s" | "d" | "q" | "e" | "r", string>>({ w: "W", a: "A", s: "S", d: "D", q: "Q", e: "E", r: "R" });

type LayoutMap = { get(code: string): string | undefined };
type WithKeyboard = { keyboard?: { getLayoutMap?: () => Promise<LayoutMap> } };

/** Reads this keyboard's letters, where the browser tells (once is enough; a failure keeps the QWERTY letters). */
export async function readLayout(nav: WithKeyboard | undefined = typeof navigator === "undefined" ? undefined : (navigator as WithKeyboard)) {
  try {
    const map = await nav?.keyboard?.getLayoutMap?.();
    if (!map) return;
    for (const [code, name] of Object.entries(PLACES)) {
      const printed = map.get(code);
      if (printed && printed.length === 1) caps[name as keyof typeof caps] = printed.toUpperCase();
    }
  } catch {
    // Not allowed here (an iframe, a permissions policy): the QWERTY letters stay.
  }
}
