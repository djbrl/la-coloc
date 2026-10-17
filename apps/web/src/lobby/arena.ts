// The Arena, a stadium on its own block (docs/arena.md), drawn in code from plain shapes like the rest of the city's
// props: an oval bowl of stepped stands open to the sky, cut by a straight passage for the entrance (facing the
// market), a pitch with a boxing-ring stage in the middle, a floodlight mast on each corner of the block, banners and
// flags in the city's colours, and a big screen over the entrance with the week's challenge (its kind, its title, the
// time left, last week's champion, how many are in). Tall enough to see from across town.
// Where everything goes comes from arenaPlan.ts. Shapes of one kind are merged into one mesh with painted vertices,
// sharing four materials, so the whole stadium is about a dozen draw calls; low quality cuts the curves coarser and
// the screen smaller. The lobby (Lobby.ts) adds `group` and `ground` to the town, and calls `dispose` when the town goes.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { hudWords as words } from "../components/lobby/words";
import { language } from "../i18n";
import { type ArenaPlan, type Ellipse, gapHalf, STANDS, tierTop, timeLeft } from "./arenaPlan";
import type { CityStyle } from "./cityStyle";
import { FACING_DIR } from "./neighbourhood";
import { box, paint } from "./windows";

// What the big screen shows, already in the chosen language (Vue builds it from the arena's API view).
export interface ArenaDisplay {
  title: string;
  kind: "bounty" | "hackathon" | "challenge";
  endsAt: string;
  champion: string | null;
  entrants: number;
}

// The stands come in this many pieces round the bowl, so the one between the camera and you can fade on its own.
const SECTORS = 8;
const WALL = { thick: 0.3, height: tierTop(STANDS.tiers - 1) + 0.6 };
const MAST = { height: 9.5 };
// The screen over the entrance: its size, and how high its middle stands.
const SCREEN = { w: 5.2, h: 2.6, y: 5.3 };
// The countdown on the screen moves on once a minute.
const REDRAW_EVERY = 60_000;
// Each kind of challenge has its colour and its sign on the screen.
const KIND = {
  bounty: { color: "#e2463b", icon: "🐛" },
  hackathon: { color: "#1f5fa8", icon: "⚡" },
  challenge: { color: "#1f8a4c", icon: "🎯" },
} as const;

