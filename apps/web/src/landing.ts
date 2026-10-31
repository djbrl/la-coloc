// The landing page's two small decisions, apart from the page so they can be tested: which mood it shows (by the
// visitor's own clock), and whether someone arriving at "/" sees it at all.
import { ref } from "vue";

// Day, a warm night, or the blue glow of an all-nighter: one picture and one set of chat lines each.
export type Mood = "day" | "warm" | "blue";

/** The mood at a moment, on the visitor's clock: day 07:00-19:00, warm night 19:00-24:00, all-nighter 00:00-07:00. */
export function moodAt(when: Date): Mood {
  const hour = when.getHours();
  if (hour < 7) return "blue";
  return hour < 19 ? "day" : "warm";
}

/**
 * Does "/" open on the landing? Only for someone we know is logged out, who hasn't chosen to walk around as a visitor,
 * and who didn't come through a link to a place in the city (`?in=` or `?city=`), which must keep leading there.
 * While we don't know who you are (the API hasn't said, or the core is down) the city's own screens decide.
 */
export function opensOnLanding(you: { known: boolean; loggedIn: boolean; visiting: boolean; linked: boolean }): boolean {
  return you.known && !you.loggedIn && !you.visiting && !you.linked;
}

const KEY = "coloc.visiting";

function read(): boolean {
  try {
    return sessionStorage.getItem(KEY) === "yes";
  } catch {
    return false;
  }
}

// "Try the demo" was pressed: this tab walks the city as a visitor. Kept for the tab's life, so a reload stays in the
// city; a new visit starts on the landing again.
export const visiting = ref(typeof sessionStorage === "undefined" ? false : read());

/** Walks in as a visitor (or stops, after logging out), and the tab remembers. */
export function setVisiting(on: boolean) {
  visiting.value = on;
  try {
    if (on) sessionStorage.setItem(KEY, "yes");
    else sessionStorage.removeItem(KEY);
  } catch {
    // No storage: the choice lasts until the page reloads.
  }
}
