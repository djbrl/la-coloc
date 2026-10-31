// Name tags that would pile up (people bunched at a door): which ones stay as they are, which fade back without their
// house chip, and, on a narrow screen, which show at all. Pure and allocation-free, so Lobby.ts can run it every few
// frames over the same objects; the geometry is tested here.

import type { Tag } from "./tagLayer";

export interface TagSpot {
  // The tag's centre on screen, and its width, in pixels (its height is TAG_HEIGHT).
  x: number;
  y: number;
  w: number;
  // How far its person stands from you: the nearest wins a pile-up. Yours is -1.
  d: number;
  // Always shown and never faded: your own tag, and whoever you highlighted.
  keep: boolean;
  // The answers: shown at all, and faded back (no house chip) because a nearer tag overlaps it.
  shown: boolean;
  crowded: boolean;
  // The tag it stands for: Lobby.ts's business.
  tag: Tag | null;
}

export const TAG_HEIGHT = 18;

const before = (a: TagSpot, b: TagSpot) => (a.keep === b.keep ? a.d < b.d : a.keep);

/**
 * Works out the first `count` spots of `spots`, a pool reused from call to call: they're sorted in place, nearest
 * first with the kept ones ahead (an insertion sort: a few dozen tags, and no new array). A tag overlapping a nearer
 * one that stays clear is crowded. Only the kept tags and the `most` nearest other people's show (on a narrow screen,
 * Lobby.ts asks for one).
 */
export function declutter(spots: TagSpot[], count: number, most: number): void {
  for (let i = 1; i < count; i++) {
    const s = spots[i];
    let j = i - 1;
    while (j >= 0 && before(s, spots[j])) {
      spots[j + 1] = spots[j];
      j--;
    }
    spots[j + 1] = s;
  }
  let others = 0;
  for (let i = 0; i < count; i++) {
    const s = spots[i];
    s.shown = s.keep || others++ < most;
    s.crowded = false;
    if (!s.shown || s.keep) continue;
    for (let j = 0; j < i; j++) {
      const t = spots[j];
      if (!t.shown || t.crowded) continue;
      if (Math.abs(s.x - t.x) < (s.w + t.w) / 2 && Math.abs(s.y - t.y) < TAG_HEIGHT) {
        s.crowded = true;
        break;
      }
    }
  }
}
