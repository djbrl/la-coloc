// The minimap's drawing, kept out of Minimap.vue so it can be read (and tested) on its own: which colours the
// neighbourhood has from above, how the world fits on the canvas, and how each thing is drawn (the ground, the
// blocks and what stands on their plots, the houses as little house shapes, people as dots, you as an arrow).
// The colours are the 3D city's own, in its day look, because the city is always drawn by day: the same sand, red
// earth or grass under your feet, the same asphalt, the same wall colour on the shops. The page's day and night
// theme only changes the frame around the map, never the map.
import type { CityStyle } from "../../lobby/cityStyle";
import { type Neighbourhood, seeded } from "../../lobby/neighbourhood";

// ---- Colours ----

export interface MapColours {
  horizon: string; // the ground beyond the streets (sand, red earth, dust or grass)
  road: string;
  roadLine: string; // the dashes down the middle of a street
  sidewalk: string;
  lawn: string; // a block's ground between its buildings
  park: string;
  tree: string;
  market: string;
  shop: string; // the filler buildings: the city's wall colour
  tower: string;
  beach: string;
  sea: string;
  // The wax-print parasols on the market square: a handful of bright dots.
  parasols: string[];
}

// The base colours of the 3D grounds (lobby/textures.ts), as they look from above.
const GRASS = "#7aa063";
const SAND = "#e3cc9c";
const LATERITE = "#b45a32";
const DUST = "#d6a77c";
const ASPHALT = "#4b4a55";
const PAVING = "#cdc3b1";
const SLABS = "#cbc5b9";

/** The neighbourhood's colours from above, from its city's style: the grounds the 3D city walks on, by day. */
export function mapColours(style: Pick<CityStyle, "ground" | "grassy" | "palette">): MapColours {
  const green = (other: string) => (style.grassy ? GRASS : other);
  // Per kind of ground: what lies beyond the streets, the sidewalks, and the market's paving (see groundsFor()).
  const grounds = {
    "asphalt-sand": { horizon: green(SAND), sidewalk: SLABS, market: PAVING },
    laterite: { horizon: green(LATERITE), sidewalk: shade(LATERITE, 0.12), market: shade(LATERITE, -0.08) },
    terracotta: { horizon: green(DUST), sidewalk: "#e3c9a8", market: "#d9cdb2" },
    stone: { horizon: green(DUST), sidewalk: "#d4ccbb", market: "#c9c0ad" },
  }[style.ground];
  const walls = style.palette.walls;
  return {
    horizon: grounds.horizon,
    road: ASPHALT,
    roadLine: "#ece6da",
    sidewalk: grounds.sidewalk,
    lawn: grounds.horizon,
    park: "#6c9a57",
    tree: "#3f7a3c",
    market: grounds.market,
    shop: walls,
    tower: shade(walls, -0.28),
    beach: SAND,
    sea: "#2e8b9a",
    parasols: ["#f2c230", "#c2187a", "#1f5fa8", "#e8562a", "#2e8b9a", "#3c8d2f"],
  };
}

/** A "#rrggbb" colour made lighter (amount > 0) or darker (amount < 0), by mixing it with white or black. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const mix = (c: number) => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** A 0xrrggbb number (as the 3D models colour things) as "#rrggbb". */
export const hexOf = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

// ---- World to canvas and back ----

export interface MapFrame {
  scale: number;
  toX: (x: number) => number;
  toY: (z: number) => number;
  fromX: (px: number) => number;
  fromY: (py: number) => number;
}

/**
 * Fits the neighbourhood's bounds into a w × h canvas, north up (-z at the top), with a margin of `margin` pixels on
 * every side, at one scale for both axes, centred. The space left over shows the ground (and the sea) beyond.
 */
