// A small brake on posting, kept in the API's memory: each person may do a thing at most `count` times in any
// window of `perMs`. A sliding window: we keep the times of their recent posts and forget the ones that are too old.
// Restarting the API forgets everything, which is fine for a brake (it isn't a quota). One API process only: with
// several, each would count on its own.
import { HttpException, HttpStatus } from "@nestjs/common";

export class Limiter {
  private recent = new Map<string, number[]>();

  constructor(
    readonly count: number,
    readonly perMs: number,
  ) {}

  /** Counts one more for `key` and says yes, or says no (and counts nothing) when they've had their share. */
  take(key: string, now = Date.now()): boolean {
    const times = (this.recent.get(key) ?? []).filter((t) => now - t < this.perMs);
    if (times.length >= this.count) {
      this.recent.set(key, times);
      return false;
    }
    times.push(now);
    this.recent.set(key, times);
    // Keep the map small: forget people with nothing left in their window, now and then.
    if (this.recent.size > 5000) for (const [k, ts] of this.recent) if (!ts.some((t) => now - t < this.perMs)) this.recent.delete(k);
    return true;
  }
}

// Messages (a DM, the city chat, a reply under a post): a few in a row, then a pause.
export const MESSAGES = { count: 5, perMs: 10_000 };
// Board posts: a handful an hour.
export const POSTS = { count: 5, perMs: 3_600_000 };

/** The 429 a refused post gets, in a sentence that says what to do. */
export function slowDown(what: "messages" | "posts"): HttpException {
  return new HttpException(
    what === "messages" ? "Slow down a little: wait a few seconds before writing again." : "That's a lot of posts for one hour. Try again later.",
    HttpStatus.TOO_MANY_REQUESTS,
  );
}
