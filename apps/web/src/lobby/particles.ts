// A pool of particles drawn as one `THREE.Points` (one draw call, buffers reused): the roofs' smoke and the
// teams' confetti (life.ts) are each one pool for the whole city. Every particle flies with its own speed, gravity and
// drag, grows or not, and fades in then out over its life. When the pool is full, the oldest particle is reused.
//
// Each particle has its own size and opacity, which three.js's PointsMaterial can't do, so this is a small shader:
// the size is in world units (turned into pixels from the camera's zoom), and the dot is either soft and round
// (smoke) or a hard little square (confetti).
import * as THREE from "three";

export interface Particle {
  // Where it starts, and its speed (units per second).
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  // Seconds it lives, its size (world units) at birth, and how much it grows by the end (1: twice as big).
  life: number;
  size: number;
  grow: number;
  color: number;
  // Its opacity at its fullest, the pull down (units per second², 0 for smoke), and how fast the air slows it.
  alpha: number;
  gravity: number;
  drag: number;
}

const VERTEX = /* glsl */ `
  attribute float size;
  attribute float alpha;
  attribute vec3 tint;
  uniform float scale;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vAlpha = alpha;
    vColor = tint;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    // An orthographic camera: projectionMatrix[1][1] is 2 / (the view's height in world units), so this is the
    // size in pixels on a screen "scale" pixels tall.
    gl_PointSize = size * projectionMatrix[1][1] * scale * 0.5;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float soft;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    // Soft: a round puff, opaque over its middle half, fading to nothing at its edge. Hard: the whole square.
    float a = soft > 0.5 ? 1.0 - smoothstep(0.25, 0.5, r) : 1.0;
    if (a <= 0.0) discard;
    gl_FragColor = vec4(vColor, a * vAlpha);
    #include <colorspace_fragment>
  }
`;

export class ParticlePool {
  readonly points: THREE.Points;
  private positions: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private alphas: Float32Array;
  // What each particle is doing: speed, age, and its fixed settings.
  private speed: Float32Array;
  private age: Float32Array;
  private settings: { life: number; size: number; grow: number; alpha: number; gravity: number; drag: number }[];
  private next = 0;
  private live = 0;
  private color = new THREE.Color();
  private screen = new THREE.Vector2();

  constructor(private count: number, soft: boolean) {
    this.positions = new Float32Array(count * 3).fill(-1000);
    this.colors = new Float32Array(count * 3);
    this.sizes = new Float32Array(count);
    this.alphas = new Float32Array(count);
    this.speed = new Float32Array(count * 3);
    this.age = new Float32Array(count).fill(Infinity);
    this.settings = Array.from({ length: count }, () => ({ life: 1, size: 0, grow: 0, alpha: 0, gravity: 0, drag: 0 }));
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("tint", new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("size", new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("alpha", new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));
    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: { scale: { value: 800 }, soft: { value: soft ? 1 : 0 } },
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(g, material);
    this.points.frustumCulled = false;
    this.points.visible = false;
    // Smoke and confetti are air, not something to click.
    this.points.raycast = () => undefined;
    // The screen's height in pixels, read as it's drawn, for the size in pixels.
    this.points.onBeforeRender = (renderer) => {
      material.uniforms.scale.value = renderer.getDrawingBufferSize(this.screen).y;
    };
  }

  /** Sends a particle off. */
  emit(p: Particle) {
    const i = this.next;
    this.next = (this.next + 1) % this.count;
    if (!(this.age[i] < this.settings[i].life)) this.live++;
    this.age[i] = 0;
    this.positions.set([p.x, p.y, p.z], i * 3);
    this.speed.set([p.vx, p.vy, p.vz], i * 3);
    this.color.setHex(p.color);
    this.colors.set([this.color.r, this.color.g, this.color.b], i * 3);
    this.sizes[i] = p.size;
    this.alphas[i] = 0;
    Object.assign(this.settings[i], { life: p.life, size: p.size, grow: p.grow, alpha: p.alpha, gravity: p.gravity, drag: p.drag });
    this.points.visible = true;
  }

  /** Moves every live particle on by `dt` seconds. Nothing to do (and no upload) when none is alive. */
  tick(dt: number) {
    if (!this.live) return;
    let live = 0;
    for (let i = 0; i < this.count; i++) {
      const s = this.settings[i];
      if (!(this.age[i] < s.life)) continue;
      this.age[i] += dt;
      const j = i * 3;
      if (this.age[i] >= s.life) {
        // Gone: parked far below the ground, see-through.
        this.positions[j + 1] = -1000;
        this.alphas[i] = 0;
        continue;
      }
      live++;
      const slow = Math.exp(-s.drag * dt);
      this.speed[j + 1] -= s.gravity * dt;
      for (let k = 0; k < 3; k++) {
        this.speed[j + k] *= slow;
        this.positions[j + k] += this.speed[j + k] * dt;
      }
      this.sizes[i] = s.size * (1 + s.grow * (this.age[i] / s.life));
      this.alphas[i] = s.alpha * fade(this.age[i] / s.life);
    }
    this.live = live;
    this.points.visible = live > 0;
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.size.needsUpdate = a.alpha.needsUpdate = a.tint.needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

/**
 * A particle's opacity over its life (t from 0 to 1): in quickly over the first 15 %, full until halfway, then out
 * to nothing.
 */
export function fade(t: number): number {
  if (t <= 0 || t >= 1) return 0;
  if (t < 0.15) return t / 0.15;
  return t < 0.5 ? 1 : (1 - t) / 0.5;
}
