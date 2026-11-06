// Street props drawn in code from plain shapes (no downloads): the market's city board, and each city's own
// furniture (see cityStyle.ts). Shapes of one kind are merged into one mesh with painted vertices, or instanced,
// so a whole neighbourhood of props costs a handful of draw calls.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { box, mesh, paint } from "./windows";

// The city board's size: its face (header included) is FACE wide and tall, its top TOP above the ground. As tall as
// a house front or more, so it reads as the square's landmark from across it.
export const BOARD = { width: 7.8, face: { w: 7.4, h: 5.55, y: 4.75 }, top: 7.75 };

/**
 * The city board on the market square (R19), facing +z: a big white panel with the sign's red head, on two posts
 * and a stone step, like the app's own windows. Its face is one canvas, drawn once with no words: a speech bubble in
 * the head, chat bubbles on the left (the city's room) and notes on the right (the posts). One mesh of boxes and one
 * textured plane: two draw calls. `high` picks the canvas's size.
 */
export function makeBoard(high: boolean): THREE.Group {
  const ink = 0x2b2a33;
  const { w, h, y } = BOARD.face;
  const g = new THREE.Group();
  g.add(
    mesh([
      box(BOARD.width, 0.35, 1.2, 0, 0.175, 0, 0xd9d2c3),
      box(0.45, BOARD.top - 0.4, 0.45, -3.3, (BOARD.top - 0.4) / 2, -0.12, ink),
      box(0.45, BOARD.top - 0.4, 0.45, 3.3, (BOARD.top - 0.4) / 2, -0.12, ink),
      // The panel's back and edge, a little bigger than the face; a red cap over the head, its darker lip below.
      box(w + 0.3, h + 0.3, 0.3, 0, y, 0, 0xf7f5f0),
      box(w + 0.4, 0.22, 0.42, 0, y + h / 2 + 0.2, 0.04, 0xb3202c),
    ]),
  );
  const canvas = document.createElement("canvas");
  canvas.width = high ? 512 : 256;
  canvas.height = Math.round((canvas.width * h) / w);
  drawBoardFace(canvas);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = high ? 4 : 1;
  texture.userData.own = true;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 }));
  face.position.set(0, y, 0.16);
  face.receiveShadow = true;
  g.add(face);
  return g;
}

/** The board's face, on a canvas: the red head with a white speech bubble, chat bubbles left, notes right. */
function drawBoardFace(canvas: HTMLCanvasElement) {
  const c = canvas.getContext("2d");
  if (!c) return;
  const W = canvas.width;
  const H = canvas.height;
  const u = W / 512; // everything below is drawn on a 512-wide face
  const round = (x: number, y: number, w: number, h: number, r: number, fill: string) => {
    c.fillStyle = fill;
    c.beginPath();
    c.roundRect(x * u, y * u, w * u, h * u, r * u);
    c.fill();
  };
  c.fillStyle = "#f7f5f0";
  c.fillRect(0, 0, W, H);
  // The head: the sign's red, its darker lip, a white speech bubble in the middle.
  c.fillStyle = "#b3202c";
  c.fillRect(0, 0, W, 76 * u);
  c.fillStyle = "#6e121b";
  c.fillRect(0, 76 * u, W, 8 * u);
  round(226, 16, 60, 40, 12, "#ffffff");
  c.beginPath();
  c.moveTo(240 * u, 52 * u);
  c.lineTo(236 * u, 66 * u);
  c.lineTo(254 * u, 54 * u);
  c.fill();
  // The city's room: bubbles from both sides, grey lines for their words.
  const lines = (x: number, y: number, widths: number[]) => widths.forEach((lw, i) => round(x, y + i * 16, lw, 8, 4, "#b9b4ab"));
  const bubbles = [
    { x: 24, y: 108, w: 170, side: 0, fill: "#ebe7df", words: [130, 90] },
    { x: 66, y: 178, w: 170, side: 1, fill: "#f9e4e3", words: [120] },
    { x: 24, y: 232, w: 150, side: 0, fill: "#ebe7df", words: [110, 70] },
    { x: 80, y: 302, w: 156, side: 1, fill: "#f9e4e3", words: [100, 60] },
  ];
  for (const b of bubbles) {
    const tall = 22 + b.words.length * 16;
    round(b.x, b.y, b.w, tall, 14, b.fill);
    lines(b.x + 16, b.y + 14, b.words);
  }
  // A thin rule between the two halves.
  round(255, 104, 2, H / u - 124, 1, "#e0dbd2");
  // The posts: four notes, a little crooked, a dark title line and grey lines on each.
  const notes = [
    { x: 280, y: 112, fill: "#fbe7a1", tilt: -0.04 },
    { x: 392, y: 116, fill: "#d6e4f5", tilt: 0.05 },
    { x: 284, y: 248, fill: "#ffffff", tilt: 0.03 },
    { x: 394, y: 244, fill: "#f9e4e3", tilt: -0.05 },
  ];
  for (const n of notes) {
    c.save();
    c.translate((n.x + 48) * u, (n.y + 58) * u);
    c.rotate(n.tilt);
    c.translate(-(n.x + 48) * u, -(n.y + 58) * u);
    c.shadowColor = "rgba(23, 21, 26, 0.18)";
    c.shadowOffsetY = 3 * u;
    round(n.x, n.y, 96, 116, 6, n.fill);
    c.shadowColor = "transparent";
    round(n.x + 12, n.y + 18, 60, 10, 5, "#2b2a33");
    lines(n.x + 12, n.y + 42, [72, 64, 48]);
    c.restore();
  }
}

