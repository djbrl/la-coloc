// Placeholder 3D models, built from plain shapes. Real art (CC0 kits, then Jib's) replaces these functions:
// keep their signatures (a house from its rooms, an avatar from a colour) and the lobby doesn't change.
import * as THREE from "three";
import type { CityHouse } from "../types";

export const PALETTE = {
  ground: 0x8fae6b,
  street: 0x4a4a52,
  wall: 0xe9d6bd,
  roof: 0xc4683f,
  door: 0x7a4a2c,
  // A lived-in room glows warm, like a lit window at night.
  lit: 0xffc96b,
  // A free room: dark glass with a cool glow, "come in".
  free: 0x6f9cff,
  // Signed up, server not rented yet.
  making: 0xe0a640,
  down: 0xe2574c,
};

export interface HouseModel {
  group: THREE.Group;
  // Footprint half-sizes, for walking around the house rather than through it.
  halfWidth: number;
  halfDepth: number;
  // In front of the door, in the house's local space: where you stand to go in.
  door: THREE.Vector3;
}

const mat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...extra });

export function makeHouse(house: Pick<CityHouse, "rooms" | "status">): HouseModel {
  const group = new THREE.Group();
  const n = Math.max(1, house.rooms.length);
  const cols = n > 4 ? 3 : 2;
  const rows = Math.ceil(n / cols);
  const width = cols * 1.4 + 1;
  const height = rows * 1.3 + 0.9;
  const depth = 3;
  const making = house.status === "making";

  // Walls. A house in the making is only a scaffold: wireframe walls, no roof yet.
  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    making ? new THREE.MeshBasicMaterial({ color: PALETTE.making, wireframe: true }) : mat(PALETTE.wall),
  );
  walls.position.y = height / 2;
  walls.castShadow = !making;
  walls.receiveShadow = true;
  group.add(walls);
  if (making) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(width, 0.15, depth), mat(0xb9ad9a));
    slab.position.y = 0.075;
    group.add(slab);
  } else {
    // A pyramid roof: a four-sided cone, turned to sit square on the walls.
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(width, depth) / 2 + 0.3, 1.6, 4), mat(PALETTE.roof));
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(width / Math.hypot(width, depth) * 1.42, 1, depth / Math.hypot(width, depth) * 1.42);
    roof.position.y = height + 0.8;
    roof.castShadow = true;
    group.add(roof);
  }

  // One window per room, on the front.
  house.rooms.forEach((r, i) => {
    const state = !r.occupant ? "free" : making ? "making" : r.status === "down" || r.status === "failed" ? "down" : "lit";
    const color = { free: PALETTE.free, making: PALETTE.making, down: PALETTE.down, lit: PALETTE.lit }[state];
    const win = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.7, 0.08),
      mat(state === "free" ? 0x1e2638 : color, { emissive: color, emissiveIntensity: state === "free" ? 0.35 : 0.9 }),
    );
    const c = i % cols;
    const row = Math.floor(i / cols);
    win.position.set((c - (cols - 1) / 2) * 1.4, height - 0.75 - row * 1.3, depth / 2 + 0.04);
    group.add(win);
  });

  // The door, front and centre.
  if (!making) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.1), mat(PALETTE.door));
    door.position.set(0, 0.6, depth / 2 + 0.05);
    group.add(door);
  }

  return { group, halfWidth: width / 2, halfDepth: depth / 2, door: new THREE.Vector3(0, 0, depth / 2 + 1.1) };
}

/** A little person: a body, a head, a coloured top. Faces +z. */
export function makeAvatar(color: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(BODY, avatarPaint(color));
  body.position.y = 0.55;
  body.castShadow = true;
  const head = new THREE.Mesh(HEAD, avatarPaint(0x8d5a3b));
  head.position.y = 1.15;
  head.castShadow = true;
  // A nose, so you can tell which way they face.
  const nose = new THREE.Mesh(NOSE, avatarPaint(0x7a4a32));
  nose.position.set(0, 1.15, 0.24);
  g.add(body, head, nose);
  return g;
}

// A city has hundreds of people, and making each one's shapes took most of the time a rebuild takes. They share them.
const shared = <T extends THREE.BufferGeometry | THREE.Material>(thing: T): T => {
  thing.userData.shared = true;
  return thing;
};
const BODY = shared(new THREE.CapsuleGeometry(0.28, 0.5, 4, 8));
const HEAD = shared(new THREE.SphereGeometry(0.24, 12, 10));
const NOSE = shared(new THREE.SphereGeometry(0.05, 6, 6));
export const RING = shared(new THREE.RingGeometry(0.42, 0.58, 28));
const ringPaints = new Map<number, THREE.Material>();
/** The ring at someone's feet, in their house's colour. */
export const ringPaint = (color: number) => {
  let paint = ringPaints.get(color);
  if (!paint) ringPaints.set(color, (paint = shared(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }))));
  return paint;
};
const paints = new Map<number, THREE.Material>();
const avatarPaint = (color: number) => {
  let paint = paints.get(color);
  if (!paint) paints.set(color, (paint = shared(mat(color))));
  return paint;
};

// The warm white of the [ ] highlight: the ring on the ground and the outline around the thing both use it.
export const HIGHLIGHT = 0xfff3d6;

/** The ring on the ground under whatever you highlighted with Tab: light and flat. Hidden until there is one. */
export function makeHighlight(): THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> {
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 40), new THREE.MeshBasicMaterial({ color: HIGHLIGHT, transparent: true, opacity: 0.85, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  return ring;
}

/**
 * The puff of dust at your feet when you dash: two flat discs, one under you and one trailing behind (the group
 * faces +z, like the avatar). The lobby grows and fades them over a third of a second, then throws them away.
 */
export function makePuff(): THREE.Group {
  const g = new THREE.Group();
  for (const [radius, back] of [
    [0.35, 0],
    [0.24, -0.45],
  ]) {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 18), new THREE.MeshBasicMaterial({ color: 0xfff6e8, transparent: true, opacity: 0.7, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(0, 0.05, back);
    g.add(disc);
  }
  return g;
}

// Stable colour per login, so a flatmate always looks the same.
export function colorFor(login: string): number {
  let h = 0;
  for (const ch of login) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return new THREE.Color().setHSL((h % 360) / 360, 0.55, 0.55).getHex();
}

export function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    // Each skeleton keeps its bones in a texture of its own, which nothing else would free.
    (o as THREE.SkinnedMesh).skeleton?.dispose();
    if (!mesh.geometry?.userData.shared) mesh.geometry?.dispose();
    const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
    (Array.isArray(m) ? m : m ? [m] : []).forEach((x) => {
      if (x.userData.shared) return;
      const map = (x as THREE.MeshStandardMaterial).map;
      if (map?.userData.own) map.dispose();
      x.dispose();
    });
  });
}