export function mapFrame(bounds: Neighbourhood["bounds"], w: number, h: number, margin: number): MapFrame {
  const scale = Math.min((w - 2 * margin) / (bounds.maxX - bounds.minX), (h - 2 * margin) / (bounds.maxZ - bounds.minZ));
  const ox = (w - (bounds.maxX - bounds.minX) * scale) / 2;
  const oy = (h - (bounds.maxZ - bounds.minZ) * scale) / 2;
  return {
    scale,
    toX: (x) => ox + (x - bounds.minX) * scale,
    toY: (z) => oy + (z - bounds.minZ) * scale,
    fromX: (px) => bounds.minX + (px - ox) / scale,
    fromY: (py) => bounds.minZ + (py - oy) / scale,
  };
}

/**
 * Which way you face, on the map: a unit vector in canvas pixels (x right, y down). The avatar faces +z turned by
 * its rotation `ry`, so it walks along (sin ry, cos ry) in the world, and +z is down on a north-up map.
 */
export function heading(ry: number): { dx: number; dy: number } {
  return { dx: Math.sin(ry), dy: Math.cos(ry) };
}

/**
 * A little house seen from the front, as the map draws one: a square body under a pointed roof, `size` pixels
 * across, centred on (cx, cy). The points run round the outline, starting at the bottom left.
 */
export function houseOutline(cx: number, cy: number, size: number): { x: number; y: number }[] {
  const half = size / 2;
  const eaves = cy - size * 0.08; // where the walls stop and the roof starts
  const bottom = cy + half * 0.85;
  return [
    { x: cx - half * 0.8, y: bottom },
    { x: cx - half * 0.8, y: eaves },
    { x: cx - half, y: eaves },
    { x: cx, y: cy - half },
    { x: cx + half, y: eaves },
    { x: cx + half * 0.8, y: eaves },
    { x: cx + half * 0.8, y: bottom },
  ];
}

/** The house under a point on the canvas, if one is within `reach` pixels: for the small map's hover label. */
export function nearest<T extends { x: number; y: number }>(points: T[], px: number, py: number, reach: number): T | null {
  let best: T | null = null;
  let bestDistance = reach;
  for (const p of points) {
    const d = Math.hypot(p.x - px, p.y - py);
    if (d < bestDistance) [best, bestDistance] = [p, d];
  }
  return best;
}

// ---- Drawing ----

const WHITE = "#ffffff";
const INK = "#1d1d1f";
// You: the one bright yellow on the map, with a dark edge so it reads on sand as well as on grass.
const YOU = "#ffd23f";

/** Rounded rectangle path, centred, `w` × `h` pixels. */
function roundRect(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, cy - h / 2, w, h, Math.min(r, w / 2, h / 2));
}

/**
 * The ground, the streets, the blocks and everything on their plots that isn't a house: the coast's beach and sea
 * along the south edge, sidewalks round each block, grass or earth inside, the market's paving with its parasols,
 * the park's trees, the shops in the city's wall colour and the towers a shade darker.
 */
