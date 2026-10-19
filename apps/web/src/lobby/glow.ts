// Soft glows: what the city's happenings (life.ts) show instead of motion when motion is calm. A round, soft dot
// sprite that swells for a moment and fades away. The dot texture is drawn once and shared with the roofs' smoke.
import * as THREE from "three";

let dot: THREE.CanvasTexture | null = null;

/** A round, soft white dot on a transparent ground, drawn once on a canvas. */
export function softDot(): THREE.CanvasTexture {
  if (dot) return dot;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.45, "rgba(255,255,255,0.75)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  dot = new THREE.CanvasTexture(c);
  dot.colorSpace = THREE.SRGBColorSpace;
  return dot;
}

// Seconds a glow swells, then fades.
const SWELL = 0.6;
const FADE = 1.6;

export class Glows {
  readonly object = new THREE.Group();
  private glows: { sprite: THREE.Sprite; age: number; peak: number }[] = [];

  /** A glow of `color`, `size` units across, at a point. `peak` is its opacity at its brightest. */
  glow(at: THREE.Vector3, color: number, size: number, peak = 0.65) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color, transparent: true, opacity: 0, depthWrite: false }));
    sprite.position.copy(at);
    sprite.scale.setScalar(size);
    sprite.raycast = () => undefined;
    this.object.add(sprite);
    this.glows.push({ sprite, age: 0, peak });
  }

  tick(dt: number) {
    for (const g of [...this.glows]) {
      g.age += dt;
      const m = g.sprite.material;
      m.opacity = g.age < SWELL ? (g.age / SWELL) * g.peak : Math.max(0, g.peak * (1 - (g.age - SWELL) / FADE));
      if (g.age < SWELL + FADE) continue;
      this.object.remove(g.sprite);
      m.dispose();
      this.glows.splice(this.glows.indexOf(g), 1);
    }
  }

  dispose() {
    for (const g of this.glows) g.sprite.material.dispose();
    this.glows = [];
    this.object.clear();
  }
}
