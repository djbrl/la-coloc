// Fireworks over a house when one of its projects goes online (R8). Cheap: a single pool of points (one draw call,
// one buffer reused for every burst), each spark flying out, falling and fading. With calm motion there are no
// sparks: the house gets a soft glow that swells and fades instead.
import * as THREE from "three";

const SPARKS = 480; // the pool: enough for three bursts at once
const PER_BURST = 80;
const LIFE = 1.6; // seconds a spark lives
const GRAVITY = 3.2;
const COLORS = [0xffd166, 0xff6b6b, 0x6fd3ff, 0x9bff8a, 0xffffff, 0xf28c28];

// A round, soft dot, drawn once: points are squares without it.
function dot(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.4, "rgba(255,255,255,0.8)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export class Fireworks {
  readonly object = new THREE.Group();
  private points: THREE.Points;
  private positions = new Float32Array(SPARKS * 3);
  private colors = new Float32Array(SPARKS * 3);
  private velocity = new Float32Array(SPARKS * 3);
  private age = new Float32Array(SPARKS).fill(LIFE);
  private base = new Float32Array(SPARKS * 3);
  private next = 0;
  private live = 0;
  // Bursts waiting to go off: where, and when (seconds from now, counted down).
  private queue: { at: THREE.Vector3; wait: number }[] = [];
  private glows: { sprite: THREE.Sprite; age: number }[] = [];
  private texture = dot();

  constructor() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("color", new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    const material = new THREE.PointsMaterial({ size: 11, sizeAttenuation: false, vertexColors: true, map: this.texture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.points = new THREE.Points(g, material);
    this.points.frustumCulled = false;
    this.points.visible = false;
    // Sparks are light in the air, not something to click.
    this.points.raycast = () => undefined;
    this.object.add(this.points);
  }

  /** Fireworks over a point (a house's roof): three bursts, a beat apart. Calm motion: a glow instead. */
  celebrate(at: THREE.Vector3, calm: boolean) {
    if (calm) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, color: 0xffd98a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      sprite.position.copy(at);
      sprite.scale.setScalar(7);
      sprite.raycast = () => undefined;
      this.object.add(sprite);
      this.glows.push({ sprite, age: 0 });
      return;
    }
    for (let i = 0; i < 3; i++) {
      const spot = at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.5, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 2.5));
      this.queue.push({ at: spot, wait: i * 0.35 });
    }
  }

  tick(dt: number) {
    for (const q of [...this.queue]) {
      q.wait -= dt;
      if (q.wait > 0) continue;
      this.burst(q.at);
      this.queue.splice(this.queue.indexOf(q), 1);
    }
    if (this.live > 0) this.move(dt);
    // A glow swells for a second, then fades over the next two.
    for (const g of [...this.glows]) {
      g.age += dt;
      const m = g.sprite.material;
      m.opacity = g.age < 1 ? g.age * 0.7 : Math.max(0, 0.7 * (1 - (g.age - 1) / 2));
      if (g.age < 3) continue;
      this.object.remove(g.sprite);
      m.dispose();
      this.glows.splice(this.glows.indexOf(g), 1);
    }
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    this.texture.dispose();
    for (const g of this.glows) g.sprite.material.dispose();
  }

  private burst(at: THREE.Vector3) {
    const color = new THREE.Color(COLORS[Math.floor(Math.random() * COLORS.length)]);
    const second = new THREE.Color(COLORS[Math.floor(Math.random() * COLORS.length)]);
    for (let k = 0; k < PER_BURST; k++) {
      // The oldest spark in the pool is reused.
      const i = this.next;
      this.next = (this.next + 1) % SPARKS;
      if (this.age[i] >= LIFE) this.live++;
      this.age[i] = 0;
      this.positions.set([at.x, at.y, at.z], i * 3);
      // Out in every direction, on a sphere, at a little more or less than the same speed: a round burst.
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const speed = 4.2 + Math.random() * 0.8;
      this.velocity.set([r * Math.cos(a) * speed, u * speed + 1, r * Math.sin(a) * speed], i * 3);
      const c = k % 3 === 0 ? second : color;
      this.base.set([c.r, c.g, c.b], i * 3);
    }
    this.points.visible = true;
  }

  private move(dt: number) {
    let live = 0;
    for (let i = 0; i < SPARKS; i++) {
      if (this.age[i] >= LIFE) continue;
      this.age[i] += dt;
      if (this.age[i] >= LIFE) {
        // Dead: parked far below the ground, black.
        this.positions[i * 3 + 1] = -1000;
        this.colors.fill(0, i * 3, i * 3 + 3);
        continue;
      }
      live++;
      const j = i * 3;
      this.velocity[j + 1] -= GRAVITY * dt;
      // Air slows the sparks down.
      const drag = Math.exp(-1.8 * dt);
      for (let k = 0; k < 3; k++) {
        this.velocity[j + k] *= drag;
        this.positions[j + k] += this.velocity[j + k] * dt;
      }
      // Bright, then fading out (additive: darker is more see-through), with a little twinkle at the end.
      const t = this.age[i] / LIFE;
      const fade = (1 - t) * (t > 0.6 ? 0.6 + 0.4 * Math.sin(this.age[i] * 40 + i) : 1);
      for (let k = 0; k < 3; k++) this.colors[j + k] = this.base[j + k] * Math.max(0, fade);
    }
    this.live = live;
    this.points.visible = live > 0;
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}
