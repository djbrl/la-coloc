// The city's small moments, as plain functions the lobby (LobbyView.vue) calls: which happenings and messages are
// new since the last word, so only what happens while the page is open is played (an envelope, a red window, a speech
// bubble), never what was already there when it loaded. No DOM and no engine here, so it's tested.
import type { CityHappening, CityHouse, Message } from "../../types";

// At most this many new things a tick, per house or per conversation: a tab that comes back after a while (its
// polls paused) gets the latest few, not a flurry of everything it missed.
export const AT_ONCE = 3;

/**
 * Remembers what it was shown, by id, and says what's new each time it's called again. The first call only
 * remembers: nothing that was there on arrival counts as new. It forgets ids that leave the list (the API keeps
 * ten minutes of happenings and the last hundred messages), so it never grows. `reset` starts over, as on arrival
 * (another city, another house).
 */
export function newSince<T extends { id: string }>() {
  let seen: Set<string> | null = null;
  return {
    next(items: T[]): T[] {
      const fresh = seen ? items.filter((i) => !seen!.has(i.id)) : [];
      seen = new Set(items.map((i) => i.id));
      return fresh;
    },
    reset() {
      seen = null;
    },
  };
}

/** One happening to play, at its house. */
export interface Play {
  houseId: string;
  happening: CityHappening;
}

/**
 * The city's new happenings since the last word, oldest first, for the houses `here` says are on screen. Houses
 * elsewhere are remembered too, so travelling there later never replays them. `recent` comes newest first from the
 * API; an older API leaves it out.
 */
export function cityHappenings() {
  const seen = newSince<{ id: string; play: Play }>();
  return (houses: Pick<CityHouse, "id" | "recent">[], here: (houseId: string) => boolean): Play[] => {
    const all = houses.flatMap((h) => (h.recent ?? []).map((happening) => ({ id: `${h.id}/${happening.id}`, play: { houseId: h.id, happening } })));
    const fresh = seen.next(all).filter((x) => here(x.play.houseId));
    // Newest first per house, the few latest kept, then played oldest first.
    const kept: Play[] = [];
    const count = new Map<string, number>();
    for (const { play } of fresh) {
      const n = count.get(play.houseId) ?? 0;
      if (n >= AT_ONCE) continue;
      count.set(play.houseId, n + 1);
      kept.push(play);
    }
    return kept.reverse();
  };
}

/** A line someone said, for a speech bubble over them. */
export interface Line {
  login: string;
  text: string;
}

/**
 * New messages in one conversation (the city's room, your house's channel), oldest first, as speech bubbles: the
 * house's own lines ("Fatou knocked") have no author and say nothing. Messages come oldest first from the API.
 */
export function chatter() {
  const seen = newSince<Message>();
  return {
    next(messages: Message[]): Line[] {
      const lines = seen.next(messages).flatMap((m) => (m.author && m.body.trim() ? [{ login: m.author.login, text: m.body }] : []));
      return lines.slice(-AT_ONCE);
    },
    reset: seen.reset,
  };
}

/**
 * Fireworks once per moment: a room going live is seen twice (its window lights up in the city's list, and a "live"
 * happening arrives), and the second within a few seconds of the first stays quiet. `cheer(id, now)` says whether to
 * celebrate now, and remembers it if so.
 */
export function onceEach(ms = 10_000) {
  const last = new Map<string, number>();
  return (id: string, now: number): boolean => {
    const before = last.get(id);
    if (before !== undefined && now - before < ms) return false;
    last.set(id, now);
    return true;
  };
}
