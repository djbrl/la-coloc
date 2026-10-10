// A house's face as a status page (R12): one window per room on its front, a crane and a scaffold while a build
// runs, and the whole house dark during a power cut (délestage). The windows are plain coloured planes laid just in
// front of the model's front wall, all of them one instanced mesh (one draw call per house):
//   warm: online · blue with a small "for rent" placard: free · red, flickering: down or failed · dark: nothing runs.
// The lobby makes one `HouseFace` per house, `fit`s it to the model once it has loaded, and calls `update` with the
// house's live state (see live.ts) whenever the city stream changes, and `tick` every frame.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { LiveHouse, WindowState } from "./live";

// Window colours, by state; `glass` is a window with the lights off.
const COLORS: Record<WindowState | "glass" | "frame" | "placard", number> = {
  lit: 0xffc66b,
  free: 0x6f9cff,
  down: 0xff4a3d,
  dark: 0x3a3f4f,
  glass: 0x2a2e3a,
  frame: 0x1d1c22,
  placard: 0xfff4dc,
};
const WIN = { w: 0.62, h: 0.5, gapX: 0.42, gapY: 0.36 };

export class HouseFace {
  readonly group = new THREE.Group();
  private windows: THREE.InstancedMesh;
  private states: WindowState[] = [];
  private powerCut = false;
  private night = true;
  private crane: THREE.Group | null = null;
  private jib: THREE.Object3D | null = null;
  private color = new THREE.Color();
  // The front wall's size, in the house's own space (front facing +z): set by `fit`.
  private size = { width: 3.8, height: 3.5, front: 1.5 };

