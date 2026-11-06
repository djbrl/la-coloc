// Where a spotlight's hole and its line go (Spotlight.vue, and the ring of the city's cards in TourCard.vue). Plain boxes in
// the viewport's pixels, so the tests can check the placing without a page.

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}
export interface Size {
  width: number;
  height: number;
}

// The hole is a little bigger than the control, so its yellow edge doesn't sit on the control's own.
export const RING_GAP = 6;

/** The hole around a control: its box, `gap` bigger on every side, in whole pixels. */
export function ringAround(r: Box, gap = RING_GAP): Box {
  return { left: Math.round(r.left - gap), top: Math.round(r.top - gap), width: Math.round(r.width + gap * 2), height: Math.round(r.height + gap * 2) };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, Math.max(lo, hi)));

/** Which side of the control the line tries first. A tab's line goes above it, so the tab's content stays in view. */
export type Side = "below" | "above";

/**
 * Where the line goes, next to the hole: under it when it fits (or above it first, for `prefer` "above"), else on the
 * other of the two, else on its left or its right, and as a last resort along the bottom of the screen. Always kept
 * `margin` inside the screen, and `gap` away from the hole.
 */
export function placeLine(hole: Box, size: Size, view: Size, prefer: Side = "below", margin = 16, gap = 12): { left: number; top: number } {
  const across = clamp(hole.left + hole.width / 2 - size.width / 2, margin, view.width - margin - size.width);
  const down = clamp(hole.top + hole.height / 2 - size.height / 2, margin, view.height - margin - size.height);
  const below = hole.top + hole.height + gap;
  const above = hole.top - gap - size.height;
  const fitsBelow = below + size.height <= view.height - margin;
  const fitsAbove = above >= margin;
  if (prefer === "above" && fitsAbove) return { left: Math.round(across), top: Math.round(above) };
  if (fitsBelow) return { left: Math.round(across), top: Math.round(below) };
  if (fitsAbove) return { left: Math.round(across), top: Math.round(above) };
  const left = hole.left - gap - size.width;
  if (left >= margin) return { left: Math.round(left), top: Math.round(down) };
  const right = hole.left + hole.width + gap;
  if (right + size.width <= view.width - margin) return { left: Math.round(right), top: Math.round(down) };
  return { left: Math.round(across), top: Math.round(view.height - margin - size.height) };
}

/** Two boxes (or places) are the same, to the pixel: nothing to redraw. */
export function same<T extends object>(a: T | null, b: T | null): boolean {
  if (!a || !b) return a === b;
  return (Object.keys(a) as (keyof T)[]).every((k) => a[k] === b[k]);
}
