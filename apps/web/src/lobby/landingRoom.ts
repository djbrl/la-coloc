// The room behind the landing's window: the same flat as the picture, live. Three flatmates who get on with their
// evening, a lamp, screens that scroll, and a view that follows the pointer. Loaded only once the picture is up, and
// if anything here fails or the machine is too slow, the picture simply stays (LandingPage.vue).
//
// Cheap on purpose: the canvas covers the window and nothing else, and all the furniture is merged into a few meshes.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { PICTURE_EYE, PLANE_Z, seenOnWall, windowFrustum, WINDOW_VIEW, type Eye } from "../landing";
import { loadModel, loadPerson, type Person } from "./assets";
import { FrameBudget } from "./frameBudget";

const C = { wall: 0xd88a45, side: 0xcb7636, skirt: 0xb96a2c, ceiling: 0xecd5ac, floor: 0x8a5d38, plank: 0x6d4628, curtain: 0x7c2a20, fold: 0x5e1f17, frame: 0x14233a, sill: 0xb8a68a, background: 0x120c1c };

const ROOM = { width: 11, depth: 5, height: 5, back: -2.6, centreZ: -0.1 };
const WINDOW = { halfWidth: 4.75, bottom: 0.2, top: 4.75, z: PLANE_Z };
const LAMP = { x: 0.55, ceiling: 5, length: 1.11, z: 0.3 };
const LAMP_POWER = 42;
const FRIDGE_POWER = 3.5;

// How far the eye goes from where it rests: sideways and up and down with the pointer, and on its own a little.
const SWAY = { x: 3.6, y: 1.4 };
const DRIFT = { x: 0.7, y: 0.25 };
// The picture was taken from further away: the eye leans in once the room is live, which deepens the room.
const LEAN_IN = 12;
const LEAN_SECONDS = 2.2;
const PIXELS_MOST = 2;
const PIXELS_SLOW = 1.25;

// What Awa does all evening: where she stands, which way she looks, for how long.
const AWA_STOPS = [
  { x: -0.72, z: -0.72, yaw: 0.55, clip: "holding-right", seconds: 8 },
  { x: -0.1, z: 0.75, yaw: 0, clip: "holding-right", seconds: 6 },
  { x: -0.95, z: -1.3, yaw: Math.PI, clip: "interact-right", seconds: 3 },
];
const WALK_SPEED = 1.5;

export interface RoomOptions {
  /** A flatmate was clicked, in the room. */
  onPoke(flatmate: number): void;
  /** The pointer came onto a flatmate. */
  onPoint(flatmate: number): void;
  /** How far each flatmate's head is from where the picture has it, in CSS pixels, so their bubbles can follow. */
  onHeads(moved: { x: number; y: number }[]): void;
  /** Too slow, even with fewer pixels. */
  onGiveUp(): void;
}

export interface LandingRoom {
  poke(flatmate: number): void;
  dispose(): void;
}

// All the furniture goes into one mesh per kind of surface, whatever its colour: a few draw calls instead of hundreds.
class Furniture {
  private kinds = new Map<string, { parts: THREE.BufferGeometry[]; glow: number; power: number; solid: boolean }>();

