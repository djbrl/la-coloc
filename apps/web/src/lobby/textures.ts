// Ground textures, drawn in code: grass, asphalt, paving stones, and each city's own ground (sand, laterite,
// terracotta tiles, zellige, pale stone), plus wax-print cloth for the market. Nothing to download, nothing to license.
import * as THREE from "three";
import { seeded } from "./neighbourhood";

function canvas(size: number, draw: (g: CanvasRenderingContext2D, rand: () => number) => void, repeat: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d")!, seeded(`texture:${size}:${repeat}`));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Specks of lighter and darker colour over a base: grass, asphalt.
function specks(g: CanvasRenderingContext2D, rand: () => number, size: number, base: string, colors: string[], count: number, max: number) {
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < count; i++) {
    g.fillStyle = colors[Math.floor(rand() * colors.length)];
    g.globalAlpha = 0.25 + rand() * 0.45;
    const r = 0.5 + rand() * max;
    g.fillRect(rand() * size, rand() * size, r, r);
  }
  g.globalAlpha = 1;
}

let cache: ReturnType<typeof make> | null = null;

function make() {
  const grass = canvas(256, (g, r) => specks(g, r, 256, "#7aa063", ["#6b9156", "#88ae6e", "#93b877", "#5f8550"], 2600, 3), 1);
  const park = canvas(256, (g, r) => specks(g, r, 256, "#6c9a57", ["#5e8a4b", "#7cab64", "#88b56c"], 2600, 3), 1);
  const asphalt = canvas(256, (g, r) => specks(g, r, 256, "#4b4a55", ["#55545f", "#43424c", "#5c5b66", "#3e3d47"], 3200, 2), 1);
  // Square paving stones with soft joints: the market and shop forecourts.
  const paving = canvas(
    256,
    (g, r) => {
      g.fillStyle = "#c9bfae";
      g.fillRect(0, 0, 256, 256);
      const n = 8;
      const s = 256 / n;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          const tone = 196 + Math.floor(r() * 26);
          g.fillStyle = `rgb(${tone}, ${tone - 8}, ${tone - 22})`;
          g.fillRect(i * s + 1.5, j * s + 1.5, s - 3, s - 3);
        }
    },
    1,
  );
  // The sidewalk: long slabs.
  const sidewalk = canvas(
    128,
    (g, r) => {
      g.fillStyle = "#b9b3a8";
      g.fillRect(0, 0, 128, 128);
      for (let j = 0; j < 4; j++) {
        const tone = 200 + Math.floor(r() * 16);
        g.fillStyle = `rgb(${tone}, ${tone - 4}, ${tone - 12})`;
        g.fillRect(1, j * 32 + 1, 126, 30);
      }
    },
    1,
  );
  const sand = canvas(256, (g, r) => specks(g, r, 256, "#e3cc9c", ["#d6bd88", "#eedbb0", "#c9ad78", "#f3e4c2"], 3000, 2.5), 3);
  // Red earth, with a few darker pebbles.
  const laterite = canvas(256, (g, r) => specks(g, r, 256, "#b45a32", ["#a34d29", "#c46a3d", "#8f4122", "#cf7b4b"], 3400, 3), 4);
  // Ochre dust: Marrakech's verges.
  const dust = canvas(256, (g, r) => specks(g, r, 256, "#d6a77c", ["#c99a6e", "#e2b98f", "#bf8c62"], 2800, 2.5), 5);
  // Terracotta tiles, long and narrow, with pale joints.
  const terracotta = canvas(
    256,
    (g, r) => {
      g.fillStyle = "#e3c9a8";
      g.fillRect(0, 0, 256, 256);
      for (let j = 0; j < 8; j++)
        for (let i = 0; i < 4; i++) {
          const tone = r() * 22;
          g.fillStyle = `rgb(${184 + tone}, ${96 + tone * 0.6}, ${66 + tone * 0.4})`;
          const off = j % 2 ? 32 : 0;
          g.fillRect(((i * 64 + off) % 256) + 1.5, j * 32 + 1.5, 61, 29);
          if (off) g.fillRect(-32 + 1.5, j * 32 + 1.5, 61, 29);
        }
    },
    6,
  );
  // Zellige: glazed cream tiles with a small star of green or blue on every other one, and a border of colour.
  const zellige = canvas(
    256,
    (g, r) => {
      g.fillStyle = "#d9cdb2";
      g.fillRect(0, 0, 256, 256);
      const s = 32;
      for (let i = 0; i < 8; i++)
        for (let j = 0; j < 8; j++) {
          const tone = 236 + Math.floor(r() * 12);
          g.fillStyle = `rgb(${tone}, ${tone - 8}, ${tone - 24})`;
          g.fillRect(i * s + 1, j * s + 1, s - 2, s - 2);
          if ((i + j) % 2) continue;
          // An eight-pointed star: two squares, one turned by 45°.
          g.fillStyle = (i + j * 3) % 4 === 0 ? "#3d6db5" : "#2f8f7c";
          const cx = i * s + s / 2;
          const cy = j * s + s / 2;
          g.fillRect(cx - 7, cy - 7, 14, 14);
          g.beginPath();
          g.moveTo(cx, cy - 10);
          g.lineTo(cx + 10, cy);
          g.lineTo(cx, cy + 10);
          g.lineTo(cx - 10, cy);
          g.fill();
        }
    },
    7,
  );
  // Pale stone flags of uneven sizes: Tunis, Kigali's clean sidewalks.
  const stone = canvas(
    256,
    (g, r) => {
      g.fillStyle = "#c9c0ad";
      g.fillRect(0, 0, 256, 256);
      for (let j = 0; j < 6; j++) {
        let x = (j % 2) * -20;
        while (x < 256) {
          const w = 30 + r() * 40;
          const tone = 212 + Math.floor(r() * 22);
          g.fillStyle = `rgb(${tone}, ${tone - 5}, ${tone - 16})`;
          g.fillRect(x + 1.5, j * (256 / 6) + 1.5, w - 3, 256 / 6 - 3);
          x += w;
        }
      }
    },
    8,
  );
  return { grass, park, asphalt, paving, sidewalk, sand, laterite, dust, terracotta, zellige, stone };
}