export class ArenaModel {
  // The stadium: aiming at any of it is aiming at the Arena (the lobby finds `userData.arena` upward).
  readonly group = new THREE.Group();
  // The pitch: ground you click to walk on, so it stays out of `group`.
  readonly ground: THREE.Mesh;
  // The stands' pieces, for the lobby to fade (see Lobby.occluder).
  readonly stands: THREE.Mesh[] = [];
  private materials: THREE.Material[];
  private solid = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 });
  private glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  private grass = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  private screen: { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; material: THREE.MeshBasicMaterial };
  private display: ArenaDisplay | null = null;
  private drawn = { key: "", at: 0 };

  constructor(
    private plan: ArenaPlan,
    private style: CityStyle,
    quality: "high" | "low",
  ) {
    const high = quality === "high";
    const segments = high ? 6 : 3; // per sector of the stands, along the curve
    this.group.position.set(plan.centre.x, 0.15, plan.centre.z);
    this.group.userData.arena = true;
    const canvas = document.createElement("canvas");
    canvas.width = high ? 512 : 256;
    canvas.height = canvas.width / 2;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = high ? 4 : 1;
    this.screen = { canvas, texture, material: new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }) };
    this.materials = [this.solid, this.glow, this.grass, this.screen.material];

    this.buildStands(segments);
    this.group.add(this.flat(this.details(), this.solid));
    this.group.add(this.flat(this.lights(), this.glow, false));
    this.buildScreen();
    this.ground = this.flat(this.pitch(high ? 48 : 24), this.grass, false);
    this.ground.position.copy(this.group.position);
    this.ground.name = "ground";
    this.ground.receiveShadow = true;
    this.draw();
  }

  /** What the big screen shows: drawn at once when it changed, else the countdown moves on once a minute (`tick`). */
  setDisplay(display: ArenaDisplay | null) {
    this.display = display;
    if (this.key() !== this.drawn.key) this.draw();
  }

  /** The language changed: the screen's words follow. */
  redraw() {
    this.draw();
  }

  /** Every frame; cheap: the screen is redrawn once a minute, for the time left. */
  tick(now: number) {
    if (now - this.drawn.at >= REDRAW_EVERY) this.draw();
  }

  dispose() {
    this.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.ground.geometry.dispose();
    for (const m of this.materials) m.dispose();
    this.screen.texture.dispose();
  }

  // ---- The shapes ----

  /**
   * The stands: four stepped tiers, each a band between two ellipses, rising towards the outer wall, cut at the
   * entrance (each ring by its own gap, so the passage's sides are straight), in SECTORS pieces.
   */
  private buildStands(segments: number) {
    const { inner, outer } = this.plan;
    const trim = new THREE.Color(this.style.palette.trim);
    const light = trim.clone().lerp(new THREE.Color(0xffffff), 0.45);
    const walls = new THREE.Color(this.style.palette.walls);
    const ring = (t: number): Ellipse => ({ rx: inner.rx + (outer.rx - WALL.thick - inner.rx) * t, rz: inner.rz + (outer.rz - WALL.thick - inner.rz) * t });
    const wallIn: Ellipse = { rx: outer.rx - WALL.thick, rz: outer.rz - WALL.thick };
    for (let s = 0; s < SECTORS; s++) {
      const parts: THREE.BufferGeometry[] = [];
      const f0 = s / SECTORS;
      const f1 = (s + 1) / SECTORS;
      for (let k = 0; k < STANDS.tiers; k++) {
        // Seats alternate the city's trim colour and a lighter shade of it, row after row.
        parts.push(paint(this.band(ring(k / STANDS.tiers), ring((k + 1) / STANDS.tiers), f0, f1, segments, 0, tierTop(k)), (k % 2 ? light : trim).getHex()));
      }
      // The outer wall, in the city's wall colour, a little higher than the top row.
      parts.push(paint(this.band(wallIn, outer, f0, f1, segments, 0, WALL.height), walls.getHex()));
      const mesh = this.flat(parts, this.solid);
      this.stands.push(mesh);
      this.group.add(mesh);
    }
  }

  /**
   * A band of the bowl from ellipse `a` (inside) to `b` (outside), from `bottom` to `top`, over the fraction f0 to f1 of
   * the arc that's left once the entrance's gap is cut out. A flat polygon (outer arc, then inner arc back) extruded up.
   */
  private band(a: Ellipse, b: Ellipse, f0: number, f1: number, segments: number, bottom: number, top: number): THREE.BufferGeometry {
    const { angle } = this.plan.gate;
    const facing = this.plan.facing;
    const arc = (e: Ellipse, f: number) => {
      const h = gapHalf(e, facing);
      const t = angle + h + f * (Math.PI * 2 - 2 * h);
      // The shape is drawn in x, -z: laid flat (rotateX below), its y becomes -z.
      return new THREE.Vector2(e.rx * Math.cos(t), -e.rz * Math.sin(t));
    };
    const points: THREE.Vector2[] = [];
    for (let i = 0; i <= segments; i++) points.push(arc(b, f0 + ((f1 - f0) * i) / segments));
    for (let i = segments; i >= 0; i--) points.push(arc(a, f0 + ((f1 - f0) * i) / segments));
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(points), { depth: top - bottom, bevelEnabled: false, curveSegments: 1 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, bottom, 0);
    return g;
  }

  /** The gate, the banners, the flags on the rim, the masts and the boxing ring: everything solid that isn't stands. */
  private details(): THREE.BufferGeometry[] {
    const { outer, gate, stage, masts, centre } = this.plan;
    const p = this.style.palette;
    const colours = [p.trim, p.roofs, p.walls, p.sky].map((c) => new THREE.Color(c).getHex());
    const dir = FACING_DIR[this.plan.facing];
    const across = { x: dir.z, z: -dir.x };
    const outerAlong = dir.x !== 0 ? outer.rx : outer.rz;
    const parts: THREE.BufferGeometry[] = [];
    // A thing at `along` out from the centre on the entrance's axis, `side` across it, turned to face out.
    const onAxis = (g: THREE.BufferGeometry, along: number, side: number, y: number) => {
      g.rotateY(Math.atan2(dir.x, dir.z));
      g.translate(dir.x * along + across.x * side, y, dir.z * along + across.z * side);
      return g;
    };

    // The gate: two pillars either side of the passage and a beam across, holding up the screen.
    const pillar = 0x2c2a33;
    const reach = SCREEN.y - SCREEN.h / 2;
    for (const side of [-1, 1]) parts.push(onAxis(box(0.5, reach, 0.6, 0, 0, 0, pillar), outerAlong - 0.1, side * (1.9 + 0.35), reach / 2));
    parts.push(onAxis(box(SCREEN.w + 0.4, SCREEN.h + 0.3, 0.35, 0, 0, 0, 0x1d1c22), outerAlong - 0.1, 0, SCREEN.y));

    // Banners down the outer wall, in the city's colours, round the bowl (not over the gate).
    const banners = 14;
    for (let i = 1; i < banners; i++) {
      const t = gate.angle + (i / banners) * Math.PI * 2;
      const [x, z] = [outer.rx * Math.cos(t), outer.rz * Math.sin(t)];
      const normal = Math.atan2(Math.cos(t) / outer.rx, Math.sin(t) / outer.rz);
      const g = box(0.8, 1.5, 0.06, 0, 0, 0.04, colours[i % colours.length]);
      g.rotateY(normal);
      g.translate(x, WALL.height - 0.95, z);
      parts.push(g);
    }
    // Flags on poles along the rim.
    const flags = 10;
    for (let i = 0; i < flags; i++) {
      const t = gate.angle + ((i + 0.5) / flags) * Math.PI * 2;
      const e = { rx: outer.rx - WALL.thick / 2, rz: outer.rz - WALL.thick / 2 };
      const [x, z] = [e.rx * Math.cos(t), e.rz * Math.sin(t)];
      parts.push(box(0.06, 1.3, 0.06, x, WALL.height + 0.65, z, 0xe9e6ef));
      const flag = box(0.7, 0.42, 0.04, 0.35, 0, 0, colours[(i + 1) % colours.length]);
      flag.rotateY(t + Math.PI);
      flag.translate(x, WALL.height + 1.1, z);
      parts.push(flag);
    }

    // The floodlight masts: a pole, and a head turned towards the middle (its lamps are in `lights`).
    for (const m of masts) {
      const [x, z] = [m.x - centre.x, m.z - centre.z];
      parts.push(paint(new THREE.CylinderGeometry(0.1, 0.2, MAST.height, 6).toNonIndexed().translate(x, MAST.height / 2, z), 0xc9ccd6));
      const head = box(1.7, 1.05, 0.22, 0, 0, 0, 0x2c2a33);
      head.rotateX(0.35);
      head.rotateY(Math.atan2(-x, -z));
      head.translate(x, MAST.height + 0.3, z);
      parts.push(head);
    }

    // The boxing ring: a red apron, a pale canvas, a post at each corner (red, blue and two white) and three ropes.
    const h = stage.half;
    const deck = 0.7;
    parts.push(box(2 * h, deck, 2 * h, 0, deck / 2, 0, 0xe2463b));
    parts.push(box(2 * h - 0.1, 0.06, 2 * h - 0.1, 0, deck + 0.03, 0, 0xf4f1e8));
    const posts = [0xe2463b, 0xffffff, 0x1f5fa8, 0xffffff];
    const corners = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    const inset = h - 0.12;
    corners.forEach(([sx, sz], i) => parts.push(box(0.14, 1.2, 0.14, sx * inset, deck + 0.6, sz * inset, posts[i])));
    for (const [y, colour] of [
      [deck + 0.4, 0xffffff],
      [deck + 0.75, 0xe2463b],
      [deck + 1.1, 0xffffff],
    ] as const) {
      parts.push(box(2 * inset, 0.05, 0.05, 0, y, -inset, colour), box(2 * inset, 0.05, 0.05, 0, y, inset, colour));
      parts.push(box(0.05, 0.05, 2 * inset, -inset, y, 0, colour), box(0.05, 0.05, 2 * inset, inset, y, 0, colour));
    }
    return parts;
  }

  /** The floodlights' lamps: a bright panel on each mast's head, facing the pitch. Unlit material, so they read as on. */
  private lights(): THREE.BufferGeometry[] {
    const { masts, centre } = this.plan;
    return masts.map((m) => {
      const [x, z] = [m.x - centre.x, m.z - centre.z];
      const g = box(1.5, 0.85, 0.04, 0, 0, 0.13, 0xfff3c4);
      g.rotateX(0.35);
      g.rotateY(Math.atan2(-x, -z));
      g.translate(x, MAST.height + 0.3, z);
      return g;
    });
  }

  /** The pitch: a lawn inside the stands, a lighter oval in the middle, and a white line round it. */
  private pitch(segments: number): THREE.BufferGeometry[] {
    const { inner } = this.plan;
    const disc = (rx: number, rz: number, y: number, colour: number) => paint(new THREE.CircleGeometry(1, segments).scale(rx, rz, 1).rotateX(-Math.PI / 2).translate(0, y, 0), colour);
    const line = paint(new THREE.RingGeometry(0.94, 1, segments).scale(inner.rx - 0.5, inner.rz - 0.5, 1).rotateX(-Math.PI / 2).translate(0, 0.012, 0), 0xf4f1e8);
    return [disc(inner.rx + 0.1, inner.rz + 0.1, 0.004, 0x4f9a40), disc(inner.rx * 0.72, inner.rz * 0.72, 0.008, 0x66b552), line];
  }

  /** The big screen: a panel on each side of the frame over the gate, out to the street and in to the pitch. */
  private buildScreen() {
    const { outer } = this.plan;
    const dir = FACING_DIR[this.plan.facing];
    const outerAlong = dir.x !== 0 ? outer.rx : outer.rz;
    const geometry = new THREE.PlaneGeometry(SCREEN.w, SCREEN.h);
    for (const out of [1, -1]) {
      const panel = new THREE.Mesh(geometry, this.screen.material);
      const along = outerAlong - 0.1 + out * 0.18;
      panel.position.set(dir.x * along, SCREEN.y, dir.z * along);
      panel.rotation.y = Math.atan2(dir.x * out, dir.z * out);
      this.group.add(panel);
    }
  }

  /** Painted geometries as one mesh, in one of the shared materials. */
  private flat(parts: THREE.BufferGeometry[], material: THREE.Material, shadows = true): THREE.Mesh {
    const geometry = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
    for (const p of parts) p.dispose();
    const m = new THREE.Mesh(geometry, material);
    m.castShadow = shadows;
    m.receiveShadow = true;
    return m;
  }

  // ---- The screen's picture ----

  /** What the screen shows, as a key: unchanged, nothing to draw. The time left counts in minutes. */
  private key(): string {
    const d = this.display;
    const left = d ? timeLeft(d.endsAt, Date.now()) : null;
    return JSON.stringify([language.lang, d, left]);
  }

  private draw() {
    this.drawn = { key: this.key(), at: Date.now() };
    const { canvas, texture } = this.screen;
    const g = canvas.getContext("2d");
    if (!g) return;
    const W = canvas.width;
    const H = canvas.height;
    const s = W / 512;
    const font = getComputedStyle(document.documentElement).getPropertyValue("--display").trim() || "system-ui, sans-serif";
    const px = (weight: number, size: number) => `${weight} ${Math.round(size * s)}px ${font}`;
    // A dark panel edged in the city's colour, like a scoreboard.
    g.fillStyle = this.style.palette.trim;
    g.fillRect(0, 0, W, H);
    g.fillStyle = "#171925";
    g.beginPath();
    g.roundRect(8 * s, 8 * s, W - 16 * s, H - 16 * s, 14 * s);
    g.fill();
    g.textBaseline = "middle";
    const d = this.display;
    if (!d) {
      // Nothing from the API yet: the Arena's name, over stripes in the city's colours.
      const p = this.style.palette;
      [p.trim, p.roofs, p.walls, p.sky].forEach((c, i) => {
        g.fillStyle = c;
        g.fillRect(40 * s + i * 108 * s, 176 * s, 100 * s, 14 * s);
      });
      g.fillStyle = "#ffffff";
      g.textAlign = "center";
      g.font = px(800, 64);
      g.fillText(`🏆 ${words.arena.toUpperCase()}`, W / 2, 104 * s);
      texture.needsUpdate = true;
      return;
    }
    const kind = KIND[d.kind];
    // Top line: the kind, on its colour; how many are in, on the right.
    g.font = px(800, 26);
    g.textAlign = "left";
    const label = `${kind.icon} ${words.arenaKind[d.kind]}`;
    const lw = g.measureText(label).width;
    g.fillStyle = kind.color;
    g.beginPath();
    g.roundRect(26 * s, 26 * s, lw + 28 * s, 44 * s, 22 * s);
    g.fill();
    g.fillStyle = "#ffffff";
    g.fillText(label, 40 * s, 49 * s);
    g.textAlign = "right";
    g.fillText(`👥 ${d.entrants}`, W - 30 * s, 49 * s);
    // The title, as big as fits.
    g.textAlign = "center";
    let size = 50;
    g.font = px(800, size);
    while (size > 26 && g.measureText(d.title).width > W - 52 * s) g.font = px(800, (size -= 2));
    g.fillText(fit(g, d.title, W - 52 * s), W / 2, 124 * s);
    // Bottom line: the time left, and last week's champion.
    const left = timeLeft(d.endsAt, Date.now());
    g.font = px(800, 30);
    g.textAlign = "left";
    g.fillStyle = "#ffd23f";
    g.fillText(`⏱ ${left.over ? words.arenaOver : words.arenaLeft(left.days, left.hours, left.minutes)}`, 30 * s, 200 * s);
    if (d.champion) {
      g.textAlign = "right";
      g.fillStyle = "#f5c542";
      g.fillText(fit(g, `🏆 ${d.champion}`, W / 2 - 30 * s), W - 30 * s, 200 * s);
    }
    texture.needsUpdate = true;
  }
}

/** A line of text cut short with an ellipsis to fit `width` pixels in the context's current font. */
function fit(g: CanvasRenderingContext2D, text: string, width: number): string {
  if (g.measureText(text).width <= width) return text;
  let cut = text;
  while (cut.length > 1 && g.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
  return `${cut}…`;
}