  private add(geometry: THREE.BufferGeometry, color: number, glow = 0, power = 0, turn?: { y?: number; z?: number }, x = 0, y = 0, z = 0, kind?: string) {
    if (turn) geometry.rotateY(turn.y ?? 0).rotateZ(turn.z ?? 0);
    geometry.translate(x, y, z);
    const c = new THREE.Color(color);
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) c.toArray(colors, i);
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const key = kind ?? `${glow}/${power}`;
    if (!this.kinds.has(key)) this.kinds.set(key, { parts: [], glow, power, solid: !glow });
    this.kinds.get(key)!.parts.push(geometry);
  }

  /** A box standing on `y`, centred on x and z. */
  box(w: number, h: number, d: number, color: number, x: number, y: number, z: number, glow = 0, power = 1.1, turn?: { y?: number; z?: number }) {
    this.add(new THREE.BoxGeometry(w, h, d), color, glow, glow ? power : 0, turn, x, y + h / 2, z);
  }

  can(radius: number, h: number, color: number, x: number, y: number, z: number) {
    this.add(new THREE.CylinderGeometry(radius, radius, h, 12), color, 0, 0, undefined, x, y + h / 2, z);
  }

  ball(radius: number, color: number, x: number, y: number, z: number, glow = 0, power = 1.1, kind?: string) {
    this.add(new THREE.SphereGeometry(radius, 10, 8), color, glow, glow ? power : 0, undefined, x, y, z, kind);
  }

  carton(x: number, y: number, z: number, size: number, yaw: number) {
    const part = (w: number, h: number, d: number, color: number, py: number) => {
      const g = new THREE.BoxGeometry(w * size, h * size, d * size).rotateY(yaw);
      this.add(g, color, 0, 0, undefined, x, y + py * size, z);
    };
    part(1, 0.8, 0.9, 0xb98c5a, 0.4);
    part(1.01, 0.03, 0.2, 0x2f6fd0, 0.8);
  }

  /** One mesh per kind. `materials` gets those made for a `kind` the room animates (the string of lights). */
  build(root: THREE.Object3D, materials: Map<string, THREE.MeshStandardMaterial>) {
    for (const [key, kind] of this.kinds) {
      const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true, emissive: kind.glow, emissiveIntensity: kind.power });
      const mesh = new THREE.Mesh(mergeGeometries(kind.parts), material);
      mesh.castShadow = mesh.receiveShadow = kind.solid;
      root.add(mesh);
      materials.set(key, material);
      kind.parts.forEach((g) => g.dispose());
    }
  }
}

