// Ground textures, drawn in code: grass, asphalt, paving stones. Nothing to download, nothing to license.
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
  return { grass, park, asphalt, paving, sidewalk };
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
