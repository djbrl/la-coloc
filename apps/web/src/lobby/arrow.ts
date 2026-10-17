// Where the arrow at the screen's edge goes when what you're looking for (the tutorial's beacon, a house you picked)
// is off screen: on the line from the screen's centre towards it, pulled in to `margin` pixels from the edge, and
// turned to point at it. Pure, so the geometry is tested; Lobby.ts draws it.

export interface EdgeArrow {
  // Shown at all: false while the target is on screen.
  shown: boolean;
  // The arrow's centre, in pixels from the screen's top left.
  x: number;
  y: number;
  // Which way it points, in radians, clockwise from "right" (as CSS rotate() turns).
  angle: number;
}

/**
 * Places the arrow for a target at (ndcX, ndcY), the target projected through the camera (-1…1 across the screen,
 * y up, as three.js gives it), on a screen `width` × `height` pixels. Writes into `out` (no new object each frame)
 * and returns it. On screen, at least `margin` pixels inside the edges: `shown` is false.
 */
export function placeArrow(ndcX: number, ndcY: number, width: number, height: number, margin: number, out: EdgeArrow): EdgeArrow {
  // In pixels from the centre, y down like the screen.
  const dx = (ndcX * width) / 2;
  const dy = (-ndcY * height) / 2;
  const halfW = Math.max(1, width / 2 - margin);
  const halfH = Math.max(1, height / 2 - margin);
  const reach = Math.max(Math.abs(dx) / halfW, Math.abs(dy) / halfH);
  out.shown = reach > 1;
  if (!out.shown) return out;
  // Along the same line, scaled back onto the inner rectangle's edge.
  out.x = width / 2 + dx / reach;
  out.y = height / 2 + dy / reach;
  out.angle = Math.atan2(dy, dx);
  return out;
}

/** A box on screen the arrow must not sit under (the minimap, the coach card), in the same pixels as the arrow. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Moves a shown arrow out from under the HUD: if it lands in a box (grown by `gap`), it slides along the screen's
 * edge to the nearest side of that box that is still on screen, `margin` from the edges. It keeps pointing the way
 * it did. Writes into `out` and returns it.
 */
export function clearOf(out: EdgeArrow, boxes: readonly Box[], width: number, height: number, margin: number, gap = 28): EdgeArrow {
  if (!out.shown) return out;
  for (const b of boxes) {
    const l = b.left - gap;
    const t = b.top - gap;
    const r = b.right + gap;
    const bt = b.bottom + gap;
    if (out.x < l || out.x > r || out.y < t || out.y > bt) continue;
    // The ways out, each kept inside the screen's margins; the shortest move wins.
    const ways = [
      { x: out.x, y: t },
      { x: out.x, y: bt },
      { x: l, y: out.y },
      { x: r, y: out.y },
    ].filter((p) => p.x >= margin && p.x <= width - margin && p.y >= margin && p.y <= height - margin);
    if (!ways.length) continue;
    const best = ways.reduce((a, p) => (Math.hypot(p.x - out.x, p.y - out.y) < Math.hypot(a.x - out.x, a.y - out.y) ? p : a));
    out.x = best.x;
    out.y = best.y;
  }
  return out;
}
