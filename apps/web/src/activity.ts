// How present you are, for your friends' lists: online while you use the page, idle after a while with no input,
// away while the tab is hidden. The lobby tells the server over its live line, and only when it changes (link.ts,
// setPresence); the server keeps it in memory (apps/api/src/lobby/presence.ts).
export type Presence = "online" | "idle" | "away";

// No key, click, touch or wheel for this long: idle.
export const IDLE_MS = 5 * 60_000;
// How often the clock looks: idle may be noticed up to this late, which is fine for a friends list.
const CHECK_MS = 30_000;

/** What to say now: away when the tab is hidden, idle after IDLE_MS without input, else online. Pure, so it's tested. */
export function presenceNow(hidden: boolean, lastInputAt: number, now: number): Presence {
  if (hidden) return "away";
  return now - lastInputAt >= IDLE_MS ? "idle" : "online";
}

/** Watches the page and calls `say` whenever the presence changes (never at the start: a new line starts online). */
export function watchPresence(say: (p: Presence) => void): () => void {
  let last = Date.now();
  let current: Presence = "online";
  const check = () => {
    const next = presenceNow(document.visibilityState === "hidden", last, Date.now());
    if (next === current) return;
    current = next;
    say(next);
  };
  // Any input counts. Coming back from idle is said at once; otherwise it's only a timestamp.
  const input = () => {
    last = Date.now();
    if (current === "idle") check();
  };
  // Coming back to the tab counts as input: you're looking at it.
  const visibility = () => {
    if (document.visibilityState === "visible") last = Date.now();
    check();
  };
  const events = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;
  for (const e of events) window.addEventListener(e, input, { passive: true, capture: true });
  document.addEventListener("visibilitychange", visibility);
  const timer = window.setInterval(check, CHECK_MS);
  return () => {
    for (const e of events) window.removeEventListener(e, input, { capture: true });
    document.removeEventListener("visibilitychange", visibility);
    clearInterval(timer);
  };
}