function furnish(f: Furniture) {
  const { width: RW, depth: RD, height: RH, back: B, centreZ: Z } = ROOM;

  // The room itself.
  f.box(RW, 0.2, RD, C.floor, 0, -0.2, Z);
  for (let i = 0; i < 12; i++) f.box(0.03, 0.005, RD, C.plank, -5.2 + i * 0.95, 0, Z);
  f.box(RW, RH, 0.15, C.wall, 0, 0, B - 0.08);
  f.box(0.15, RH, RD, C.side, -RW / 2, 0, Z);
  f.box(0.15, RH, RD, C.side, RW / 2, 0, Z);
  f.box(RW, 0.2, RD, C.ceiling, 0, RH, Z);
  f.box(RW, 0.5, 0.06, C.skirt, 0, 0, B + 0.02);

  // Kofi's corner: the bed, the blanket he sits under, his laptop, a crate, boxes not yet unpacked.
  const bed = { x: -2.95, z: -1.15 };
  f.box(3, 0.24, 1.8, 0x5a4332, bed.x, 0, bed.z);
  f.box(2.9, 0.34, 1.72, 0xeee6d6, bed.x, 0.24, bed.z);
  f.box(0.75, 0.2, 1.25, 0xfaf3e5, bed.x - 1.02, 0.58, bed.z);
  f.box(0.28, 0.7, 1.1, 0xfaf3e5, bed.x - 1.32, 0.58, bed.z);
  f.box(1.95, 0.3, 1.78, 0x1f7a78, bed.x + 0.5, 0.58, bed.z);
  for (const dz of [0.3, -0.35]) f.box(1.95, 0.04, 0.22, 0xf0b23a, bed.x + 0.5, 0.88, bed.z + dz);
  const lap = { x: bed.x + 0.05, y: 0.92, z: bed.z + 0.32 };
  f.box(0.55, 0.03, 0.4, 0x8a8a90, lap.x, lap.y, lap.z);
  f.box(0.03, 0.36, 0.42, 0x9a9aa2, lap.x + 0.29, lap.y + 0.03, lap.z, 0, 0, { z: -0.22 });
  f.box(0.012, 0.3, 0.36, 0xcfe6ff, lap.x + 0.265, lap.y + 0.05, lap.z, 0x9dc3ff, 1.4, { z: -0.22 });
  f.box(0.55, 0.5, 0.55, 0xb08a58, -4.75, 0, 0.35);
  f.box(0.4, 0.04, 0.28, 0x2a2a2a, -4.75, 0.5, 0.35);
  f.can(0.05, 0.2, 0xc22a2a, -4.6, 0.5, 0.5);
  f.carton(-4.55, 0, 1.45, 1.05, 0.35);
  f.carton(-4.5, 0.84, 1.42, 0.85, -0.2);
  const poster = (x: number, y: number, w: number, h: number, a: number, b: number, c: number) => {
    const z = B + 0.03;
    f.box(w, h, 0.03, a, x, y, z);
    f.box(w * 0.78, h * 0.3, 0.035, b, x, y + h * 0.6, z);
    for (const at of [0.4, 0.24]) f.box(w * 0.6, h * 0.08, 0.035, c, x, y + h * at, z);
  };
  poster(-3.7, 2.15, 1.2, 1.6, 0x1c3f7a, 0xf0b23a, 0xf7efe0);
  poster(-2.3, 2.45, 0.85, 1.15, 0xc23b2a, 0x111111, 0xf7efe0);

  // The kitchen: a counter, a shelf of mugs, the fridge left open.
  f.box(1.5, 1.1, 0.85, 0xc23b2a, -0.95, 0, -2.15);
  f.box(1.56, 0.06, 0.9, 0xf0e4cc, -0.95, 1.1, -2.15);
  for (const [y, color, dz] of [[1.16, 0xeee6d6, 0], [1.26, 0xd8c8a8, -0.02], [1.36, 0xeee6d6, 0.02]]) f.box(0.5, 0.1, 0.5, color, -1.3, y, -2.15 + dz);
  for (const [x, color] of [[-0.75, 0xf7efe0], [-0.5, 0x1f7a78]]) f.can(0.09, 0.2, color, x, 1.16, -2.2);
  f.box(1.5, 0.06, 0.36, 0x6d4628, -0.95, 2.5, -2.4);
  for (const [x, color] of [[-1.45, 0xf7efe0], [-1.15, 0x1f7a78], [-0.85, 0xc23b2a], [-0.5, 0xf7efe0]]) f.can(0.09, 0.2, color, x, 2.56, -2.4);
  const fx = 0.55;
  const fz = -2.05;
  f.box(1.25, 2.55, 1, 0x2e7f86, fx, 0, fz);
  f.box(1.08, 2.15, 0.04, 0xbfd6dc, fx, 0.2, fz + 0.5, 0xa9c9d2, 0.62);
  for (let i = 0; i < 3; i++) f.box(1.08, 0.04, 0.3, 0x8fb3bf, fx, 0.75 + i * 0.55, fz + 0.62);
  f.box(0.28, 0.34, 0.2, 0xc22a2a, fx - 0.3, 0.79, fz + 0.62);
  f.box(0.2, 0.42, 0.2, 0xf0d24a, fx + 0.25, 0.79, fz + 0.62);
  f.box(0.22, 0.4, 0.2, 0x2e7f86, fx - 0.22, 1.34, fz + 0.62);
  f.box(0.42, 0.2, 0.24, 0xe07b2e, fx + 0.15, 1.34, fz + 0.62);
  f.box(0.5, 0.16, 0.24, 0xf7efe0, fx - 0.1, 1.89, fz + 0.62);
  f.box(0.08, 2.3, 1.05, 0x358e96, fx + 0.66, 0.12, fz + 0.92, 0, 0, { y: 0.28 });
  f.box(0.08, 0.5, 0.05, 0xdfe7e8, fx + 0.58, 1.3, fz + 1.24);
  f.carton(fx, 2.55, -2.1, 0.85, 0.1);

  // Moussa's desk, chair and the server by the window.
  const dx = 3.35;
  const dz = -2;
  f.box(3, 0.1, 1.25, 0x9d7a52, dx, 1.05, dz);
  for (const side of [-1.25, 1.25]) f.box(0.1, 1.05, 1.05, 0x333333, dx + side, 0, dz);
  f.box(1.2, 0.78, 0.06, 0x161616, dx - 0.68, 1.42, dz - 0.32);
  f.box(1, 0.72, 0.06, 0x161616, dx + 0.68, 1.38, dz - 0.32);
  f.box(0.1, 0.3, 0.1, 0x222222, dx - 0.68, 1.15, dz - 0.32);
  f.box(0.1, 0.26, 0.1, 0x222222, dx + 0.68, 1.15, dz - 0.32);
  f.box(0.5, 0.03, 0.18, 0x2a2a2a, dx, 1.15, dz + 0.28);
  f.can(0.07, 0.2, 0xf0ece2, dx + 1.15, 1.15, dz + 0.25);
  f.box(0.72, 0.1, 0.72, 0xc23b2a, 2.3, 0.68, -0.72);
  f.can(0.05, 0.68, 0x222222, 2.3, 0, -0.72);
  f.box(0.8, 0.04, 0.1, 0x222222, 2.3, 0, -0.72);
  f.box(0.1, 0.04, 0.8, 0x222222, 2.3, 0, -0.72);
  f.box(1, 0.55, 0.9, 0xb08a58, 4.85, 0, -0.15);
  f.box(0.66, 1.25, 0.78, 0x1c1c1f, 4.85, 0.55, -0.15);
  for (let i = 0; i < 4; i++) {
    f.box(0.4, 0.035, 0.02, 0x303036, 4.85, 1.6 - i * 0.22, 0.25);
    const led = i < 3 ? 0x41ff8f : 0xffc94d;
    f.box(0.05, 0.05, 0.02, led, 5.09, 1.6 - i * 0.22, 0.255, led, 2);
  }
  f.box(0.04, 0.02, 2.4, 0x111111, 4.3, 0, -0.2);

  // The rug, the low table with last night's pizza, and what's on the floor.
  f.box(3.6, 0.02, 2, 0x27408b, 0.3, 0.005, 1);
  for (const [z, color] of [[0.3, 0xf7b52c], [1, 0xd9541e], [1.7, 0xf7b52c]]) f.box(3.6, 0.03, 0.22, color, 0.3, 0.005, z);
  f.box(1.3, 0.42, 0.8, 0xb08a58, 1.25, 0.02, 1.5);
  f.box(0.8, 0.06, 0.7, 0xeee6d6, 1.1, 0.44, 1.5);
  f.box(0.7, 0.02, 0.6, 0xc8501e, 1.1, 0.5, 1.5);
  for (const [x, z] of [[1.63, 1.35], [1.73, 1.65]]) f.can(0.06, 0.2, 0xc22a2a, x, 0.44, z);
  f.box(0.5, 0.1, 0.4, 0x3b5e8c, -1.1, 0, 1.3);
  f.box(0.42, 0.08, 0.3, 0xc23b2a, -1.05, 0.1, 1.28);

  // The string of lights: every other bulb in its own mesh, so they can twinkle apart.
  for (let i = 0; i < 15; i++) {
    const t = i / 14;
    const y = 4.75 - Math.sin(t * Math.PI * 3) ** 2 * 0.22;
    const x = -5 + t * 10.2;
    f.ball(0.07, 0xffe08a, x, y, B + 0.12, 0xffc94d, 2.4, i % 2 ? "bulbs-a" : "bulbs-b");
  }

  // The window, as on the picture, plus plain walls either side: unseen, but they keep the sun out.
  const { halfWidth: wx, bottom: wb, top: wt, z: wz } = WINDOW;
  const span = wx * 2;
  f.box(span + 0.3, 0.16, 0.5, C.frame, 0, wt - 0.08, wz);
  f.box(span + 0.5, 0.14, 0.7, C.sill, 0, wb - 0.1, wz + 0.1);
  for (const x of [-wx, wx]) f.box(0.16, wt - wb, 0.5, C.frame, x, wb, wz);
  for (const x of [-1.75, 1.42]) f.box(0.1, wt - wb, 0.3, C.frame, x, wb, wz);
  f.box(0.72, wt - wb - 0.1, 0.2, C.curtain, -wx + 0.42, wb + 0.1, wz - 0.3);
  f.box(0.8, wt - wb - 0.1, 0.2, C.curtain, wx - 0.45, wb + 0.1, wz - 0.3);
  for (let i = 0; i < 5; i++) {
    f.box(0.06, wt - wb - 0.1, 0.24, C.fold, -wx + 0.12 + i * 0.15, wb + 0.1, wz - 0.3);
    f.box(0.06, wt - wb - 0.1, 0.24, C.fold, wx - 0.8 + i * 0.17, wb + 0.1, wz - 0.3);
  }
  f.box(46, 8, 0.4, 0x000000, 0, wt + 0.1, wz);
  f.box(46, 2.2, 0.4, 0x000000, 0, -2.1, wz);
  f.box(14, wt - wb, 0.4, 0x000000, -wx - 7.1, wb, wz);
  f.box(14, wt - wb, 0.4, 0x000000, wx + 7.1, wb, wz);
}

