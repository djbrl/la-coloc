// One-time tips: the controls the tutorial no longer drills (dash, turning the view, the big map, the key list),
// each said once, the first time it would help, in a small line over the city. Using a control before its tip
// comes counts as knowing it: that tip never shows. Pure, like tutorial.ts: LobbyView says what happened and
// remembers which tips were seen (in this browser).

export type Tip = "walk" | "dash" | "turn" | "map" | "pick" | "keys";

// What can set a tip off:
// - "arrived": the city just appeared without the tutorial (a visitor, or someone who skipped it): how to walk.
// - "walking": you've been walking for a few seconds on end: the dash.
// - "idle": a quiet moment (nothing open, a while since the last tip): the next of the others, in order.
export type TipCue = "arrived" | "walking" | "idle";

// What each tip says, on a keyboard and on a touch screen (null: nothing to say there). Words in braces are keys,
// drawn as key caps.
export const TIP_TEXT: Record<Tip, { keys: string; touch: string | null }> = {
  walk: { keys: "Click the ground, or use {W} {A} {S} {D}, to walk. {E} goes in at a door.", touch: "Tap the ground to walk there. At a door, tap Go in." },
  dash: { keys: "Tap {Shift} to dash.", touch: "The round arrow button dashes." },
  turn: { keys: "{Q} and {R} turn the view.", touch: "The two round arrows, top right, turn the view." },
  map: { keys: "{M} opens the big map. Click it to jump anywhere.", touch: "Tap the map to jump somewhere." },
  pick: { keys: "{[} and {]} step through what's around you.", touch: null },
  keys: { keys: "{?} lists every key.", touch: null },
};

// The quiet-moment tips, in the order they come.
const IDLE: Tip[] = ["turn", "map", "pick", "keys"];

/** The tip a cue brings, or null: none fits, it was seen already, or there's nothing to say on this screen. */
export function nextTip(cue: TipCue, seen: readonly Tip[], touch: boolean): Tip | null {
  const fits = (t: Tip) => !seen.includes(t) && (!touch || TIP_TEXT[t].touch !== null);
  if (cue === "arrived") return fits("walk") ? "walk" : null;
  if (cue === "walking") return fits("dash") ? "dash" : null;
  return IDLE.find(fits) ?? null;
}

/** A tip's words cut into plain text and key caps: "Tap {Shift} to dash." → text, key, text. */
export function tipParts(text: string): { key: boolean; text: string }[] {
  return text
    .split(/(\{[^}]+\})/)
    .filter(Boolean)
    .map((part) => (part.startsWith("{") ? { key: true, text: part.slice(1, -1) } : { key: false, text: part }));
}