  constructor(private rooms: number) {
    // Each room gets three instances: a dark frame, the glass, and a placard (hidden unless the room is free).
    const material = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.windows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, Math.max(1, rooms) * 3);
    this.windows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Windows are part of the house: aiming at one is aiming at the house (the lobby finds the house id upward).
    this.windows.frustumCulled = false;
    this.group.add(this.windows);
  }

  /** Lays the windows out on a front wall `width` wide, `height` tall (walls only, below the roof), `front` from the centre. */
  fit(width: number, height: number, front: number) {
    this.size = { width, height, front };
    this.layout();
  }

  /** Shows a house's live state. Returns what changed, for the sounds: a power cut starting or ending, a build starting. */
  update(live: LiveHouse): { cut: boolean; restored: boolean; buildStarted: boolean } {
    const changes = { cut: live.powerCut && !this.powerCut, restored: !live.powerCut && this.powerCut, buildStarted: live.building && !this.crane };
    this.states = live.windows.slice(0, this.rooms);
    this.powerCut = live.powerCut;
    this.layout();
    if (live.building && !this.crane) this.raiseCrane();
    if (!live.building && this.crane) this.lowerCrane();
    return changes;
  }

  /** Day or night: lit windows glow at night and read as warm glass by day. */
  setNight(night: boolean) {
    if (night === this.night) return;
    this.night = night;
    this.paint(0);
  }

  /** Every frame: a down room's window flickers, the crane's jib turns slowly (neither with calm motion). */
  tick(time: number, calm: boolean) {
    if (this.states.includes("down") && !this.powerCut && !calm) this.paint(time);
    if (this.jib && !calm) this.jib.rotation.y = Math.sin(time * 0.25) * 0.9;
  }

  dispose() {
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      (mesh.material as THREE.Material | undefined)?.dispose?.();
    });
  }

  // Windows in rows across the front wall, top row under the roof; up to three across.
  private layout() {
    const n = this.rooms;
    // One row along the upper floor, up to four across; more rooms take a second row.
    const cols = n <= 4 ? Math.max(1, n) : Math.ceil(n / 2);
    const rows = Math.ceil(n / cols);
    const { width, height, front } = this.size;
    // Fit the grid inside the wall, leaving the door's height free at the bottom.
    const scale = Math.min(1, (width * 0.8) / (cols * (WIN.w + WIN.gapX)), (height - 1.2) / (rows * (WIN.h + WIN.gapY)));
    const w = WIN.w * scale;
    const h = WIN.h * scale;
    const stepX = (WIN.w + WIN.gapX) * scale;
    const stepY = (WIN.h + WIN.gapY) * scale;
    const top = height - 0.35 - h / 2;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < n; i++) {
      const c = i % cols;
      const r = Math.floor(i / cols);
      // The last row, when shorter, is centred.
      const inRow = r === rows - 1 ? n - r * cols : cols;
      const x = (c - (inRow - 1) / 2) * stepX;
      const y = top - r * stepY;
      m.compose(new THREE.Vector3(x, y, front + 0.03), q, new THREE.Vector3(w + 0.1, h + 0.1, 1));
      this.windows.setMatrixAt(i * 3, m);
      m.compose(new THREE.Vector3(x, y, front + 0.045), q, new THREE.Vector3(w, h, 1));
      this.windows.setMatrixAt(i * 3 + 1, m);
      // A free room's placard hangs under its window, a little askew.
      if (this.states[i] === "free") {
        const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), i % 2 ? 0.08 : -0.06);
        m.compose(new THREE.Vector3(x + w * 0.1, y - h / 2 - 0.16 * scale, front + 0.06), tilt, new THREE.Vector3(w * 0.8, 0.28 * scale, 1));
        this.windows.setMatrixAt(i * 3 + 2, m);
      } else this.windows.setMatrixAt(i * 3 + 2, hidden);
    }
    this.windows.instanceMatrix.needsUpdate = true;
    this.paint(0);
  }

  private paint(time: number) {
    for (let i = 0; i < this.rooms; i++) {
      const state = this.states[i] ?? "dark";
      this.windows.setColorAt(i * 3, this.color.setHex(COLORS.frame));
      this.windows.setColorAt(i * 3 + 2, this.color.setHex(COLORS.placard).multiplyScalar(this.powerCut ? 0.45 : this.night ? 0.85 : 1));
      if (this.powerCut) {
        this.windows.setColorAt(i * 3 + 1, this.color.setHex(COLORS.glass));
        continue;
      }
      this.color.setHex(COLORS[state]);
      // By day a lit window is less of a lantern; a down one flickers (two sines out of step, never quite dark).
      if (state === "lit" && !this.night) this.color.multiplyScalar(0.82);
      if (state === "down") this.color.multiplyScalar(0.55 + 0.45 * Math.abs(Math.sin(time * 9 + i) * Math.sin(time * 3.1 + i * 2)));
      this.windows.setColorAt(i * 3 + 1, this.color);
    }
    if (this.windows.instanceColor) this.windows.instanceColor.needsUpdate = true;
  }

  /** A small tower crane beside the house and a scaffold across its front: two draw calls for the crane, one for the scaffold. */
  private raiseCrane() {
    const { width, height, front } = this.size;
    const yellow = 0xf2b51d;
    const dark = 0x3b3a40;
    const crane = new THREE.Group();
    const tall = height + 2.6;
    // The mast: four corner posts and a few cross braces, with a concrete foot.
    const mast: THREE.BufferGeometry[] = [box(1.0, 0.3, 1.0, 0, 0.15, 0, 0x9c978d)];
    for (const [px, pz] of [
      [-0.2, -0.2],
      [0.2, -0.2],
      [-0.2, 0.2],
      [0.2, 0.2],
    ])
      mast.push(box(0.07, tall, 0.07, px, tall / 2, pz, yellow));
    for (let y = 0.6; y < tall; y += 0.7) mast.push(box(0.44, 0.05, 0.05, 0, y, 0.2, yellow), box(0.05, 0.05, 0.44, 0.2, y + 0.35, 0, yellow));
    crane.add(mesh(mast));
    // The turning part: the jib reaching over the house, the counter-jib with its weight, the cab, the cable and hook.
    const reach = width * 0.75 + 1;
    const top: THREE.BufferGeometry[] = [
      box(reach, 0.16, 0.22, -reach / 2, 0, 0, yellow),
      box(1.4, 0.16, 0.22, 0.7, 0, 0, yellow),
      box(0.5, 0.45, 0.4, 1.2, -0.25, 0, dark),
      box(0.42, 0.38, 0.42, 0, -0.32, 0.3, 0xe9e2d0),
      box(0.04, 1.4, 0.04, -reach * 0.7, -0.7, 0, dark),
      box(0.18, 0.18, 0.18, -reach * 0.7, -1.45, 0, dark),
    ];
    const jib = mesh(top);
    jib.position.y = tall + 0.08;
    crane.add(jib);
    crane.position.set(width / 2 + 0.9, 0, -0.4);
    // A scaffold across the front: poles and planks, kept clear of the door.
    const sc: THREE.BufferGeometry[] = [];
    const half = width / 2 + 0.15;
    for (const x of [-half, -half / 3, half / 3, half]) sc.push(box(0.06, height, 0.06, x, height / 2, front + 0.4, 0xb9b2a4));
    for (const y of [1.6, height - 0.5]) sc.push(box(width + 0.4, 0.06, 0.4, 0, y, front + 0.3, 0x9a7b55), box(width + 0.4, 0.04, 0.04, 0, y + 0.5, front + 0.5, 0xb9b2a4));
    const scaffold = mesh(sc);
    crane.add(scaffold);
    scaffold.position.x = -crane.position.x;
    scaffold.position.z = -crane.position.z;
    this.crane = crane;
    this.jib = jib;
    this.group.add(crane);
  }

  private lowerCrane() {
    if (!this.crane) return;
    this.group.remove(this.crane);
    this.crane.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose?.();
    });
    this.crane = null;
    this.jib = null;
  }
}

/** A box `w × h × d` centred on (x, y, z), its vertices painted `color`: boxes merge into one mesh with vertex colours. */
export function box(w: number, h: number, d: number, x: number, y: number, z: number, color: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.translate(x, y, z);
  return paint(g, color);
}

/** Paints every vertex of a geometry one colour (as a `color` attribute), for merging with others. */
export function paint(g: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const count = g.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b], i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

/** Several painted geometries as one flat-shaded mesh: one draw call. */
export function mesh(parts: THREE.BufferGeometry[]): THREE.Mesh {
  const geometry = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  for (const p of parts) p.dispose();
  const m = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 }));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
