// Recolours the Kenney buildings for a city (R20). Every Kenney model paints itself from one small atlas of flat
// colour swatches (a "colormap" texture), not from named materials, so a wall can't be found by name. Instead the
// atlas itself is redrawn for each city: its lavender-grey wall swatches take the city's wall colour, its green
// roof swatches the city's roof colour, its violet and pink accents the city's trim. Each swatch keeps its own
// shading (the gradient from light to dark), only its hue changes. The models get copies of their materials using
// the city's atlas; the shared originals are never touched.
import * as THREE from "three";
import type { CityStyle } from "./cityStyle";

// The city's atlas, per original atlas and city: made once.
const atlases = new Map<string, THREE.Texture>();
// The city's copy of each original material.
const copies = new Map<string, THREE.Material>();

type Hsl = { h: number; s: number; l: number };

/** Which kind of swatch a colour is: a wall, a roof, a trim, or something to leave alone (glass, wood, metal). */
function role({ h, s, l }: Hsl): "walls" | "roofs" | "trim" | null {
  const deg = h * 360;
  // Kenney's suburban roofs are green.
  if (deg >= 95 && deg <= 175 && s > 0.25) return "roofs";
  // Its walls are white to pale grey (lit by the sky, they read lavender).
  if (s < 0.25 && l >= 0.78) return "walls";
  // Its towers' bands and some walls are violet or pink: walls too, a shade darker (see `middle`).
  if (deg >= 255 && deg <= 330 && s > 0.3) return "walls";
  // Window frames, shutters and cornices are lavender greys: the city's trim (Dakar's shutter blue…).
  if (deg >= 200 && deg <= 260 && s < 0.35 && l > 0.45) return "trim";
  return null;
}

function redraw(source: CanvasImageSource & { width: number; height: number }, style: CityStyle): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = source.width;
  c.height = source.height;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(source, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  const target = {
    walls: new THREE.Color(style.palette.walls).getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace),
    roofs: new THREE.Color(style.palette.roofs).getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace),
    trim: new THREE.Color(style.palette.trim).getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace),
  };
  // The middle lightness of each kind of swatch in the original atlas: a pixel lighter than that stays lighter.
  const middle = { walls: 0.88, roofs: 0.5, trim: 0.6 };
  const color = new THREE.Color();
  const hsl: Hsl = { h: 0, s: 0, l: 0 };
  const rgb = { r: 0, g: 0, b: 0 };
  // The atlas is mostly flat swatches and soft gradients: each distinct colour is worked out once.
  const done = new Map<number, number>();
  for (let i = 0; i < px.length; i += 4) {
    const key = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2];
    let out = done.get(key);
    if (out === undefined) {
      // The canvas holds sRGB bytes: read and write them as sRGB.
      color.setRGB(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255, THREE.SRGBColorSpace);
      color.getHSL(hsl, THREE.SRGBColorSpace);
      const r = role(hsl);
      out = key;
      if (r) {
        const t = target[r];
        const l = Math.min(0.95, Math.max(0.05, t.l + (hsl.l - middle[r]) * 0.8));
        // Trim is a lot of surface on Kenney's models: a softer version of the colour keeps it from shouting.
        color.setHSL(t.h, r === "trim" ? t.s * 0.7 : t.s, l, THREE.SRGBColorSpace).getRGB(rgb, THREE.SRGBColorSpace);
        out = (Math.round(rgb.r * 255) << 16) | (Math.round(rgb.g * 255) << 8) | Math.round(rgb.b * 255);
      }
      done.set(key, out);
    }
    px[i] = (out >> 16) & 255;
    px[i + 1] = (out >> 8) & 255;
    px[i + 2] = out & 255;
  }
  g.putImageData(data, 0, 0);
  return c;
}

function atlasFor(map: THREE.Texture, style: CityStyle): THREE.Texture | null {
  const image = map.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!image?.width) return null;
  const key = `${map.uuid}:${style.city}`;
  let t = atlases.get(key);
  if (!t) {
    // A copy of the original texture (same wrapping, flip and colour space), with the redrawn image.
    t = map.clone();
    t.image = redraw(image, style);
    t.needsUpdate = true;
    atlases.set(key, t);
  }
  return t;
}

/** Repaints a loaded building in a city's colours. Only buildings: trees, people and props keep theirs. */
export function dye(model: THREE.Object3D, style: CityStyle) {
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const swap = (m: THREE.Material): THREE.Material => {
      const map = (m as THREE.MeshStandardMaterial).map;
      if (!map) return m;
      const key = `${m.uuid}:${style.city}`;
      let copy = copies.get(key);
      if (!copy) {
        const atlas = atlasFor(map, style);
        if (!atlas) return m;
        copy = m.clone();
        (copy as THREE.MeshStandardMaterial).map = atlas;
        copies.set(key, copy);
      }
      return copy;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
  });
}
