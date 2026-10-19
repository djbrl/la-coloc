// Smoke from the roofs: a house whose rooms are busy (their CPU use, added up: `CityHouse.cpu`) puffs smoke, thicker
// the harder they work. Under 2 % of one core, none; from there up to 150 %, more puffs a second, each bigger and a
// little darker. The whole city's smoke is one pool of particles (particles.ts): one draw call. A crash (life.ts)
// adds a dark puff of its own. With calm motion nothing rises: a busy roof wears one still, soft puff instead,
// bigger when it works harder.
import * as THREE from "three";
import { ParticlePool } from "./particles";

// Below `from` % of one core: no smoke. At `full` % and above: the thickest.
export const SMOKE = { from: 2, full: 150 };

export interface SmokeLevel {
  // Puffs a second, each puff's size at birth (world units), and its colour (light grey to grey).
  rate: number;
  size: number;
  color: number;
}

/** How a roof smokes at a given CPU use (percent of one core). Null: it doesn't. */
export function smokeFor(cpu: number): SmokeLevel | null {
  if (!Number.isFinite(cpu) || cpu < SMOKE.from) return null;
  const t = Math.min(1, (cpu - SMOKE.from) / (SMOKE.full - SMOKE.from));
  // From near white to a mid grey, in sRGB: by day, darker smoke is what shows against the sky and the sand.
  const grey = Math.round(232 - t * 92);
  return { rate: 0.8 + t * 4.2, size: 0.45 + t * 0.5, color: (grey << 16) | (grey << 8) | grey };
}

interface Chimney {
  at: THREE.Vector3;
  level: SmokeLevel | null;
  // Puffs owed but not sent yet (a fraction carries over from frame to frame).
  owed: number;
  // The still puff shown with calm motion.
  haze: THREE.Sprite | null;
}

const POOL = 360; // enough for a dozen busy roofs at full smoke

export class RoofSmoke {
  readonly object = new THREE.Group();
  private pool = new ParticlePool(POOL, true);
  private chimneys = new Map<string, Chimney>();
  private calm = false;
  private texture: THREE.Texture;

  constructor(texture: THREE.Texture) {
    this.texture = texture;
    this.object.add(this.pool.points);
  }

  /**
   * Every house's roof and how busy it is, by house id. Houses left out stop smoking. Called whenever the city
   * changes or a house's model loads (its roof moves).
   */
  set(roofs: { id: string; at: THREE.Vector3; cpu: number }[]) {
    const seen = new Set<string>();
    for (const r of roofs) {
      seen.add(r.id);
      const c = this.chimneys.get(r.id) ?? { at: new THREE.Vector3(), level: null, owed: Math.random(), haze: null };
      c.at.copy(r.at);
      c.level = smokeFor(r.cpu);
      this.chimneys.set(r.id, c);
      this.hazeFor(c);
    }
    for (const [id, c] of this.chimneys) if (!seen.has(id)) this.remove(id, c);
  }

  /** Calm motion on or off: rising smoke, or one still puff per busy roof. */
  setCalm(calm: boolean) {
    if (calm === this.calm) return;
    this.calm = calm;
    for (const c of this.chimneys.values()) this.hazeFor(c);
  }

  /** A dark puff over a point (a roof, when a room crashes): a handful of big grey particles, rising fast. */
  burst(at: THREE.Vector3) {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      this.pool.emit({
        x: at.x + Math.cos(a) * 0.25,
        y: at.y,
        z: at.z + Math.sin(a) * 0.25,
        vx: Math.cos(a) * 0.9,
        vy: 1.6 + Math.random() * 0.6,
        vz: Math.sin(a) * 0.9,
        life: 1.6,
        size: 0.8 + Math.random() * 0.3,
        grow: 1.6,
        color: 0x55575e,
        alpha: 0.8,
        gravity: 0,
        drag: 1.4,
      });
    }
  }

  tick(dt: number) {
    if (!this.calm)
      for (const c of this.chimneys.values()) {
        const l = c.level;
        if (!l) continue;
        c.owed += l.rate * dt;
        // A long frame (a tab coming back) mustn't release a cloud at once.
        c.owed = Math.min(c.owed, 3);
        while (c.owed >= 1) {
          c.owed -= 1;
          this.puff(c.at, l);
        }
      }
    this.pool.tick(dt);
  }

  dispose() {
    for (const [id, c] of this.chimneys) this.remove(id, c);
    this.pool.dispose();
  }

  // One puff of a roof's smoke: rising, drifting a little with the wind, growing as it fades.
  private puff(at: THREE.Vector3, l: SmokeLevel) {
    this.pool.emit({
      x: at.x + (Math.random() - 0.5) * 0.2,
      y: at.y,
      z: at.z + (Math.random() - 0.5) * 0.2,
      vx: 0.35 + Math.random() * 0.15,
      vy: 0.9 + Math.random() * 0.3,
      vz: -0.2 + (Math.random() - 0.5) * 0.15,
      life: 2.4 + Math.random() * 0.6,
      size: l.size,
      grow: 1.4,
      color: l.color,
      alpha: 0.9,
      gravity: 0,
      drag: 0.2,
    });
  }

  // With calm motion, a busy roof shows one still puff (a sprite) sized by how busy it is; otherwise none.
  private hazeFor(c: Chimney) {
    const want = this.calm && c.level !== null;
    if (!want) {
      if (c.haze) this.dropHaze(c);
      return;
    }
    if (!c.haze) {
      c.haze = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, transparent: true, depthWrite: false, opacity: 0.55 }));
      c.haze.raycast = () => undefined;
      this.object.add(c.haze);
    }
    c.haze.material.color.setHex(c.level!.color);
    c.haze.position.copy(c.at).setY(c.at.y + 0.6);
    c.haze.scale.setScalar(c.level!.size * 2.6);
  }

  private dropHaze(c: Chimney) {
    if (!c.haze) return;
    this.object.remove(c.haze);
    c.haze.material.dispose();
    c.haze = null;
  }

  private remove(id: string, c: Chimney) {
    this.dropHaze(c);
    this.chimneys.delete(id);
  }
}
