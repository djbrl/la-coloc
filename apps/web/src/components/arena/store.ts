// The arena of the city you're in, shared by the lobby (which fills the stadium's big screen with it, even before
// anyone opens the panel) and the arena's panel. One fetch of GET /api/cities/:city/arena when the city changes, then
// again each time the city's stream says "arena" (the chat, the entrants, the leaderboard or the challenge changed),
// and when the core comes back after an outage. `tick` counts those words, so the arena's room fetches its chat on
// the same stream instead of opening another.
//
// While the core is down the last view stays (`waiting` says why nothing newer comes); a city without an arena (an
// older API: 404) has none, and the stadium's screen stays dark.
import { reactive } from "vue";
import { onRecovered, wentDown } from "../../core";
import { openStream, type Stream } from "../../stream";
import type { ArenaView } from "../../types";

export const arena = reactive<{
  city: string | null;
  view: ArenaView | null;
  loaded: boolean;
  waiting: boolean;
  failed: boolean;
  tick: number;
}>({ city: null, view: null, loaded: false, waiting: false, failed: false, tick: 0 });

export const arenaUrl = (city: string) => `/api/cities/${encodeURIComponent(city)}/arena`;

let stream: Stream | null = null;
let offBack: (() => void) | null = null;
// Only the newest load may speak: a slow answer for the city you just left is dropped.
let loads = 0;

/** Fetches the arena of the city followed now. `quiet`: a refresh behind a view already showing, which a failure
 *  leaves as it is. */
export async function loadArena(quiet = false): Promise<void> {
  const city = arena.city;
  if (!city) return;
  const mine = ++loads;
  const res = await fetch(arenaUrl(city)).catch(() => null);
  if (mine !== loads || city !== arena.city) return;
  if (!res?.ok) {
    if (await wentDown(res)) arena.waiting = true;
    else if (res?.status === 404) {
      arena.view = null;
      arena.loaded = true;
    } else if (!(quiet && arena.view)) arena.failed = true;
    return;
  }
  const view = (await res.json().catch(() => null)) as ArenaView | null;
  if (mine !== loads || city !== arena.city) return;
  arena.view = view;
  arena.loaded = true;
  arena.waiting = false;
  arena.failed = false;
}

/** A newer view the API just gave back (after joining, sending a pull request): shown at once. */
export function showArena(view: ArenaView) {
  if (view.city !== arena.city) return;
  loads++;
  arena.view = view;
  arena.loaded = true;
  arena.waiting = false;
  arena.failed = false;
}

/** Follows a city's arena, or none (the tutorial's workshop has no stadium). Following the same city again does
 *  nothing (someone logging in or out calls loadArena instead: `joined` and `mine` change). */
export function followArena(city: string | null) {
  if (city === arena.city) return;
  stream?.close();
  stream = null;
  loads++;
  arena.city = city;
  arena.view = null;
  arena.loaded = false;
  arena.waiting = false;
  arena.failed = false;
  if (!city) return;
  void loadArena();
  stream = openStream(`/api/cities/${encodeURIComponent(city)}/stream`, {
    arena: () => {
      arena.tick++;
      refresh();
    },
    // A message in the arena's room: only the room fetches again.
    arenaChat: () => {
      arena.tick++;
    },
  });
  offBack ??= onRecovered(() => void loadArena(!!arena.view));
}

// On the shared site the stream is a question every few seconds, and every answer says "arena": the whole view is
// fetched again at most every 20 s there (the room still follows each tick). A real stream only says it on a change.
const polled = !!import.meta.env.VITE_LOBBY_WS;
let lastRefresh = 0;
function refresh(now = Date.now()) {
  if (polled && now - lastRefresh < 20_000) return;
  lastRefresh = now;
  void loadArena(true);
}

/** Stops following (the lobby went away). */
export function leaveArena() {
  followArena(null);
  offBack?.();
  offBack = null;
}