/** Pins on the board, one per house with reviews waiting: red when one is late, yellow otherwise. One draw call. */
export function makePins(late: boolean[]): THREE.Mesh {
  const parts = late.map((red, i) => {
    // Rows of six across the cork, a little scattered, like pins stuck by hand.
    const col = i % 6;
    const row = Math.floor(i / 6);
    const jitter = Math.sin(i * 12.9898) * 0.05;
    const head = new THREE.SphereGeometry(0.07, 8, 6).toNonIndexed();
    head.translate(-0.75 + col * 0.3 + jitter, 1.75 - row * 0.3 - jitter, 0.12);
    // A small paper note under each pin.
    const note = box(0.2, 0.22, 0.01, -0.75 + col * 0.3 + jitter, 1.65 - row * 0.3 - jitter, 0.08, 0xfff7e6);
    return [paint(head, red ? 0xe2463b : 0xf2c230), note];
  });
  return mesh(parts.flat());
}

// ---- Each city's own furniture (see cityStyle.ts) ----

const PIROGUE_COLORS = [
  [0xe2463b, 0xf2c230, 0x1f8a4c],
  [0x1f5fa8, 0xf4f1e8, 0xe2463b],
  [0xf2c230, 0x1f5fa8, 0x1d1c22],
  [0x1f8a4c, 0xf2c230, 0xe2463b],
];

/** A pirogue: a long narrow bowl painted in bands (rim, middle, keel), a raised beak at each end. Faces +x. */
function pirogue(colors: number[]): THREE.BufferGeometry {
  const hull = new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).toNonIndexed();
  hull.scale(2.1, 0.5, 0.45);
  // Paint by height: the rim band, the middle band, the keel.
  const pos = hull.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    c.setHex(y > -0.12 ? colors[0] : y > -0.3 ? colors[1] : colors[2]);
    col.set([c.r, c.g, c.b], i * 3);
  }
  hull.setAttribute("color", new THREE.BufferAttribute(col, 3));
  hull.translate(0, 0.42, 0);
  const beaks = [box(0.5, 0.12, 0.12, 2.15, 0.5, 0, colors[1]), box(0.4, 0.1, 0.1, -2.1, 0.48, 0, colors[1])];
  return mergeGeometries([hull, ...beaks])!;
}

/** A baobab: a fat, tapering trunk, a few thick branches out of its top, small clumps of leaves. About 6 units tall. */
function baobab(): THREE.BufferGeometry[] {
  const bark = 0x8f7a68;
  const leaf = 0x5f7f3a;
  const parts: THREE.BufferGeometry[] = [paint(new THREE.CylinderGeometry(0.75, 1.15, 3.6, 9).toNonIndexed().translate(0, 1.8, 0), bark)];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const branch = new THREE.CylinderGeometry(0.12, 0.3, 2, 6).toNonIndexed();
    branch.rotateZ(0.9);
    branch.rotateY(a);
    branch.translate(Math.cos(a) * 0.8, 4.1, -Math.sin(a) * 0.8);
    parts.push(paint(branch, bark));
    const clump = new THREE.IcosahedronGeometry(0.55, 0).toNonIndexed();
    clump.translate(Math.cos(a) * 1.6, 4.9 + (i % 2) * 0.3, -Math.sin(a) * 1.6);
    parts.push(paint(clump, leaf));
  }
  return parts;
}