export function drawCity(ctx: CanvasRenderingContext2D, n: Neighbourhood, colours: MapColours, f: MapFrame, w: number, h: number, coast: boolean) {
  const { scale, toX, toY } = f;
  const b = n.bounds;
  ctx.fillStyle = colours.horizon;
  ctx.fillRect(0, 0, w, h);
  // The coast, south of the town, as lobby/props.ts lays it: a beach just past the last street, then the sea.
  if (coast) {
    ctx.fillStyle = colours.beach;
    ctx.fillRect(0, toY(b.maxZ + 0.9), w, h);
    ctx.fillStyle = colours.sea;
    ctx.fillRect(0, toY(b.maxZ + 5), w, h);
    // Two thin lines of surf on the water.
    ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
    ctx.lineWidth = 1;
    for (const off of [7, 11]) {
      ctx.beginPath();
      ctx.moveTo(0, toY(b.maxZ + off));
      ctx.lineTo(w, toY(b.maxZ + off));
      ctx.stroke();
    }
  }
  // The asphalt under the whole town; the blocks sit on it, so what shows between them is the streets.
  ctx.fillStyle = colours.road;
  ctx.fillRect(toX(b.minX), toY(b.minZ), (b.maxX - b.minX) * scale, (b.maxZ - b.minZ) * scale);
  // A dashed line down the middle of each street, once the streets are wide enough to carry one.
  if (scale >= 1.2) {
    ctx.strokeStyle = colours.roadLine;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = Math.max(1, scale * 0.18);
    ctx.setLineDash([scale * 1.4, scale * 1.4]);
    for (const s of n.streets) {
      ctx.beginPath();
      if (s.width < s.depth) {
        ctx.moveTo(toX(s.x), toY(s.z - s.depth / 2));
        ctx.lineTo(toX(s.x), toY(s.z + s.depth / 2));
      } else {
        ctx.moveTo(toX(s.x - s.width / 2), toY(s.z));
        ctx.lineTo(toX(s.x + s.width / 2), toY(s.z));
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  for (const block of n.blocks) {
    const cx = toX(block.x);
    const cy = toY(block.z);
    // The sidewalk round the block, then the block's own ground inside it.
    ctx.fillStyle = colours.sidewalk;
    roundRect(ctx, cx, cy, (block.width + 1.6) * scale, (block.depth + 1.6) * scale, scale * 0.8);
    ctx.fill();
    ctx.fillStyle = block.kind === "market" ? colours.market : block.kind === "park" ? colours.park : colours.lawn;
    roundRect(ctx, cx, cy, (block.width - 0.4) * scale, (block.depth - 0.4) * scale, scale * 0.6);
    ctx.fill();
    const rand = seeded(`minimap:${n.city}:${block.x}:${block.z}`);
    if (block.kind === "market") {
      // The parasols: bright dots scattered over the square, the same every time.
      const count = Math.round((block.width * block.depth) / 22);
      for (let i = 0; i < count; i++) {
        ctx.fillStyle = colours.parasols[i % colours.parasols.length];
        ctx.beginPath();
        ctx.arc(cx + (rand() - 0.5) * (block.width - 3) * scale, cy + (rand() - 0.5) * (block.depth - 3) * scale, Math.max(1.4, scale * 1.1), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (block.kind === "park") {
      for (let i = 0; i < 9; i++) tree(ctx, cx + (rand() - 0.5) * (block.width - 3) * scale, cy + (rand() - 0.5) * (block.depth - 3) * scale, scale * 1.5, colours.tree);
    }
  }

  // What stands on the plots that aren't houses: shops, towers and trees.
  for (const p of n.plots) {
    const cx = toX(p.x);
    const cy = toY(p.z);
    const lot = p.lot;
    if (lot.kind === "shop") {
      // Quiet on purpose, a flat roof in the city's wall colour, so the houses (the ones with people) stand out.
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = colours.shop;
      roundRect(ctx, cx, cy, 5 * scale, 5 * scale, scale * 0.8);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (lot.kind === "tower") {
      ctx.fillStyle = colours.tower;
      roundRect(ctx, cx, cy, 6.2 * scale, 6.2 * scale, scale * 0.6);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
      ctx.lineWidth = 1;
      ctx.stroke();
    } else if (lot.kind === "trees" && lot.count > 0) {
      const rand = seeded(`minimap:${p.key}`);
      for (let i = 0; i < lot.count; i++) tree(ctx, cx + (rand() - 0.5) * 5 * scale, cy + (rand() - 0.5) * 5 * scale, scale * 1.4, colours.tree);
    }
  }
}

/** A tree from above: a dark green disc with a lighter spot where the sun catches it. */
function tree(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, colour: string) {
  const r = Math.max(1.5, radius);
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(colour, 0.25);
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.45, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * A house on the map: the little house shape in its colour, its roof a shade darker, with a white edge so it pops
 * off any ground (and a dark hairline outside that, for the pale grounds). A sample house has a dashed edge.
 */
export function drawHouse(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, colour: string, sample: boolean) {
  const points = houseOutline(x, y, size);
  const path = new Path2D();
  points.forEach((p, i) => (i ? path.lineTo(p.x, p.y) : path.moveTo(p.x, p.y)));
  path.closePath();
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(29, 29, 31, 0.55)";
  ctx.lineWidth = 4;
  ctx.stroke(path);
  ctx.fillStyle = colour;
  ctx.fill(path);
  // The roof: the triangle above the eaves, darker.
  const roof = new Path2D();
  roof.moveTo(points[2].x, points[2].y);
  roof.lineTo(points[3].x, points[3].y);
  roof.lineTo(points[4].x, points[4].y);
  roof.closePath();
  ctx.fillStyle = shade(colour, -0.3);
  ctx.fill(roof);
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 1.6;
  ctx.setLineDash(sample ? [2.4, 2] : []);
  ctx.stroke(path);
  ctx.setLineDash([]);
}

/** Someone out walking: a dot in their house's colour with a white edge. */
export function drawPerson(ctx: CanvasRenderingContext2D, x: number, y: number, across: number, colour: string) {
  ctx.beginPath();
  ctx.arc(x, y, across / 2, 0, Math.PI * 2);
  ctx.fillStyle = colour;
  ctx.fill();
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/**
 * You: a soft cone of light the way you face, then a bright yellow arrow pointing that way, edged in dark ink and
 * white, like the player's marker on a game's map.
 */
export function drawYou(ctx: CanvasRenderingContext2D, x: number, y: number, ry: number, size: number) {
  const { dx, dy } = heading(ry);
  const angle = Math.atan2(dy, dx);
  // The view cone: a wedge of white, fading out.
  const reach = size * 2.2;
  const cone = ctx.createRadialGradient(x, y, 0, x, y, reach);
  cone.addColorStop(0, "rgba(255, 255, 255, 0.75)");
  cone.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = cone;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, reach, angle - 0.55, angle + 0.55);
  ctx.closePath();
  ctx.fill();
  // The arrow: a dart pointing along `angle`, notched at the back.
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const s = size / 2;
  ctx.beginPath();
  ctx.moveTo(s * 1.15, 0);
  ctx.lineTo(-s * 0.8, s * 0.85);
  ctx.lineTo(-s * 0.35, 0);
  ctx.lineTo(-s * 0.8, -s * 0.85);
  ctx.closePath();
  ctx.lineJoin = "round";
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 4.5;
  ctx.stroke();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = YOU;
  ctx.fill();
  ctx.restore();
}

/**
 * The tutorial's goal: a map pin standing on its house, in the site's orange (`fill`), with a white edge and a white
 * dot. `head` is the radius of its round top, `tall` how far its top stands above its tip.
 */
export function drawPin(ctx: CanvasRenderingContext2D, x: number, tip: number, head: number, tall: number, fill: string) {
  const centre = tip - tall + head;
  // The head's round top, then two straight sides down to the tip, where they meet the circle's tangents.
  const spread = Math.acos(head / (tall - head));
  ctx.beginPath();
  ctx.moveTo(x, tip);
  ctx.arc(x, centre, head, Math.PI / 2 + spread, Math.PI / 2 - spread);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineJoin = "round";
  ctx.lineWidth = 2;
  ctx.strokeStyle = WHITE;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, centre, head * 0.38, 0, Math.PI * 2);
  ctx.fillStyle = WHITE;
  ctx.fill();
}

/** A house's name on the big map, beside its marker: dark ink with a white halo, so it reads on any ground. */
export function drawName(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, gap: number, w: number, font: string) {
  ctx.font = `700 12px ${font}`;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = WHITE;
  ctx.fillStyle = INK;
  const width = ctx.measureText(name).width;
  // To the right of the marker, unless that runs off the edge; then to the left.
  const right = x + gap + width <= w - 4;
  ctx.textAlign = right ? "left" : "right";
  const at = x + (right ? gap : -gap);
  ctx.strokeText(name, at, y);
  ctx.fillText(name, at, y);
}