function codeOnScreen(background: string, inks: string[]) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 160;
  const g = canvas.getContext("2d")!;
  g.fillStyle = background;
  g.fillRect(0, 0, 256, 160);
  for (let line = 0; line < 12; line++) {
    let x = 12 + (line % 4) * 14;
    for (let word = 0; word < 2 + (line * 7) % 4; word++) {
      const w = 14 + ((line * 13 + word * 29) % 44);
      g.fillStyle = inks[(line + word) % inks.length];
      g.fillRect(x, 3 + line * 13, w, 7);
      x += w + 8;
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

const pointLight = (scene: THREE.Scene, color: number, power: number, reach: number, x: number, y: number, z: number) => {
  const light = new THREE.PointLight(color, power, reach, 1.8);
  light.position.set(x, y, z);
  scene.add(light);
  return light;
};

// The lights the picture was rendered with. `lamp` is the bulb over the room, for the visitor to click; `fridge` flickers.
function light(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight(0xc4aeb8, 0x5a4034, 1.05));
  const lamp = pointLight(scene, 0xffc27a, LAMP_POWER, 22, LAMP.x, 3.7, LAMP.z + 0.1);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  lamp.shadow.bias = -0.002;
  lamp.shadow.radius = 4;
  pointLight(scene, 0xffb06a, 18, 14, -3.2, 3.8, 1);
  const fridge = pointLight(scene, 0xd8efff, FRIDGE_POWER, 5, 0.45, 1.6, -0.7);
  pointLight(scene, 0x7bb8ff, 6, 4, 3.4, 1.9, -1.1);
  // The street, on the frame and the sill, so they match the picture around them.
  const moon = new THREE.DirectionalLight(0xa58fc4, 0.9);
  moon.position.set(-5, 9, 22);
  scene.add(moon);
  pointLight(scene, 0xffa860, 14, 8, 0, 0.6, 5);
  return { lamp, fridge };
}

// Kenney's people all paint themselves from one atlas of flat colours, which has three columns of skin side by side. The
// flatmates get a copy of it where all three are one deep brown. The city's own people keep the original.
function deepSkinAtlas(source: THREE.Texture) {
  const image = source.image as CanvasImageSource & { width: number; height: number };
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const g = canvas.getContext("2d")!;
  g.drawImage(image, 0, 0);
  const unit = image.width / 512;
  const skin = g.createLinearGradient(0, 384 * unit, 0, 512 * unit);
  skin.addColorStop(0, "#7c4630");
  skin.addColorStop(1, "#4f2c1e");
  g.fillStyle = skin;
  g.fillRect(320 * unit, 384 * unit, 192 * unit, 128 * unit);
  const atlas = new THREE.CanvasTexture(canvas);
  atlas.flipY = source.flipY;
  atlas.colorSpace = source.colorSpace;
  atlas.magFilter = source.magFilter;
  atlas.minFilter = THREE.NearestFilter;
  return atlas;
}

// Someone standing or sitting in the room. `yaw` is where they'd look by themselves, `hit` the box a click lands on.
interface Flatmate {
  person: Person;
  holder: THREE.Group;
  yaw: number;
  hit: THREE.Mesh;
  head: { x: number; y: number; z: number };
  look: number;
  hop: number;
  spin: number;
}

async function seat(scene: THREE.Scene, atlases: Map<THREE.Texture, THREE.Texture>, character: string, clip: string, x: number, y: number, z: number, yaw: number, headAt: number): Promise<Flatmate> {
  const person = await loadPerson(character, character, 1.75);
  person.object.traverse((o) => {
    o.frustumCulled = false;
    const mesh = o as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    if (!mesh.isMesh || !mesh.material.map) return;
    const source = mesh.material.map;
    if (!atlases.has(source)) atlases.set(source, deepSkinAtlas(source));
    mesh.material = mesh.material.clone();
    mesh.material.map = atlases.get(source)!;
  });
  person.play(clip);
  const holder = new THREE.Group();
  holder.add(person.object);
  holder.position.set(x, y, z);
  holder.rotation.y = yaw;
  const hit = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.9, 1.1));
  hit.position.y = 0.95;
  hit.visible = false;
  holder.add(hit);
  scene.add(holder);
  return { person, holder, yaw, hit, head: { x, y: headAt, z }, look: 0, hop: 0, spin: 0 };
}

