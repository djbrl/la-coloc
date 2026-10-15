// The quest marker: where the tutorial wants you to walk (chapter 2, "Find a home"). A game's beacon, built from
// plain shapes: a glowing orange ring on the ground at a house's door, a wave rippling out of it, a soft column of
// light rising from it, and a diamond turning above, so it reads from far away in the isometric camera, by day and
// by night. Nothing is downloaded: the two soft gradients are drawn on small canvases here. It's light, not a thing:
// it can't be clicked or walked into (the lobby keeps it out of the town it aims at and walks around). With calm
// motion it glows steadily: no pulse, no wave, no bobbing.
import * as THREE from "three";

// The site's accent orange (--accent-fill), and a white edge so the diamond reads on any ground.
const ORANGE = 0xf2600f;
const EDGE = 0xffffff;
// Sizes, in world units (a house is about 5 wide and 5 tall; you are about 1.6 tall).
const RING = { inner: 0.8, outer: 1.05 };
const COLUMN = { radius: 0.6, height: 6 };
const DIAMOND = { size: 0.38, height: 4.6 };
// One heartbeat of the pulse, in seconds.
const PERIOD = 1.6;

/** What the beacon looks like at a moment: pure numbers, so they can be tested without a screen. */
export function beaconPulse(time: number, calm: boolean) {
  if (calm) return { ring: 1, glow: 0.85, wave: 0, waveScale: 1, bob: 0, spin: 0 };
  const beat = (time % PERIOD) / PERIOD; // 0 → 1, then again
  const swell = 0.5 + 0.5 * Math.sin(time * ((Math.PI * 2) / PERIOD));
  return {
    // The ring breathes a little, the glow with it.
    ring: 1 + 0.08 * swell,
    glow: 0.65 + 0.35 * swell,
    // A wave leaves the ring and fades as it grows, once a beat.
    wave: 0.8 * (1 - beat),
    waveScale: 1 + 1.4 * beat,
    // The diamond floats up and down and turns slowly.
    bob: 0.18 * Math.sin(time * 2.2),
    spin: time * 1.4,
  };
}

// A canvas gradient as a texture: a soft disc (radial), or a column fading upwards (vertical).
function gradient(kind: "radial" | "vertical"): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = kind === "radial" ? 64 : 4;
  c.height = 64;
  const g = c.getContext("2d")!;
  const fill = kind === "radial" ? g.createRadialGradient(32, 32, 0, 32, 32, 32) : g.createLinearGradient(0, 64, 0, 0);
  fill.addColorStop(0, "rgba(255,255,255,1)");
  fill.addColorStop(kind === "radial" ? 0.5 : 0.35, "rgba(255,255,255,0.45)");
  fill.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = fill;
  g.fillRect(0, 0, c.width, c.height);
  return new THREE.CanvasTexture(c);
}

// A flat, unlit material: the beacon is its own light. Not tone-mapped and not fogged, so the orange stays the
// site's orange at dusk and at the far end of town.
function glow(options: THREE.MeshBasicMaterialParameters): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: ORANGE, transparent: true, depthWrite: false, fog: false, toneMapped: false, ...options });
}

export class Beacon {
  readonly object = new THREE.Group();
  private ring: THREE.Mesh;
  private wave: THREE.Mesh;
  private pool: THREE.Mesh;
  private column: THREE.Mesh;
  private diamond: THREE.Group;
  private textures = [gradient("radial"), gradient("vertical")];
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];

  constructor() {
    const [disc, fade] = this.textures;
    const flat = (geometry: THREE.BufferGeometry, material: THREE.Material, y: number) => {
      const mesh = this.mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = y;
      return mesh;
    };
    // On the ground (just over the sidewalk): a soft pool of light, the ring on it, and the wave.
    this.pool = flat(new THREE.PlaneGeometry(3.4, 3.4), glow({ map: disc, opacity: 0.5 }), 0.17);
    this.ring = flat(new THREE.RingGeometry(RING.inner, RING.outer, 48), glow({ opacity: 0.95 }), 0.18);
    this.wave = flat(new THREE.RingGeometry(RING.outer - 0.08, RING.outer, 48), glow({ opacity: 0 }), 0.18);
    // The column: an open tube, brightest at the bottom, gone at the top. Seen through, so both sides are drawn.
    this.column = this.mesh(new THREE.CylinderGeometry(COLUMN.radius, COLUMN.radius * 0.8, COLUMN.height, 32, 1, true), glow({ map: fade, opacity: 0.45, side: THREE.DoubleSide }));
    this.column.position.y = 0.17 + COLUMN.height / 2;
    // A thinner, brighter core, added on top of whatever is behind it: it glows at night and still shows by day.
    const core = this.mesh(new THREE.CylinderGeometry(0.16, 0.16, COLUMN.height * 0.8, 16, 1, true), glow({ map: fade, opacity: 0.7, blending: THREE.AdditiveBlending }));
    core.position.y = 0.17 + (COLUMN.height * 0.8) / 2;
    // The diamond: solid orange, with a white edge (a slightly bigger copy, drawn inside out behind it).
    this.diamond = new THREE.Group();
    const shape = new THREE.OctahedronGeometry(DIAMOND.size);
    const solid = this.mesh(shape, glow({ transparent: false, depthWrite: true }));
    const edge = this.mesh(shape, glow({ color: EDGE, transparent: false, depthWrite: true, side: THREE.BackSide }));
    edge.scale.setScalar(1.22);
    this.diamond.add(solid, edge);
    this.diamond.scale.set(1, 1.5, 1);
    this.diamond.position.y = DIAMOND.height;
    this.object.add(this.pool, this.ring, this.wave, this.column, core, this.diamond);
    // Drawn after the town's own see-through things, so the glow lies over the ground rather than under it.
    this.object.traverse((o) => (o.renderOrder = 5));
  }

  /** Moves it to a spot on the ground (a house's door). */
  place(x: number, z: number) {
    this.object.position.set(x, 0, z);
  }

  /** One frame of the pulse. `time` is the lobby's clock, in seconds. */
  update(time: number, calm: boolean) {
    const p = beaconPulse(time, calm);
    this.ring.scale.setScalar(p.ring);
    (this.pool.material as THREE.MeshBasicMaterial).opacity = 0.5 * p.glow;
    (this.column.material as THREE.MeshBasicMaterial).opacity = 0.45 * p.glow;
    this.wave.visible = p.wave > 0.01;
    this.wave.scale.setScalar(p.waveScale);
    (this.wave.material as THREE.MeshBasicMaterial).opacity = p.wave;
    this.diamond.position.y = DIAMOND.height + p.bob;
    this.diamond.rotation.y = p.spin;
  }

  dispose() {
    this.object.removeFromParent();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
  }

  // A mesh that remembers its parts for `dispose`, and that the mouse looks straight through.
  private mesh(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
    if (!this.geometries.includes(geometry)) this.geometries.push(geometry);
    this.materials.push(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.raycast = () => undefined;
    return mesh;
  }
}