/** A palm: a slightly curved trunk of stacked segments and a crown of drooping fronds. About 4.5 units tall. */
function palm(rand: () => number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const lean = (rand() - 0.5) * 0.5;
  let x = 0;
  for (let i = 0; i < 6; i++) {
    const seg = new THREE.CylinderGeometry(0.12, 0.15, 0.75, 6).toNonIndexed();
    x += lean * (i / 6) * 0.3;
    seg.translate(x, 0.37 + i * 0.7, 0);
    parts.push(paint(seg, i % 2 ? 0x8a6b4a : 0x7a5d40));
  }
  const top = 4.3;
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + rand();
    const frond = new THREE.ConeGeometry(0.28, 2, 4).toNonIndexed();
    frond.scale(1, 1, 0.25);
    // Pointing out and a little down: palm fronds droop.
    frond.rotateZ(-Math.PI / 2 - 0.35);
    frond.translate(0.95, -0.35, 0);
    frond.rotateY(a);
    frond.translate(x, top, 0);
    parts.push(paint(frond, k % 2 ? 0x3c8d2f : 0x2f7a2a));
  }
  parts.push(paint(new THREE.IcosahedronGeometry(0.22, 0).toNonIndexed().translate(x, top - 0.15, 0), 0x6b4a2a));
  return parts;
}

/**
 * A city's props, gathered as they're placed and then drawn with a handful of meshes: water tanks and rebar on
 * flat roofs (instanced), palms and the baobab (merged), the pirogues (instanced, rocking) on their strip of water.
 */
export class CityProps {
  readonly group = new THREE.Group();
  private tanks: THREE.InstancedMesh;
  private rebar: THREE.InstancedMesh;
  private trees: THREE.BufferGeometry[] = [];
  private boats: { mesh: THREE.InstancedMesh; spots: { x: number; z: number; ry: number; phase: number; afloat: boolean }[] } | null = null;
  private m = new THREE.Matrix4();

  constructor() {
    this.tanks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.38, 0.38, 0.8, 10), new THREE.MeshStandardMaterial({ color: 0x1f1f24, roughness: 0.55 }), 48);
    this.tanks.count = 0;
    this.rebar = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 4), new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 0.7, metalness: 0.4 }), 240);
    this.rebar.count = 0;
    for (const m of [this.tanks, this.rebar]) {
      m.castShadow = true;
      m.frustumCulled = false;
      this.group.add(m);
    }
  }

  /** A black water tank on a roof, at the world point (x, top, z). */
  tank(x: number, top: number, z: number) {
    if (this.tanks.count >= this.tanks.instanceMatrix.count) return;
    this.tanks.setMatrixAt(this.tanks.count++, this.m.makeTranslation(x, top + 0.4, z));
    this.tanks.instanceMatrix.needsUpdate = true;
  }

  /** Rods sticking up from an unfinished upper floor: a row of them along a roof's edge, from (x, z) towards (x2, z2). */
  rods(x: number, z: number, x2: number, z2: number, top: number, rand: () => number) {
    const n = 6 + Math.floor(rand() * 5);
    for (let i = 0; i < n && this.rebar.count < this.rebar.instanceMatrix.count; i++) {
      const t = i / (n - 1);
      const tall = 0.6 + rand() * 0.6;
      const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler((rand() - 0.5) * 0.25, 0, (rand() - 0.5) * 0.25));
      this.m.compose(new THREE.Vector3(x + (x2 - x) * t, top + tall / 2, z + (z2 - z) * t), tilt, new THREE.Vector3(1, tall, 1));
      this.rebar.setMatrixAt(this.rebar.count++, this.m);
    }
    this.rebar.instanceMatrix.needsUpdate = true;
  }

  palm(x: number, z: number, rand: () => number) {
    for (const g of palm(rand)) this.trees.push(g.translate(x, 0.14, z));
  }

  baobab(x: number, z: number) {
    for (const g of baobab()) this.trees.push(g.translate(x, 0.14, z));
  }

  /**
   * The coast: a strip of sea along one side of the town, a beach between it and the last street, and painted
   * pirogues, some afloat and rocking, some pulled up on the sand. `edge` is the town's edge on that side (+z).
   */
  coast(minX: number, maxX: number, edge: number, rand: () => number) {
    const width = maxX - minX + 120;
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(width, 60), new THREE.MeshStandardMaterial({ color: 0x2e8b9a, roughness: 0.25, metalness: 0.1 }));
    sea.rotation.x = -Math.PI / 2;
    // Just above the ground to the horizon (y = -0.02), which runs under it.
    sea.position.set((minX + maxX) / 2, -0.012, edge + 5 + 30);
    sea.name = "sea";
    const beach = new THREE.Mesh(new THREE.PlaneGeometry(width, 4.5), new THREE.MeshStandardMaterial({ color: 0xe3cc9c, roughness: 1 }));
    beach.rotation.x = -Math.PI / 2;
    beach.position.set((minX + maxX) / 2, -0.01, edge + 3.2);
    sea.receiveShadow = beach.receiveShadow = true;
    sea.raycast = beach.raycast = () => undefined;
    this.group.add(sea, beach);
    // Each pirogue's colours are painted in its geometry: a few hull designs, one instanced mesh per design.
    const spots: { x: number; z: number; ry: number; phase: number; afloat: boolean }[] = [];
    for (let i = 0; i < 9; i++) {
      const afloat = i % 3 !== 0;
      spots.push({
        x: minX + 4 + rand() * (maxX - minX - 8),
        z: afloat ? edge + 7 + rand() * 7 : edge + 2.6 + rand() * 1.2,
        ry: afloat ? rand() * Math.PI : Math.PI / 2 + (rand() - 0.5) * 0.5,
        phase: rand() * Math.PI * 2,
        afloat,
      });
    }
    // One design per boat would cost one draw call each: instead every boat shares one painted hull, its colours
    // multiplied by an instance colour, so they still look different.
    // Double-sided: from above you look into the open hull.
    const mesh = new THREE.InstancedMesh(
      pirogue(PIROGUE_COLORS[Math.floor(rand() * PIROGUE_COLORS.length)]),
      new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.7, side: THREE.DoubleSide }),
      spots.length,
    );
    const tint = new THREE.Color();
    spots.forEach((_, i) => mesh.setColorAt(i, tint.setHSL((i * 0.27) % 1, 0.25, 0.85)));
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    mesh.raycast = () => undefined;
    this.group.add(mesh);
    this.boats = { mesh, spots };
    this.tick(0, true);
  }

  /** Puts the merged trees in the scene, once everything is placed. */
  finish() {
    if (!this.trees.length) return;
    const trees = mesh(this.trees);
    this.trees = [];
    this.group.add(trees);
  }

  /** The pirogues afloat rock on the swell (still with calm motion). */
  tick(time: number, calm: boolean) {
    const b = this.boats;
    if (!b) return;
    if (calm && time > 0) return;
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    b.spots.forEach((s, i) => {
      const roll = s.afloat ? Math.sin(time * 1.3 + s.phase) * 0.08 : 0;
      const bob = s.afloat ? Math.sin(time * 0.9 + s.phase) * 0.06 - 0.12 : 0;
      q.setFromEuler(e.set(roll, s.ry, roll * 0.5));
      this.m.compose(new THREE.Vector3(s.x, bob, s.z), q, new THREE.Vector3(1, 1, 1));
      b.mesh.setMatrixAt(i, this.m);
    });
    b.mesh.instanceMatrix.needsUpdate = true;
  }
}