export async function openRoom(canvas: HTMLCanvasElement, options: RoomOptions): Promise<LandingRoom> {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "low-power" });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(C.background, 1);

  const scene = new THREE.Scene();
  const furniture = new Furniture();
  furnish(furniture);
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  furniture.build(scene, materials);

  // The two screens on Moussa's desk: the same picture of code, sliding up a line at a time.
  const screenA = codeOnScreen("#0f1f3d", ["#6ee7ff", "#ffd166", "#ff6b6b", "#c7f464"]);
  const screenB = codeOnScreen("#12291f", ["#7CFFB2", "#7CFFB2", "#e6ffe6"]);
  const screen = (w: number, h: number, x: number, y: number, map: THREE.Texture) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map }));
    mesh.position.set(x, y, -2.285);
    scene.add(mesh);
  };
  screen(1.1, 0.68, 2.67, 1.81, screenA);
  screen(0.9, 0.62, 4.03, 1.74, screenB);

  // The lamp hangs from the ceiling and sways, and its light (and every shadow) sways with it.
  const lights = light(scene);
  const lamp = new THREE.Group();
  lamp.position.set(LAMP.x, LAMP.ceiling, LAMP.z);
  const cord = new THREE.Mesh(new THREE.BoxGeometry(0.02, LAMP.length, 0.02), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  cord.position.y = -LAMP.length / 2;
  const bulbPaint = new THREE.MeshStandardMaterial({ color: 0xfff0c0, emissive: 0xffe2a0, emissiveIntensity: 0 });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), bulbPaint);
  bulb.position.y = -LAMP.length;
  const lampHit = new THREE.Mesh(new THREE.SphereGeometry(0.4, 6, 4));
  lampHit.position.y = -LAMP.length;
  lampHit.visible = false;
  lamp.add(cord, bulb, lampHit);
  scene.add(lamp);
  let lampWanted = true;
  let lampNow = 1;

  const planter = await loadModel("/lobby/houses/planter.glb", 0.72);
  planter.position.set(-3.55, WINDOW.bottom + 0.04, WINDOW.z + 0.32);
  scene.add(planter);

  const atlases = new Map<THREE.Texture, THREE.Texture>();
  const kofi = await seat(scene, atlases, "male-a", "sit", -3.9, 0.62, -1.1, 0.95, 2.4);
  const awa = await seat(scene, atlases, "female-e", "holding-right", -0.72, 0, -0.72, 0.55, 1.85);
  const moussa = await seat(scene, atlases, "male-f", "sit", 2.3, 0.74, -0.72, 0.55, 2.55);
  const flatmates = [kofi, awa, moussa];

  // Awa's can stays in her hand wherever she goes.
  awa.person.mixer.update(0.3);
  awa.holder.updateWorldMatrix(true, true);
  const can = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.24, 10), new THREE.MeshStandardMaterial({ color: 0xc22a2a, roughness: 0.9, flatShading: true }));
  can.position.set(-0.3, 0.78, 0.62);
  awa.holder.add(can);
  awa.person.object.getObjectByName("arm-right")?.attach(can);
  can.castShadow = true;

  const camera = new THREE.PerspectiveCamera();
  const eye: Eye = { ...PICTURE_EYE };
  const pointer = { x: 0, y: 0 };
  const point = (e: PointerEvent) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  };

  // What's under the pointer, once a frame at most.
  const raycaster = new THREE.Raycaster();
  const under = (e: PointerEvent) => {
    const box = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2(((e.clientX - box.left) / box.width) * 2 - 1, -((e.clientY - box.top) / box.height) * 2 + 1), camera);
    return raycaster.intersectObjects([...flatmates.map((f) => f.hit), lampHit], false)[0]?.object ?? null;
  };
  let hovered: THREE.Object3D | null = null;
  let lastHover: PointerEvent | null = null;
  const hover = (e: PointerEvent) => (lastHover = e);
  const leave = () => {
    lastHover = null;
    hovered = null;
    canvas.style.cursor = "";
  };
  const click = (e: PointerEvent) => {
    const hit = under(e);
    if (hit === lampHit) lampWanted = !lampWanted;
    const who = flatmates.findIndex((f) => f.hit === hit);
    if (who >= 0) options.onPoke(who);
  };
  window.addEventListener("pointermove", point, { passive: true });
  canvas.addEventListener("pointermove", hover, { passive: true });
  canvas.addEventListener("pointerleave", leave);
  canvas.addEventListener("click", click);

  const poke = (i: number) => {
    const f = flatmates[i];
    if (f === kofi) f.hop = 1;
    else if (f === moussa) f.spin = 1;
    else {
      awaHeld = 1.5;
      f.person.play("emote-yes", true);
    }
  };

  // Awa's evening.
  let stop = 0;
  let waited = 0;
  let walking = false;
  let awaHeld = 0;
  const walkAwa = (dt: number) => {
    if (awaHeld > 0) {
      awaHeld -= dt;
      return;
    }
    const at = AWA_STOPS[stop];
    if (!walking) {
      awa.person.play(at.clip);
      awa.yaw = at.yaw;
      waited += dt;
      if (waited < at.seconds) return;
      waited = 0;
      stop = (stop + 1) % AWA_STOPS.length;
      walking = true;
      return;
    }
    const to = AWA_STOPS[stop];
    const dx = to.x - awa.holder.position.x;
    const dz = to.z - awa.holder.position.z;
    const left = Math.hypot(dx, dz);
    const step = WALK_SPEED * dt;
    awa.person.play("walk");
    awa.yaw = Math.atan2(dx, dz);
    if (left <= step) {
      awa.holder.position.x = to.x;
      awa.holder.position.z = to.z;
      walking = false;
    } else {
      awa.holder.position.x += (dx / left) * step;
      awa.holder.position.z += (dz / left) * step;
    }
    awa.head.x = awa.holder.position.x;
    awa.head.z = awa.holder.position.z;
  };

  // Turns the short way round.
  const turn = (from: number, to: number, amount: number) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * amount;

  let time = 0;
  let screenClock = 0;
  // Where a flatmate faces (towards you, when you point at them), and how they react to a poke: a hop or a spin.
  const carry = (f: Flatmate, restY: number, dt: number) => {
    f.look += ((hovered === f.hit ? 1 : 0) - f.look) * Math.min(1, dt * 6);
    f.hop = Math.max(0, f.hop - dt * 1.4);
    f.spin = Math.max(0, f.spin - dt * 1.1);
    f.holder.position.y = restY + Math.abs(Math.sin(f.hop * Math.PI * 2)) * 0.35 * f.hop;
    const facing = turn(f.yaw, 0, f.look * 0.6);
    f.holder.rotation.y = f.spin > 0 ? facing + (1 - (1 - f.spin) ** 3) * Math.PI * 2 : turn(f.holder.rotation.y, facing, Math.min(1, dt * 8));
  };

  const heads = flatmates.map(() => ({ x: 0, y: 0 }));
  const update = (dt: number) => {
    time += dt;
    flatmates.forEach((f) => f.person.mixer.update(dt));
    walkAwa(dt);

    // Kofi rocks a little over his laptop; Moussa's chair turns from one screen to the other.
    kofi.yaw = 0.95 + Math.sin(time * 0.4) * 0.1;
    moussa.yaw = 0.55 + Math.sin(time * 0.33) * 0.25;
    kofi.holder.rotation.x = Math.sin(time * 1.1) * 0.025;
    carry(kofi, 0.62, dt);
    carry(awa, 0, dt);
    carry(moussa, 0.74, dt);

    // The eye: leaning in once at the start, then following the pointer, with a little life of its own.
    const lean = Math.min(1, time / LEAN_SECONDS);
    const eased = 1 - (1 - lean) ** 3;
    const ease = 1 - Math.exp(-dt * 2.5);
    eye.x += (PICTURE_EYE.x + (pointer.x * SWAY.x + Math.sin(time * 0.21) * DRIFT.x) * eased - eye.x) * ease;
    eye.y += (PICTURE_EYE.y + (-pointer.y * SWAY.y + Math.sin(time * 0.17) * DRIFT.y) * eased - eye.y) * ease;
    eye.z = PICTURE_EYE.z - LEAN_IN * eased;
    const near = 0.2;
    const f = windowFrustum(eye, near);
    camera.projectionMatrix.makePerspective(f.left, f.right, f.top, f.bottom, near, 80);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    camera.position.set(eye.x, eye.y, eye.z);
    camera.updateMatrixWorld();

    // The lamp sways, and lights fade rather than snap.
    lamp.rotation.z = Math.sin(time * 0.9) * 0.05;
    lamp.rotation.x = Math.sin(time * 0.63) * 0.03;
    lampNow += ((lampWanted ? 1 : 0) - lampNow) * Math.min(1, dt * 12);
    lights.lamp.intensity = LAMP_POWER * lampNow;
    bulbPaint.emissiveIntensity = 2 * lampNow;
    lights.lamp.position.set(LAMP.x + Math.sin(lamp.rotation.z) * 1.3, 3.7, LAMP.z + 0.1 - Math.sin(lamp.rotation.x) * 1.3);
    lights.fridge.intensity = FRIDGE_POWER * (0.92 + Math.sin(time * 7.3) * Math.sin(time * 3.1) * 0.08);
    materials.get("bulbs-a")!.emissiveIntensity = 2.4 * (0.8 + Math.sin(time * 1.3) * 0.2);
    materials.get("bulbs-b")!.emissiveIntensity = 2.4 * (0.8 - Math.sin(time * 1.3) * 0.2);

    screenClock += dt;
    if (screenClock > 0.45) {
      screenClock = 0;
      screenA.offset.y = (screenA.offset.y + 13 / 160) % 1;
      if (Math.sin(time * 0.7) > -0.4) screenB.offset.y = (screenB.offset.y + 13 / 160) % 1;
    }

    if (lastHover) {
      const now = under(lastHover);
      if (now !== hovered) {
        const who = flatmates.findIndex((f) => f.hit === now);
        if (who >= 0) options.onPoint(who);
      }
      hovered = now;
      canvas.style.cursor = hovered ? "pointer" : "";
      lastHover = null;
    }

    // Bubbles follow the heads, in the page's pixels.
    const perUnit = canvas.clientWidth / (WINDOW_VIEW.right - WINDOW_VIEW.left);
    flatmates.forEach((m, i) => {
      const now = seenOnWall(m.head, eye);
      const rest = seenOnWall(i === 1 ? { x: AWA_STOPS[0].x, y: m.head.y, z: AWA_STOPS[0].z } : m.head, PICTURE_EYE);
      heads[i].x = (now.x - rest.x) * perUnit;
      heads[i].y = -(now.y - rest.y) * perUnit;
    });
    options.onHeads(heads);
  };

  // Sharp on any screen, up to a limit; slower machines get fewer pixels, then the picture.
  let pixels = Math.min(window.devicePixelRatio || 1, PIXELS_MOST);
  const fit = () => {
    renderer.setPixelRatio(pixels);
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  };
  fit();
  const resized = new ResizeObserver(fit);
  resized.observe(canvas);

  // A phone scrolls the window away: no need to draw it then. A hidden tab stops by itself.
  let inView = true;
  const seen = new IntersectionObserver(([entry]) => (inView = entry.isIntersecting));
  seen.observe(canvas);

  const budget = new FrameBudget();
  let raf = 0;
  let last = performance.now();
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const ms = now - last;
    last = now;
    if (!inView) return;
    if (budget.add(ms)) {
      if (pixels > PIXELS_SLOW) {
        pixels = PIXELS_SLOW;
        fit();
        budget.settle();
      } else {
        options.onGiveUp();
        return;
      }
    }
    update(Math.min(ms, 100) / 1000);
    renderer.render(scene, camera);
  };

  update(0);
  renderer.render(scene, camera);
  raf = requestAnimationFrame(frame);

  return {
    poke,
    dispose() {
      cancelAnimationFrame(raf);
      resized.disconnect();
      seen.disconnect();
      window.removeEventListener("pointermove", point);
      canvas.removeEventListener("pointermove", hover);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("click", click);
      // Everything drawn lives in this renderer's own context: losing it frees it all. The models stay cached for the city.
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