export type GroundKind = "asphalt-sand" | "laterite" | "terracotta" | "stone";

/**
 * The textures a city walks on, from its style (cityStyle.ts): the ground to the horizon, the lawns and park, the
 * road, the sidewalks, and the market square. `grassy` cities keep green lawns.
 */
export function groundsFor(kind: GroundKind, grassy: boolean) {
  const t = textures();
  const green = (other: THREE.Texture) => (grassy ? t.grass : other);
  switch (kind) {
    case "asphalt-sand":
      return { horizon: green(t.sand), lawn: green(t.sand), park: t.park, road: t.asphalt, sidewalk: t.sidewalk, market: t.paving };
    case "laterite":
      return { horizon: green(t.laterite), lawn: green(t.laterite), park: t.park, road: t.asphalt, sidewalk: t.laterite, market: t.laterite };
    case "terracotta":
      return { horizon: green(t.dust), lawn: green(t.dust), park: t.park, road: t.asphalt, sidewalk: t.terracotta, market: t.zellige };
    case "stone":
      return { horizon: green(t.dust), lawn: green(t.dust), park: t.park, road: t.asphalt, sidewalk: t.stone, market: t.stone };
  }
}

/**
 * Wax-print cloth (the market's parasols): bold concentric circles, leaves and dots in two or three colours on a
 * ground colour, different for every seed. Drawn on a canvas, like the grounds.
 */
export function waxPrint(seed: string): THREE.CanvasTexture {
  const palettes = [
    ["#f2c230", "#c2187a", "#1f5fa8", "#1d1c22"],
    ["#e8562a", "#2e8b9a", "#f4e3c1", "#3b2a1e"],
    ["#3c8d2f", "#f28c28", "#f4f1e8", "#7a1f3d"],
    ["#1f5fa8", "#f2c230", "#e2463b", "#f4f1e8"],
  ];
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const rand = seeded(`wax:${seed}`);
  const [ground, a, b, ink] = palettes[Math.floor(rand() * palettes.length)];
  g.fillStyle = ground;
  g.fillRect(0, 0, 128, 128);
  // A grid of motifs, every other one a target of rings, the others a leaf; dots in between.
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      const x = i * 32 + 16 + (j % 2) * 8;
      const y = j * 32 + 16;
      if ((i + j) % 2 === 0) {
        for (const [r, color] of [
          [13, ink],
          [10, a],
          [6, b],
          [3, ink],
        ] as const) {
          g.fillStyle = color;
          g.beginPath();
          g.arc(x, y, r, 0, Math.PI * 2);
          g.fill();
        }
      } else {
        g.fillStyle = b;
        g.beginPath();
        g.ellipse(x, y, 12, 5, rand() * Math.PI, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = ink;
        g.lineWidth = 1.5;
        g.stroke();
      }
      g.fillStyle = ink;
      g.fillRect(x + 14, y + 14, 3, 3);
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** The shared textures (made once). Repeat is set per use, on a clone. */
export function textures() {
  return (cache ??= make());
}

/** A material for a ground surface `w × d` units, tiling its texture every `tile` units. */
export function groundMaterial(texture: THREE.Texture, w: number, d: number, tile: number): THREE.MeshStandardMaterial {
  const t = texture.clone();
  t.needsUpdate = true;
  t.repeat.set(w / tile, d / tile);
  return new THREE.MeshStandardMaterial({ map: t, roughness: 1 });
}