/**
 * The market's stalls under wax-print parasols: a table, a pole and an eight-sided canopy each. Canopies share two
 * cloths (two draw calls), poles and tables are one merged mesh.
 */
export function waxParasols(spots: { x: number; z: number; turn: number }[], cloths: THREE.Texture[]): THREE.Group {
  const g = new THREE.Group();
  const wood: THREE.BufferGeometry[] = [];
  const canopies: THREE.BufferGeometry[][] = cloths.map(() => []);
  spots.forEach((s, i) => {
    wood.push(box(0.07, 2.1, 0.07, s.x, 1.2, s.z, 0x5b4636));
    // The stall's table, beside the pole, turned with the stall.
    const table = [box(1.3, 0.08, 0.8, 0.5, 0.8, 0, 0x8a6b4a)];
    for (const [lx, lz] of [
      [-0.1, -0.35],
      [1.1, -0.35],
      [-0.1, 0.35],
      [1.1, 0.35],
    ])
      table.push(box(0.07, 0.76, 0.07, lx, 0.38, lz, 0x5b4636));
    for (const t of table) wood.push(t.rotateY(s.turn).translate(s.x, 0.15, s.z));
    const canopy = new THREE.ConeGeometry(1.25, 0.55, 8, 1, true).toNonIndexed();
    canopy.rotateY(s.turn);
    canopy.translate(s.x, 2.45, s.z);
    canopies[i % cloths.length].push(canopy);
  });
  g.add(mesh(wood));
  cloths.forEach((cloth, k) => {
    if (!canopies[k].length) return;
    cloth.repeat.set(3, 1);
    const m = new THREE.Mesh(mergeGeometries(canopies[k])!, new THREE.MeshStandardMaterial({ map: cloth, side: THREE.DoubleSide, roughness: 0.9 }));
    m.castShadow = true;
    g.add(m);
  });
  return g;
}
