// The city as a walkable lobby: one neighbourhood at a time, generated from its city's name (see neighbourhood.ts),
// at dusk. Your character, the flatmates hanging around their houses, and everyone else who's online in this
// neighbourhood, live. Every house, empty plot, person and lamp is a target: walk up to one and press E, click it,
// or press Tab to pick one from afar; whatever the mouse is over gets an outline. A lamp flips; anything else is
// reported to Vue, which draws the card and does the navigating. Anything far away is walked to along a route
// found on a grid (path.ts), so you can get to a building from whichever side you're on. Shift dashes, and
// `teleport` is fast travel. For the tutorial, Vue can switch controls off one by one (`setControls`), hears each
// one you use (`onAction`), and can send the camera to show you a spot (`showSpot`); `frame` makes room for a
// window on the right of the screen.
// Pure three.js; Vue only mounts it and draws what sits on top (cards, the minimap it's fed by `onMap`).
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutlinePass } from "three/examples/jsm/postprocessing/OutlinePass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { CityHouse } from "../types";
import { loadHouse, loadModel, loadPerson, PARASOLS, type Person, SHOPS, SKYLINE, STREET, TOWERS, TREES } from "./assets";
import { colorFor, disposeTree, HIGHLIGHT, makeAvatar, makeHighlight, makeHouse, makePuff, makeRoomBoard } from "./models";
import { type Facing, FACING_DIR, frontOf, type Neighbourhood, PLOT, ROAD, seeded } from "./neighbourhood";
import { type Box, buildGrid, distanceToBox, findPath, type Grid, grow, nearestOnBox, type Point, RADIUS, smooth } from "./path";
import { play } from "./sound";
import { groundMaterial, textures } from "./textures";

const SPEED = 6; // units per second
// A dash (Shift): an instant hop forward, a burst at 4.5 times the speed, then a breather before the next one.
// Lengths in units, times in seconds.
const DASH = { hop: 0.9, speed: 4.5, length: 0.14, cooldown: 0.35 };
const PUFF_TIME = 0.3; // how long the dust at your feet lasts
const HOVER_EVERY = 60; // milliseconds between two looks at what's under the mouse
const MAP_EVERY = 200; // milliseconds between two reports to the minimap
const REACH = 1.6; // how close you stand to use a building, a person or a lamp
const GRID_CELL = 0.5; // the walk grid's cell size, in units
// Following a route but moved less than this in this long (a wall, a lost cause): the route is dropped.
const STUCK = { moved: 0.05, after: 0.5 };
// Far back along the isometric angle: an orthographic view looks the same from any distance, and a full-height
// screen reaches ground that a closer camera would clip.
const CAMERA_OFFSET = new THREE.Vector3(42, 48, 42);
const ZOOM = { min: 7, max: 26, start: 13 }; // half the view's width, in world units
// Showing a spot (`showSpot`): how long the camera takes to glide there (and back), and how long it stays, in seconds.
const TOUR = { glide: 1.2, hold: 2 };
// A window open on the right (`frame("left")`): zoomed in to this half-width, with you this far across the screen
// from the left. A screen narrower than `narrow` pixels shows windows as a bottom sheet: it only zooms.
const FRAMED = { half: 6.5, at: 0.28, narrow: 720 };
const LAMP_LIGHT = 0xffc078;
const TAG_RANGE = 10; // people's name tags show within this distance of you
const NOBODY = 0xd8d8de; // the ring colour of someone without a house

export type Emote = "yes" | "no";
// The controls you use, as Vue hears about them (see `onAction`).
export type Action = "walk-up" | "walk-down" | "walk-left" | "walk-right" | "dash" | "turn-left" | "turn-right";
// What you're allowed to do (see `setControls`). `targets: "houses"` leaves only houses to aim at.
export interface Controls {
  walk: boolean;
  dash: boolean;
  turn: boolean;
  targets: "all" | "houses";
}
export type Target =
  | { kind: "house"; house: CityHouse }
  // An empty building or lot: a shop, a tower or a tree lot. Rentable: "start a coloc here". `key` is Plot.key.
  | { kind: "empty"; plot: { key: string; lot: "shop" | "tower" | "trees"; x: number; z: number } }
  | { kind: "person"; login: string; name: string }
  | { kind: "lamp"; id: string; on: boolean };

// Who someone is, for their ring colour and the card you get by clicking them.
export interface Resident {
  houseId: string;
  houseName: string;
  room: string;
  project: string | null;
}

export interface LobbyEvents {
  // The thing in reach of you, or the one you highlighted with Tab: Vue shows a prompt for it ("Go in  E").
  onNear(target: Target | null): void;
  // You used a target (E, Enter, a click, or walking up to something you clicked): Vue opens a card for it.
  // Lamps never reach here: they just toggle.
  onSelect(target: Target): void;
  // Your position, when it changed (at most ten times a second): for the others to see you.
  onMove(state: { x: number; z: number; ry: number; moving: boolean }): void;
  // Which lamps are lit, by id, after you switch one.
  onLamps(lit: string[]): void;
  // What the mouse is over (it gets an outline and a pointer cursor), when that changes. Nothing: null.
  onHover(target: Target | null): void;
  // For the minimap, five times a second: you, everyone else on the map, and which way the camera is turned.
  onMap(state: { you: { x: number; z: number; ry: number }; people: { login: string; x: number; z: number }[]; angle: number }): void;
  // You used a control that's switched on: a walk key went down (not a key held down repeating), a dash happened
  // (Shift, or `dash()`), or the camera turned (Q, R, or `rotate()`). The tutorial ticks its steps off with this.
  onAction(name: Action): void;
}

export interface LobbyOptions {
  login: string | null;
  character: string | null;
  quality: "high" | "low";
  reduceMotion: boolean;
  litLamps: string[];
}

// Anything you can aim at, whatever it is: what Vue hears about it, and where it stands.
interface Thing {
  target: Target;
  // Where it is, for the ring, the minimap and Tab's nearest-first order: a lamp's foot, a person's feet (it moves
  // with them), or, for a building, its door when you're not on your way there and the nearest point of its reach
  // band to you when you are.
  spot: THREE.Vector3;
  // A building's footprint. You can use it from any side: "in reach" means within REACH of this box.
  box?: Box;
  // A building's door: where `spot` rests.
  door?: THREE.Vector3;
}

interface Placed extends Thing {
  house: CityHouse;
  group: THREE.Group;
  box: Box;
  door: THREE.Vector3;
  npcs: Npc[];
}

interface EmptyPlot extends Thing {
  key: string;
  box: Box;
  door: THREE.Vector3;
  // What's drawn on it (the forecourt, the building, the trees): outlined together when you point at the plot.
  objects: THREE.Object3D[];
}

interface Npc extends Thing {
  login: string;
  avatar: THREE.Group;
  person?: Person;
  home: THREE.Vector3;
  // Where they're strolling to right now.
  goal: THREE.Vector3;
  wait: number;
  tag: HTMLElement;
}

interface Remote extends Thing {
  avatar: THREE.Group;
  person?: Person;
  // Where they last said they were.
  goal: THREE.Vector3;
  ry: number;
  moving: boolean;
  tag: HTMLElement;
}

interface Lamp extends Thing {
  id: string;
  group: THREE.Group;
  bulb: THREE.Mesh;
  light: THREE.PointLight | null;
  on: boolean;
}

// The walk keys, and the action each one reports.
const WALK_KEYS = new Map<string, Action>([
  ["w", "walk-up"],
  ["arrowup", "walk-up"],
  ["s", "walk-down"],
  ["arrowdown", "walk-down"],
  ["a", "walk-left"],
  ["arrowleft", "walk-left"],
  ["d", "walk-right"],
  ["arrowright", "walk-right"],
]);

const yaw = (f: Facing) => (f * Math.PI) / 2;
// (x, z) turned by angle `a` around y, the same way three.js turns an object by rotation.y = a.
const rotate = (x: number, z: number, a: number) => new THREE.Vector3(x * Math.cos(a) + z * Math.sin(a), 0, -x * Math.sin(a) + z * Math.cos(a));
// How far apart two points are on the ground, ignoring height.
const apart = (a: THREE.Vector3, b: THREE.Vector3) => Math.hypot(a.x - b.x, a.z - b.z);

export class Lobby {
  private renderer: THREE.WebGLRenderer;
  private labels = new CSS2DRenderer();
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private clock = new THREE.Clock();
  private player: THREE.Group;
  private playerPerson?: Person;
  private playerTag: HTMLElement;
  private town = new THREE.Group();
  private placed: Placed[] = [];
  private plots: EmptyPlot[] = [];
  private solids: Box[] = [];
  private npcs: Npc[] = [];
  private remotes = new Map<string, Remote>();
  private residents = new Map<string, Resident>();
  private lamps: Lamp[] = [];
  private lit: Set<string>;
  private keys = new Set<string>();
  // The waypoints you're walking through, first one first; null when you're not going anywhere.
  private route: THREE.Vector3[] | null = null;
  // What to use when you get there: after a click, a goTo, or E on something far away.
  private useOnArrival: Thing | null = null;
  // Whether the route already took its one extra step towards a building's walls (see the arrival code).
  private nudged = false;
  // Where you were when the route last made progress: see STUCK.
  private stuck = { at: 0, x: 0, z: 0 };
  // The walk grid, built from the buildings' footprints. A footprint that changes (a house model loading in)
  // marks it dirty, and the next route rebuilds it.
  private walkGrid: Grid | null = null;
  private gridDirty = true;
  // The thing in reach of you, and the one you picked with Tab (which can be far away).
  private near: Thing | null = null;
  private highlighted: Thing | null = null;
  // The thing under the mouse, and when we last looked.
  private hover: Thing | null = null;
  private lastHover = 0;
  // The outline effect: the scene drawn into a buffer, an outline for the hovered thing (soft white) and one for
  // the Tab highlight (the ring's warm white), then the buffer put on screen in sRGB. Only used while something
  // is outlined, and never on low quality (then `composer` stays null).
  private composer: EffectComposer | null = null;
  private hoverPass: OutlinePass | null = null;
  private tabPass: OutlinePass | null = null;
  private ring = makeHighlight();
  // When the dash ends, when the next one may start (seconds on the clock), and the way it carries you when no
  // key or route says otherwise.
  private dashUntil = 0;
  private dashReadyAt = 0;
  private dashDir = new THREE.Vector3();
  // Shift went down and nothing else has been pressed since: letting go of it is a dash.
  private shiftAlone = false;
  private puffs: { group: THREE.Group; age: number }[] = [];
  private lastMap = 0;
  private scratch = new THREE.Vector3();
  private animationFrame = 0;
  private ray = new THREE.Raycaster();
  private resize: ResizeObserver;
  private zoom = ZOOM.start;
  private viewHalf = ZOOM.start;
  private focus: number | null = null;
  // The camera turns in quarter turns (Q / R); `angle` eases towards `turn × 90°`.
  private turn = 0;
  private angle = 0;
  private lastOffset: THREE.Vector3 | null = null;
  // Set when the camera should jump to you rather than glide (first frame, arriving in a neighbourhood).
  private snap = true;
  // What you may do right now: everything, until Vue says otherwise. Kept across neighbourhoods.
  private controls: Controls = { walk: true, dash: true, turn: true, targets: "all" };
  // The camera showing you a spot: where it glided from, the spot, how long the glides and the stay last, when it
  // set off (seconds on the clock), and what to call once it's back. Null when it's following you.
  private tour: { from: THREE.Vector3; to: THREE.Vector3; glide: number; hold: number; start: number; done: () => void } | null = null;
  // "left" while a window is open on the right of the screen: you're framed in the part that's left (see `frame`).
  private framing: "follow" | "left" = "follow";
  // The screen's width over its height, and whether it's too narrow to frame you beside a window (windows are a
  // bottom sheet there). Both set by `fit`, so the frame loop never has to measure the page.
  private aspect = 1;
  private narrow = false;
  private lastSent = { at: 0, key: "" };
  private sun: THREE.DirectionalLight;
  private builtCity = "";
  private builtFrom = "";
  private bounds = { minX: -30, maxX: 30, minZ: -20, maxZ: 20 };
  // Bumped on every rebuild, so models that finish loading late don't land in a neighbourhood that's gone.
  private generation = 0;
  private tick = 0;
  // The skyline's buildings: the ones between the camera and the town are hidden, so they never block the view.
  private skyline: THREE.Object3D[] = [];
  // Buildings that could stand between the camera and you: they fade while they do.
  private occluders: { box: THREE.Box3; materials: THREE.Material[]; faded: boolean }[] = [];

  constructor(
    private host: HTMLElement,
    private events: LobbyEvents,
    private opts: LobbyOptions,
  ) {
    this.lit = new Set(opts.litLamps);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(this.renderer.domElement);
    this.labels.domElement.className = "lobby-labels";
    host.appendChild(this.labels.domElement);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 600);
    // Early evening: a lilac sky light, a low warm sun, and enough dark for the lamps to matter.
    this.scene.add(new THREE.HemisphereLight(0xe4dcff, 0x6a6488, 1.9));
    this.sun = new THREE.DirectionalLight(0xffc9a0, 2.1);
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 200 });
    this.scene.add(this.sun, this.sun.target);
    // The far skyline fades into the evening.
    this.scene.fog = new THREE.Fog(0x9d8fc6, 95, 190);
    this.scene.add(this.town, this.ring);

    const you = this.makePerson(opts.login ?? "visitor", opts.login ? `@${opts.login}` : "you", "lobby-label you");
    this.player = you.avatar;
    this.playerTag = you.tag;
    this.scene.add(this.player);
    this.setCharacter(opts.character);

    this.applyQuality();
    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(host);
    this.fit();
    window.addEventListener("keydown", this.keydown);
    window.addEventListener("keyup", this.keyup);
    this.renderer.domElement.addEventListener("pointerdown", this.click);
    this.renderer.domElement.addEventListener("pointermove", this.pointerMove);
    this.renderer.domElement.addEventListener("pointerleave", this.pointerLeave);
    this.renderer.domElement.addEventListener("wheel", this.wheel, { passive: false });
    this.loop();
    // Development only: poke at the lobby from the browser console.
    if (import.meta.env.DEV) (window as unknown as { lobby: Lobby }).lobby = this;
  }

  // ---- What Vue tells the lobby ----

  /** Who lives where, across the whole city: rings and cards come from this. */
  setResidents(residents: Map<string, Resident>) {
    this.residents = residents;
    this.paintRing(this.player, this.opts.login);
    this.badge(this.playerTag, this.opts.login);
    for (const n of this.npcs) {
      this.paintRing(n.avatar, n.login);
      this.badge(n.tag, n.login);
    }
    for (const [login, r] of this.remotes) {
      this.paintRing(r.avatar, login);
      this.badge(r.tag, login);
    }
  }

  /** Builds a neighbourhood. Moving to another one puts you at its entrance. */
  setNeighbourhood(n: Neighbourhood, houses: CityHouse[]) {
    // The city stream re-sends the city often. Only rebuild if what's drawn changed.
    const key = JSON.stringify([n.city, houses.map((h) => [h.id, h.name, h.status, h.demo, h.plot, h.rooms.map((r) => [r.status, r.occupant?.login ?? null])])]);
    if (key === this.builtFrom) return;
    const arriving = n.city !== this.builtCity;
    this.builtCity = n.city;
    this.builtFrom = key;
    const gen = ++this.generation;
    removeLabels(this.town);
    disposeTree(this.town);
    this.town.clear();
    this.placed = [];
    this.plots = [];
    this.solids = [];
    this.npcs = [];
    this.lamps = [];
    this.skyline = [];
    this.occluders = [];
    const rand = seeded(`decor:${n.city}`);
    const tex = textures();
    const { minX, maxX, minZ, maxZ } = n.bounds;
    const width = maxX - minX;
    const depth = maxZ - minZ;
    this.bounds = { minX: minX - 2, maxX: maxX + 2, minZ: minZ - 2, maxZ: maxZ + 2 };

    // Grass to the horizon, asphalt under the whole town; blocks sit on top, a curb higher, ringed by sidewalk.
    this.flat(tex.grass, 0, 0, width + 260, depth + 260, 4, -0.02).name = "ground";
    this.flat(tex.asphalt, 0, 0, width, depth, 6, 0.0).name = "ground";
    for (const b of n.blocks) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(b.width + 1.6, 0.14, b.depth + 1.6), groundMaterial(tex.sidewalk, b.width + 1.6, b.depth + 1.6, 3));
      curb.position.set(b.x, 0.07, b.z);
      curb.receiveShadow = true;
      curb.name = "ground";
      this.town.add(curb);
      const surface = b.kind === "market" ? tex.paving : b.kind === "park" ? tex.park : tex.grass;
      this.flat(surface, b.x, b.z, b.width - 0.4, b.depth - 0.4, b.kind === "market" ? 4 : 5, 0.145).name = "ground";
      if (b.kind === "market") this.market(b, rand, gen);
      if (b.kind === "park") for (let i = 0; i < 9; i++) this.tree(b.x + (rand() - 0.5) * (b.width - 3), b.z + (rand() - 0.5) * (b.depth - 3), rand, gen);
    }
    this.streetMarkings(n);

    // Houses, shops, towers and tree lots.
    const byId = new Map(houses.map((h) => [h.id, h]));
    for (const p of n.plots) {
      const lot = p.lot;
      if (lot.kind === "house") {
        const house = byId.get(lot.houseId);
        if (house) this.placeHouse(house, p.x, p.z, p.facing, gen);
        continue;
      }
      // Everything else is empty and up for rent: a target you reach from any side, its ring at the front.
      const front = frontOf(p, PLOT / 2 + 0.4);
      const door = new THREE.Vector3(front.x, 0, front.z);
      // A tree lot has no walls: its footprint is the ground the trees stand on, and you may walk right in.
      const size = lot.kind === "shop" ? 5.6 : lot.kind === "tower" ? 5.8 : PLOT - 2.5;
      const box = lot.kind === "trees" ? footprint(p.x, p.z, p.facing, size, size) : this.solid(p.x, p.z, p.facing, size, size);
      const plot: EmptyPlot = { key: p.key, objects: [], box, door, target: { kind: "empty", plot: { key: p.key, lot: lot.kind, x: p.x, z: p.z } }, spot: door.clone() };
      this.plots.push(plot);
      if (lot.kind === "trees") {
        for (let i = 0; i < lot.count; i++) this.tree(p.x + (rand() - 0.5) * (PLOT - 2.5), p.z + (rand() - 0.5) * (PLOT - 2.5), rand, gen, plot);
        continue;
      }
      // Shop forecourts are paved; a tower stands on its own square. Clicking either one means "that plot".
      const court = this.flat(tex.paving, p.x, p.z, PLOT - 0.6, PLOT - 0.6, 4, 0.15);
      court.name = "ground";
      court.userData.plotKey = p.key;
      plot.objects.push(court);
      const url = lot.kind === "shop" ? SHOPS[lot.variant] : TOWERS[lot.variant];
      this.load(gen, loadModel(url, size), (m) => {
        m.position.set(p.x, 0.14, p.z);
        m.rotation.y = yaw(p.facing);
        m.userData.plotKey = p.key;
        plot.objects.push(m);
        this.occluder(m);
      });
    }

    // Lamps at the crossings (light them all), traffic lights at a few.
    for (const l of n.lamps) this.addLamp(l.id, new THREE.Vector3(l.x, 0, l.z));
    for (const t of n.trafficLights) {
      this.load(gen, loadModel(STREET.trafficLight, 3.4, "height"), (m) => {
        m.position.set(t.x, 0.14, t.z);
        m.rotation.y = yaw(t.facing);
      });
    }

    // The rest of the city, beyond the last street: seen, not walked.
    for (const s of n.skyline) {
      this.load(gen, loadModel(SKYLINE[s.variant], s.scale * 1.4, "height"), (m) => {
        m.position.set(s.x, 0, s.z);
        m.rotation.y = yaw(s.facing);
        this.skyline.push(m);
      });
    }

    // The walk grid, from every footprint placed above. House models that load later refine theirs: see `grid`.
    this.gridDirty = true;
    this.grid();

    if (arriving) {
      this.player.position.set(n.spawn.x, 0, n.spawn.z);
      this.stop();
      this.snap = true;
      play("arrive");
    }
    // The old town is gone, and so is anything in it you were heading for, had highlighted or pointed at. People
    // who are really online live outside the town, so they stay.
    if (this.useOnArrival && !this.isRemote(this.useOnArrival)) this.useOnArrival = null;
    if (this.highlighted && !this.isRemote(this.highlighted)) this.clearHighlight();
    if (this.hover && !this.isRemote(this.hover)) this.setHover(null);
  }

  /** Your character. Swaps live, for the onboarding's "pick your look". */
  setCharacter(character: string | null) {
    loadPerson(this.opts.login ?? "visitor", character)
      .then((p) => {
        if (this.playerPerson) this.player.remove(this.playerPerson.object);
        this.playerPerson = p;
        this.dress(this.player, p);
      })
      .catch(() => undefined);
  }

  setQuality(quality: "high" | "low", reduceMotion: boolean) {
    this.opts.quality = quality;
    this.opts.reduceMotion = reduceMotion;
    this.applyQuality();
  }

  /** Zooms in on your character (for the onboarding), or back out. */
  focusOnPlayer(on: boolean) {
    this.focus = on ? 4.5 : null;
  }

  /** Turns the camera a quarter turn: +1 one way (R), -1 the other (Q). Not while turning is switched off. */
  rotate(by: 1 | -1) {
    this.turnView(by, true);
  }

  /**
   * Switches controls on or off; whatever isn't mentioned stays as it was. Walking off: keys and clicks don't move
   * you, and a route you're on stops. Dash off: Shift does nothing. Turn off: Q and R do nothing. Targets
   * "houses": houses are the only things to aim at (Tab, reach, hover and clicks pass over everything else).
   */
  setControls(c: Partial<Controls>) {
    const { walk = this.controls.walk, dash = this.controls.dash, turn = this.controls.turn, targets = this.controls.targets } = c;
    this.controls = { walk, dash, turn, targets };
    if (!walk) {
      this.keys.clear();
      this.stop();
    }
    // Anything you'd picked out that isn't a target any more is let go.
    if (this.useOnArrival && !this.allowed(this.useOnArrival)) this.stop();
    if (this.highlighted && !this.allowed(this.highlighted)) this.clearHighlight();
    if (this.hover && !this.allowed(this.hover)) this.setHover(null);
  }

  /**
   * Shows you a spot: the camera leaves you, glides to (x, z), stays there `hold` seconds, and glides back. You
   * stand still meanwhile, and walking, dashing and turning wait. Resolves once the camera is back with you. With
   * calm motion it cuts instead of gliding. A second call while one is running takes over from where the camera
   * is (the first one resolves straight away).
   */
  showSpot(x: number, z: number, opts: { hold?: number } = {}): Promise<void> {
    this.endTour();
    this.keys.clear();
    this.stop();
    this.dashUntil = 0;
    this.shiftAlone = false;
    // The point the camera looks at right now: it starts from there.
    const from = this.lastOffset ? this.camera.position.clone().sub(this.lastOffset).setY(0) : this.player.position.clone().setY(0);
    return new Promise((resolve) => {
      this.tour = {
        from,
        to: new THREE.Vector3(x, 0, z),
        glide: this.opts.reduceMotion ? 0 : TOUR.glide,
        hold: Math.max(0, opts.hold ?? TOUR.hold),
        start: this.clock.elapsedTime,
        done: resolve,
      };
    });
  }

  /**
   * How the camera frames you. "left": a window is open on the right of the screen, so the camera zooms in and
   * slides over until you stand in the part of the screen that's left, about a quarter of the way across (on a
   * narrow screen, where windows are bottom sheets, it only zooms). "follow": back to normal, at the zoom the wheel
   * chose. Eased either way, unless motion is calm.
   */
  frame(mode: "follow" | "left") {
    this.framing = mode;
  }

  /** Walks to a house's door, then selects it. */
  goTo(houseId: string) {
    const p = this.placed.find((x) => x.house.id === houseId);
    if (p) this.walkToward(p);
  }

  /**
   * A dash (Shift), the way you're facing, standing still or not: an instant hop forward when the ground there is
   * free, then a burst of speed. Then a breather before the next one.
   */
  dash() {
    if (!this.can("dash")) return;
    const now = this.clock.elapsedTime;
    if (now < this.dashReadyAt) return;
    const pos = this.player.position;
    // Dust where you took off, pointing the way you're going.
    const puff = makePuff();
    puff.position.copy(pos).setY(0);
    puff.rotation.y = this.player.rotation.y;
    this.scene.add(puff);
    this.puffs.push({ group: puff, age: 0 });
    // The avatar faces +z, turned by rotation.y: that's the way to go.
    this.dashDir.set(Math.sin(this.player.rotation.y), 0, Math.cos(this.player.rotation.y));
    const b = this.bounds;
    const hopX = THREE.MathUtils.clamp(pos.x + this.dashDir.x * DASH.hop, b.minX, b.maxX);
    const hopZ = THREE.MathUtils.clamp(pos.z + this.dashDir.z * DASH.hop, b.minZ, b.maxZ);
    // Never through a wall: the landing and the halfway point must both be clear.
    if (!this.blocked(hopX, hopZ) && !this.blocked((pos.x + hopX) / 2, (pos.z + hopZ) / 2)) pos.set(hopX, pos.y, hopZ);
    this.dashUntil = now + DASH.length;
    this.dashReadyAt = this.dashUntil + DASH.cooldown;
    play("dash");
    this.events.onAction("dash");
  }

  /** Fast travel: puts you at the nearest free spot (not inside a building) and snaps the camera to you. */
  teleport(x: number, z: number) {
    const spot = this.freeSpotNear(x, z);
    this.player.position.set(spot.x, 0, spot.z);
    this.stop();
    this.dashUntil = 0;
    this.clearHighlight();
    this.setHover(null);
    this.snap = true;
    play("arrive");
  }

  /** Walks to the sidewalk in front of an empty plot, then selects it. */
  goToPlot(key: string) {
    const p = this.plots.find((x) => x.key === key);
    if (p) this.walkToward(p);
  }

  /** Walks to just beside someone (really online, or a flatmate out front), then selects them. */
  goToPerson(login: string) {
    const who = this.remotes.get(login) ?? this.npcs.find((n) => n.login === login && n.avatar.visible);
    if (who) this.walkToward(who);
  }

  /** Uses what you highlighted, else what you're standing next to. Something far away: walk there first. */
  interact() {
    const thing = this.highlighted ?? this.near;
    // Not while the camera is away showing you something.
    if (!thing || this.tour) return;
    if (this.distanceTo(thing) < REACH) this.use(thing);
    else if (this.controls.walk) this.walkToward(thing);
  }

  /** Highlights the next (or previous) target on screen, nearest to you first, round and round. */
  cycle(by: 1 | -1) {
    const here = this.player.position;
    const onScreen = this.things()
      .filter((t) => this.onScreen(t.spot))
      .sort((a, b) => apart(a.spot, here) - apart(b.spot, here));
    if (!onScreen.length) return;
    const at = this.highlighted ? onScreen.indexOf(this.highlighted) : -1;
    // Nothing highlighted yet (or it left the screen): start from the nearest, or the farthest going backwards.
    const next = at < 0 ? (by > 0 ? 0 : onScreen.length - 1) : (at + by + onScreen.length) % onScreen.length;
    this.highlighted = onScreen[next];
    play("select");
    this.events.onNear(this.highlighted.target);
  }

  /** Drops the highlight (Escape, or a card closing): the prompt goes back to whatever is in reach. */
  clearHighlight() {
    this.highlighted = null;
    this.near = this.reach();
    this.events.onNear(this.near?.target ?? null);
  }

  emote(name: Emote) {
    this.playerPerson?.play(`emote-${name}`, true);
    this.bubble(this.player, name);
    play("emote");
  }

  lampCount(): { lit: number; total: number } {
    return { lit: this.lamps.filter((l) => l.on).length, total: this.lamps.length };
  }

  // ---- Everyone else who's online here ----

  addRemote(p: { login: string; name: string | null; avatar: string | null; x: number; z: number; ry: number; moving: boolean }) {
    if (p.login === this.opts.login || this.remotes.has(p.login)) return;
    const name = p.name ?? p.login;
    const { avatar, tag } = this.makePerson(p.login, name, "lobby-label online");
    // Someone who just arrived stands at the neighbourhood's entrance, next to where you came in.
    const start = p.x || p.z ? new THREE.Vector3(p.x, 0, p.z) : this.player.position.clone().add(new THREE.Vector3(1.5, 0, 1));
    avatar.position.copy(start);
    avatar.rotation.y = p.ry;
    this.scene.add(avatar);
    const remote: Remote = { avatar, goal: start.clone(), ry: p.ry, moving: p.moving, tag, target: { kind: "person", login: p.login, name }, spot: avatar.position };
    this.remotes.set(p.login, remote);
    loadPerson(p.login, p.avatar)
      .then((person) => {
        if (this.remotes.get(p.login) !== remote) return;
        remote.person = person;
        this.dress(avatar, person);
      })
      .catch(() => undefined);
    for (const n of this.npcs) if (n.login === p.login) n.avatar.visible = false;
  }

  moveRemote(login: string, x: number, z: number, ry: number, moving: boolean) {
    const r = this.remotes.get(login);
    if (!r) return;
    r.goal.set(x, 0, z);
    r.ry = ry;
    r.moving = moving;
  }

  emoteRemote(login: string, name: Emote) {
    const r = this.remotes.get(login);
    if (!r) return;
    r.person?.play(`emote-${name}`, true);
    this.bubble(r.avatar, name);
  }

  removeRemote(login: string) {
    const r = this.remotes.get(login);
    if (!r) return;
    removeLabels(r.avatar);
    this.scene.remove(r.avatar);
    disposeTree(r.avatar);
    this.remotes.delete(login);
    if (this.useOnArrival === r) this.stop();
    if (this.highlighted === r) this.clearHighlight();
    if (this.hover === r) this.setHover(null);
    for (const n of this.npcs) if (n.login === login) n.avatar.visible = true;
  }

  clearRemotes() {
    for (const login of [...this.remotes.keys()]) this.removeRemote(login);
  }

  dispose() {
    cancelAnimationFrame(this.animationFrame);
    this.endTour();
    this.resize.disconnect();
    window.removeEventListener("keydown", this.keydown);
    window.removeEventListener("keyup", this.keyup);
    this.renderer.domElement.removeEventListener("pointerdown", this.click);
    this.renderer.domElement.removeEventListener("pointermove", this.pointerMove);
    this.renderer.domElement.removeEventListener("pointerleave", this.pointerLeave);
    this.renderer.domElement.removeEventListener("wheel", this.wheel);
    removeLabels(this.scene);
    disposeTree(this.scene);
    this.dropComposer();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.domElement.remove();
  }

  // ---- Targets: what you can aim at, and using it ----

  /** Every target in the neighbourhood right now. */
  private things(): Thing[] {
    if (this.controls.targets === "houses") return [...this.placed];
    return [...this.placed, ...this.plots, ...this.npcs.filter((n) => n.avatar.visible), ...this.remotes.values(), ...this.lamps];
  }

  /** Whether a thing is a target at all right now: everything is, unless only houses are (see `setControls`). */
  private allowed(t: Thing): boolean {
    return this.controls.targets === "all" || t.target.kind === "house";
  }

  /** Whether you may walk, dash or turn the camera right now: it's switched on, and the camera isn't away. */
  private can(what: "walk" | "dash" | "turn"): boolean {
    return this.controls[what] && !this.tour;
  }

  /** A quarter turn of the camera, when turning is allowed; `tell` reports it to Vue. */
  private turnView(by: 1 | -1, tell: boolean) {
    if (!this.can("turn")) return;
    this.turn += by;
    if (tell) this.events.onAction(by < 0 ? "turn-left" : "turn-right");
  }

  /** Ends a camera tour where it is, and lets whoever was waiting for it go on. */
  private endTour() {
    const tour = this.tour;
    this.tour = null;
    tour?.done();
  }

  /** Whether a spot is inside the view: projected through the camera, it lands within the screen's edges. */
  private onScreen(spot: THREE.Vector3): boolean {
    const v = this.scratch.copy(spot).project(this.camera);
    return Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1;
  }

  /** How far you are from a thing: to a building's walls (any side), else to its spot. */
  private distanceTo(thing: Thing): number {
    return thing.box ? distanceToBox(this.player.position, thing.box) : apart(thing.spot, this.player.position);
  }

  /** The thing you're standing next to: a lamp first (they're small), then a person, then a building's walls. */
  private reach(): Thing | null {
    let best: Thing | null = null;
    let range = REACH * 0.9;
    // Whether `t` beats the best so far; if so, it sets the bar.
    const closer = (t: Thing): boolean => {
      const d = this.distanceTo(t);
      if (d >= range) return false;
      range = d;
      return true;
    };
    // Only houses are targets: skip straight to them.
    const all = this.controls.targets === "all";
    if (all) for (const l of this.lamps) if (closer(l)) best = l;
    if (best) return best;
    range = REACH;
    if (all) for (const n of this.npcs) if (n.avatar.visible && closer(n)) best = n;
    if (all) for (const r of this.remotes.values()) if (closer(r)) best = r;
    if (best) return best;
    for (const p of this.placed) if (closer(p)) best = p;
    if (all) for (const p of this.plots) if (closer(p)) best = p;
    return best;
  }

  private isRemote(t: Thing): boolean {
    for (const r of this.remotes.values()) if (r === t) return true;
    return false;
  }

  /** Uses a thing you're next to: a lamp flips, anything else is for Vue to open. */
  private use(thing: Thing) {
    const lamp = this.lamps.find((l) => l === thing);
    if (lamp) this.toggleLamp(lamp);
    else this.events.onSelect(thing.target);
  }

  /**
   * Sets off for a thing, to use it on arrival. A building can be used from any side: you head for the free
   * ground within reach of its walls that's nearest by foot. For a person, you stop a step away on your side of
   * them.
   */
  private walkToward(thing: Thing) {
    // Setting off for something else drops the Tab highlight, so what's in reach on arrival is what you use.
    if (this.highlighted && this.highlighted !== thing) this.clearHighlight();
    if (thing.box) {
      // The ring moves to the nearest point of the reach band to you, which is the side you'll arrive on.
      const near = nearestOnBox(this.player.position, grow(thing.box, REACH));
      thing.spot.set(near.x, 0, near.z);
      // Any cell whose centre is a little less than REACH from the walls: stopping within a step of it still
      // leaves you in reach.
      this.routeTo(grow(thing.box, REACH - GRID_CELL / 2), thing);
    } else if (thing.target.kind === "person") this.routeTo(this.beside(thing, new THREE.Vector3()), thing);
    else this.routeTo(thing.spot, thing);
  }

  /**
   * Sets off along a route to a point, or to any free cell inside a box, and remembers what to use on arrival.
   * With no way through (an island), you walk straight at it as far as the walls allow, and `step` gives up
   * once you stop making progress.
   */
  private routeTo(goal: Point | Box, use: Thing | null = null) {
    const here = { x: this.player.position.x, z: this.player.position.z };
    const grid = this.grid();
    const found = findPath(grid, here, goal);
    const points = found ? smooth(grid, found).slice(1) : ["minX" in goal ? nearestOnBox(here, goal) : goal];
    this.route = points.map((p) => new THREE.Vector3(p.x, 0, p.z));
    this.useOnArrival = use;
    this.nudged = false;
    this.stuck = { at: this.clock.elapsedTime, x: here.x, z: here.z };
  }

  /** Ends the route, wherever you are. A building you were heading for gets its ring back at its door. */
  private stop() {
    const u = this.useOnArrival;
    if (u?.door) u.spot.copy(u.door);
    this.route = null;
    this.useOnArrival = null;
  }

  /** Whether you're close enough to use what you're walking to, short of the route's end. */
  private arrived(thing: Thing): boolean {
    if (thing.box) return distanceToBox(this.player.position, thing.box) < REACH;
    // Close enough to a person to talk: they may be standing against a wall.
    return thing.target.kind === "person" && apart(thing.spot, this.player.position) < 1.2;
  }

  /** The walk grid, rebuilt when a footprint changed. Cells within a person's width (and a half cell) of a wall are blocked. */
  private grid(): Grid {
    if (!this.walkGrid || this.gridDirty) {
      // Padding by half a cell more than a person's width means a free cell is walkable over its whole area, so a
      // straight leg between two free cells never scrapes a wall.
      this.walkGrid = buildGrid(this.bounds, this.solids, GRID_CELL, RADIUS + GRID_CELL / 2);
      this.gridDirty = false;
    }
    return this.walkGrid;
  }

  /** The point one step away from someone, towards you. Writes into `out`. */
  private beside(who: Thing, out: THREE.Vector3): THREE.Vector3 {
    out.subVectors(this.player.position, who.spot).setY(0);
    if (out.lengthSq() < 0.01) out.set(1, 0, 0);
    return out.normalize().add(who.spot).setY(0);
  }

  /** The nearest spot to (x, z) inside the bounds that isn't inside a building: circles outward until one is free. */
  private freeSpotNear(x: number, z: number): { x: number; z: number } {
    const b = this.bounds;
    for (let r = 0; r < 12; r += 0.5) {
      const tries = r ? Math.ceil(r * 8) : 1;
      for (let i = 0; i < tries; i++) {
        const a = (i / tries) * Math.PI * 2;
        const px = THREE.MathUtils.clamp(x + Math.cos(a) * r, b.minX, b.maxX);
        const pz = THREE.MathUtils.clamp(z + Math.sin(a) * r, b.minZ, b.maxZ);
        if (!this.blocked(px, pz)) return { x: px, z: pz };
      }
    }
    return { x: THREE.MathUtils.clamp(x, b.minX, b.maxX), z: THREE.MathUtils.clamp(z, b.minZ, b.maxZ) };
  }

  /** What gets an outline when a thing is hovered or highlighted: its model(s), but not the ring at a person's feet. */
  private outlineOf(thing: Thing): THREE.Object3D[] {
    if (thing.target.kind === "house") return [(thing as Placed).group];
    if (thing.target.kind === "empty") return (thing as EmptyPlot).objects;
    if (thing.target.kind === "lamp") return [(thing as Lamp).group];
    return (thing as Npc | Remote).avatar.children.filter((c) => c.name !== "ring");
  }

  /** Remembers what the mouse is over, shows a pointer cursor over it, and tells Vue when that changes. */
  private setHover(thing: Thing | null) {
    if (thing === this.hover) return;
    this.hover = thing;
    this.renderer.domElement.style.cursor = thing ? "pointer" : "";
    this.events.onHover(thing?.target ?? null);
  }

  // ---- Building the neighbourhood ----

  /** A flat ground surface. */
  private flat(texture: THREE.Texture, x: number, z: number, w: number, d: number, tile: number, y: number): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), groundMaterial(texture, w, d, tile));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    this.town.add(m);
    return m;
  }

  /** Dashed centre lines along every street, and zebra crossings at every crossing. One draw call each. */
  private streetMarkings(n: Neighbourhood) {
    const white = new THREE.MeshBasicMaterial({ color: 0xece6da, transparent: true, opacity: 0.85 });
    const dashes: THREE.Matrix4[] = [];
    const stripes: THREE.Matrix4[] = [];
    const flat = (spin: number) => new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, spin));
    const nearCrossing = (x: number, z: number) => n.intersections.some((p) => Math.abs(p.x - x) < ROAD * 1.3 && Math.abs(p.z - z) < ROAD * 1.3);
    for (const s of n.streets) {
      const alongX = s.width > s.depth;
      const length = alongX ? s.width : s.depth;
      for (let t = -length / 2 + 1; t < length / 2; t += 2.2) {
        const x = alongX ? s.x + t : s.x;
        const z = alongX ? s.z : s.z + t;
        if (nearCrossing(x, z)) continue;
        dashes.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0.012, z), flat(alongX ? 0 : Math.PI / 2), new THREE.Vector3(1.1, 0.14, 1)));
      }
    }
    for (const p of n.intersections) {
      for (const [dx, dz, across] of [
        [0, ROAD * 0.95, true],
        [0, -ROAD * 0.95, true],
        [ROAD * 0.95, 0, false],
        [-ROAD * 0.95, 0, false],
      ] as const) {
        for (let k = -1.5; k <= 1.5; k += 0.75) {
          const x = p.x + dx + (across ? k : 0);
          const z = p.z + dz + (across ? 0 : k);
          stripes.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0.012, z), flat(across ? Math.PI / 2 : 0), new THREE.Vector3(1.3, 0.38, 1)));
        }
      }
    }
    for (const list of [dashes, stripes]) {
      const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), white, list.length);
      list.forEach((m, i) => mesh.setMatrixAt(i, m));
      // Markings are paint on the road, not something to aim at: the mouse looks straight through them.
      mesh.raycast = () => undefined;
      this.town.add(mesh);
    }
  }

  /** The market square: parasols over stalls, everyone's meeting point. */
  private market(b: { x: number; z: number; width: number; depth: number }, rand: () => number, gen: number) {
    for (let i = 0; i < 8; i++) {
      const x = b.x + (rand() - 0.5) * (b.width - 4);
      const z = b.z + (rand() - 0.5) * (b.depth - 4);
      const turn = rand() * Math.PI * 2;
      this.load(gen, loadModel(PARASOLS[i % 2], 1.9), (m) => {
        m.position.set(x, 0.15, z);
        m.rotation.y = turn;
      });
    }
  }

  /** A tree. On a tree lot it carries the plot's key, so clicking it means "that plot". */
  private tree(x: number, z: number, rand: () => number, gen: number, plot?: EmptyPlot) {
    const big = rand() < 0.6;
    const height = big ? 3.6 + rand() * 1.4 : 2.4 + rand();
    const turn = rand() * Math.PI * 2;
    this.load(gen, loadModel(TREES[big ? 0 : 1], height, "height"), (m) => {
      m.position.set(x, 0.14, z);
      m.rotation.y = turn;
      if (plot) {
        m.userData.plotKey = plot.key;
        plot.objects.push(m);
      }
    });
  }

  /**
   * Lets a building fade when it stands between the camera and you. It gets its own copy of its materials, since
   * models share theirs and we only want this one to fade.
   */
  private occluder(model: THREE.Object3D) {
    const materials: THREE.Material[] = [];
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : mesh.material.clone();
      materials.push(...(Array.isArray(mesh.material) ? mesh.material : [mesh.material]));
    });
    model.updateMatrixWorld(true);
    this.occluders.push({ box: new THREE.Box3().setFromObject(model), materials, faded: false });
  }

  /** A footprint you can't walk through, turned with its plot. */
  private solid(x: number, z: number, facing: Facing, w: number, d: number): Box {
    const box = footprint(x, z, facing, w, d);
    this.solids.push(box);
    return box;
  }

  /** Adds a model once it has loaded, unless the neighbourhood was rebuilt meanwhile. */
  private load(gen: number, promise: Promise<THREE.Group>, place: (m: THREE.Group) => void) {
    promise
      .then((m) => {
        if (gen !== this.generation) return;
        place(m);
        this.town.add(m);
      })
      .catch(() => undefined);
  }

  /** A real house: placeholder first, its model when loaded, the room board by the door, flatmates out front. */
  private placeHouse(house: CityHouse, x: number, z: number, facing: Facing, gen: number) {
    const placeholder = makeHouse(house);
    const group = new THREE.Group();
    group.add(placeholder.group);
    group.position.set(x, 0.14, z);
    group.rotation.y = yaw(facing);
    group.userData.houseId = house.id;
    group.add(this.label(house.name, house.demo ? "lobby-label house demo" : "lobby-label house", 6.4));
    this.town.add(group);
    const box = this.solid(x, z, facing, placeholder.halfWidth * 2, placeholder.halfDepth * 2);
    const placed: Placed = { house, group, box, door: new THREE.Vector3(), npcs: [], target: { kind: "house", house }, spot: new THREE.Vector3() };
    this.placed.push(placed);
    this.fitDoor(placed, facing, placeholder.halfDepth);

    if (house.status === "making") {
      // A building site: fences and cones around the slab.
      for (const [dx, dz, r] of [
        [-2.6, 2.2, 0],
        [2.6, 2.2, 0],
        [-3.2, 0, Math.PI / 2],
        [3.2, 0, Math.PI / 2],
      ] as const) {
        const at = rotate(dx, dz, yaw(facing));
        this.load(gen, loadModel(STREET.fence, 2.2), (m) => {
          m.position.set(x + at.x, 0.14, z + at.z);
          m.rotation.y = yaw(facing) + r;
        });
      }
      for (const dx of [-1.2, 1.2]) {
        const at = rotate(dx, 3.2, yaw(facing));
        this.load(gen, loadModel(STREET.cone, 0.7, "height"), (m) => m.position.set(x + at.x, 0.14, z + at.z));
      }
    } else {
      loadHouse(house.id, 5.2)
        .then((model) => {
          if (gen !== this.generation) return;
          const local = new THREE.Box3().setFromObject(model);
          placeholder.group.visible = false;
          group.add(model);
          this.occluder(model);
          const board = makeRoomBoard(house);
          board.position.set(local.max.x + 0.6, 0, local.max.z + 0.3);
          group.add(board);
          // The real footprint replaces the placeholder's; the walk grid follows on the next route.
          Object.assign(box, footprint(x, z, facing, local.max.x - local.min.x, local.max.z - local.min.z));
          this.gridDirty = true;
          this.fitDoor(placed, facing, local.max.z);
        })
        .catch(() => undefined);
    }

    // The flatmates hang around in front (unless they're online: then it's really them walking).
    house.rooms
      .filter((r) => r.occupant)
      .forEach((r, k) => {
        const login = r.occupant!.login;
        const name = r.occupant!.name ?? login;
        const { avatar, tag } = this.makePerson(login, name, "lobby-label small");
        avatar.visible = !this.remotes.has(login) && login !== this.opts.login;
        this.town.add(avatar);
        const npc: Npc = { login, avatar, home: new THREE.Vector3(), goal: new THREE.Vector3(), wait: Math.random() * 3, tag, target: { kind: "person", login, name }, spot: avatar.position };
        npc.home.copy(placed.door).add(rotate((k - 1) * 1.3, 0.9, yaw(facing)));
        npc.goal.copy(npc.home);
        avatar.position.copy(npc.home);
        this.npcs.push(npc);
        placed.npcs.push(npc);
        loadPerson(login)
          .then((p) => {
            if (gen !== this.generation) return;
            npc.person = p;
            this.dress(avatar, p);
          })
          .catch(() => undefined);
      });
  }

  /** Puts the door just in front of the house's face (`front` units from its centre), moving the flatmates along. */
  private fitDoor(p: Placed, facing: Facing, front: number) {
    const dir = FACING_DIR[facing];
    const door = new THREE.Vector3(p.group.position.x + dir.x * (front + 1.1), 0, p.group.position.z + dir.z * (front + 1.1));
    const first = p.door.lengthSq() === 0;
    const moved = door.clone().sub(p.door);
    p.door.copy(door);
    // The ring rests at the door, unless you're on your way to this house from another side.
    if (this.useOnArrival !== p) p.spot.copy(door);
    if (first) return;
    for (const n of p.npcs) {
      n.home.add(moved);
      n.goal.add(moved);
      n.avatar.position.add(moved);
    }
  }

  private addLamp(id: string, position: THREE.Vector3) {
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.6, 8), new THREE.MeshStandardMaterial({ color: 0x2c2a33, roughness: 0.6, metalness: 0.4 }));
    post.position.y = 1.3;
    post.castShadow = true;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), new THREE.MeshStandardMaterial({ color: 0x77736c, emissive: LAMP_LIGHT, emissiveIntensity: 0 }));
    bulb.position.y = 2.7;
    g.add(post, bulb);
    g.position.copy(position);
    g.userData.lampId = id;
    this.town.add(g);
    const lamp: Lamp = { id, group: g, spot: position.clone(), bulb, light: null, on: false, target: { kind: "lamp", id, on: false } };
    this.lamps.push(lamp);
    this.setLamp(lamp, this.lit.has(id));
  }

  private setLamp(lamp: Lamp, on: boolean) {
    lamp.on = on;
    lamp.target = { kind: "lamp", id: lamp.id, on };
    const m = lamp.bulb.material as THREE.MeshStandardMaterial;
    m.emissiveIntensity = on ? 2.2 : 0;
    m.color.set(on ? 0xfff1d6 : 0x77736c);
    // Real light only where it's lit and the machine can afford it.
    if (on && this.opts.quality === "high" && !lamp.light) {
      lamp.light = new THREE.PointLight(LAMP_LIGHT, 20, 10, 1.6);
      lamp.light.position.copy(lamp.spot).setY(2.5);
      this.town.add(lamp.light);
    }
    if ((!on || this.opts.quality === "low") && lamp.light) {
      this.town.remove(lamp.light);
      lamp.light.dispose();
      lamp.light = null;
    }
  }

  private toggleLamp(lamp: Lamp) {
    this.setLamp(lamp, !lamp.on);
    if (lamp.on) this.lit.add(lamp.id);
    else this.lit.delete(lamp.id);
    play(lamp.on ? "lamp-on" : "lamp-off");
    this.events.onLamps([...this.lit]);
    // The prompt changes with the switch ("Light it" → "Switch it off"): say so.
    if (this.highlighted === lamp) this.events.onNear(lamp.target);
    else this.near = null;
  }

  // ---- People ----

  /** A placeholder person with a name tag (name, then their house) and a ring at their feet, in their house's colour. */
  private makePerson(login: string, name: string, tagClass: string): { avatar: THREE.Group; tag: HTMLElement } {
    const avatar = makeAvatar(colorFor(login));
    avatar.userData.login = login;
    avatar.userData.name = name;
    const label = this.label("", tagClass, 1.75);
    const who = document.createElement("span");
    who.className = "name";
    who.textContent = name;
    label.element.append(who);
    this.badge(label.element, login);
    avatar.add(label);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.58, 28), new THREE.MeshBasicMaterial({ color: NOBODY, transparent: true, opacity: 0.9 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.17;
    ring.name = "ring";
    avatar.add(ring);
    this.paintRing(avatar, login);
    return { avatar, tag: label.element };
  }

  private paintRing(avatar: THREE.Group, login: string | null) {
    const ring = avatar.getObjectByName("ring") as THREE.Mesh | undefined;
    if (!ring) return;
    const home = login ? this.residents.get(login) : undefined;
    (ring.material as THREE.MeshBasicMaterial).color.set(home ? colorFor(home.houseId) : NOBODY);
  }

  /**
   * The small badge after a name: their house, on the house's colour (the same as the ring at their feet), so
   * flatmates read as a group. Someone without a house gets none. Rebuilt whenever the residents change.
   */
  private badge(tag: HTMLElement, login: string | null) {
    tag.querySelector(".home")?.remove();
    const home = login ? this.residents.get(login) : undefined;
    if (!home) return;
    const el = document.createElement("span");
    el.className = "home";
    el.textContent = home.houseName.length > 12 ? `${home.houseName.slice(0, 11)}…` : home.houseName;
    const color = new THREE.Color(colorFor(home.houseId));
    el.style.background = `#${color.getHexString()}`;
    // Dark text on a light colour, white on a dark one. The colour's channels are linear, as luminance wants.
    const luminance = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
    el.style.color = luminance > 0.25 ? "#1d1d1f" : "#fff";
    tag.append(el);
  }

  /** Puts a loaded person in place of a placeholder avatar (keeping its name tag and ring). */
  private dress(avatar: THREE.Group, person: Person) {
    avatar.children.forEach((c) => {
      if (!(c instanceof CSS2DObject) && c.name !== "ring" && c !== person.object) c.visible = false;
    });
    avatar.add(person.object);
    person.object.visible = true;
  }

  private bubble(avatar: THREE.Object3D, name: Emote) {
    const el = document.createElement("div");
    el.className = `lobby-emote ${name}`;
    el.textContent = name === "yes" ? "👍" : "👎";
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", name === "yes" ? "thumbs up" : "thumbs down");
    const obj = new CSS2DObject(el);
    obj.position.set(0, 2.25, 0);
    avatar.add(obj);
    setTimeout(() => {
      el.remove();
      avatar.remove(obj);
    }, 2200);
  }

  private label(text: string, className: string, y: number): CSS2DObject {
    const el = document.createElement("div");
    el.className = className;
    el.textContent = text;
    const obj = new CSS2DObject(el);
    obj.position.set(0, y, 0);
    return obj;
  }

  // ---- Rendering, input, the frame loop ----

  private applyQuality() {
    const high = this.opts.quality === "high";
    this.renderer.setPixelRatio(high ? Math.min(window.devicePixelRatio, 2) : 1);
    this.renderer.shadowMap.enabled = high;
    this.sun.castShadow = high;
    for (const l of this.lamps) this.setLamp(l, l.on);
    // Outlines are for the machines that can afford them. On low quality, the cursor and the ring do the job.
    if (high && !this.composer) this.makeComposer();
    if (!high) this.dropComposer();
    this.fit();
  }

  /**
   * The outline effect. The scene is drawn into a buffer, each OutlinePass adds its edges, and the OutputPass
   * converts the buffer to sRGB on the way to the screen (without it, since the renderer outputs sRGB, every
   * colour would look washed out). Only used while something is outlined; see `loop`.
   */
  private makeComposer() {
    const size = this.renderer.getSize(new THREE.Vector2());
    const composer = new EffectComposer(this.renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));
    const outline = (color: number, strength: number) => {
      const pass = new OutlinePass(size, this.scene, this.camera);
      pass.visibleEdgeColor.set(color);
      // The part of the thing behind something else (a person behind a tree) still shows, faintly.
      pass.hiddenEdgeColor.set(color).multiplyScalar(0.3);
      pass.edgeStrength = strength;
      pass.edgeThickness = 1.5;
      pass.edgeGlow = 0.25;
      composer.addPass(pass);
      return pass;
    };
    this.hoverPass = outline(0xffffff, 2.5);
    this.tabPass = outline(HIGHLIGHT, 3.5);
    composer.addPass(new OutputPass());
    this.composer = composer;
  }

  private dropComposer() {
    if (!this.composer) return;
    for (const pass of this.composer.passes) pass.dispose();
    this.composer.dispose();
    this.composer = null;
    this.hoverPass = null;
    this.tabPass = null;
  }

  private fit() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.aspect = w / h;
    this.narrow = w < FRAMED.narrow;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    }
    this.project();
  }

  private project(half = this.viewHalf) {
    const width = this.halfWidth(half);
    Object.assign(this.camera, { left: -width, right: width, top: width / this.aspect, bottom: -width / this.aspect });
    this.camera.updateProjectionMatrix();
  }

  /** Half of the view's width on the ground, for a zoom of `half`. */
  private halfWidth(half = this.viewHalf): number {
    // A phone held upright is narrow: show a little less of the town rather than shrinking everyone.
    return this.aspect < 1 ? half * 0.85 : half;
  }

  /**
   * Where the camera aims to look: at you, or, with a window open on the right, at a point to your right, so you
   * stand about a quarter of the way across the screen. Writes into `out`.
   */
  private followPoint(out: THREE.Vector3): THREE.Vector3 {
    out.copy(this.player.position).setY(0);
    if (this.framing === "left" && !this.narrow) {
      // The screen's right, on the ground (the way D walks), turned with the camera. You're at the centre of the
      // screen plus `shift` to the left; the screen is 2 × halfWidth wide, so that puts you at FRAMED.at across.
      const right = rotate(1, -1, this.angle).normalize();
      const shift = (1 - 2 * FRAMED.at) * this.halfWidth();
      out.addScaledVector(right, shift);
    }
    return out;
  }

  private keydown = (e: KeyboardEvent) => {
    // Typing in a field elsewhere on the page isn't walking.
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    // Inside a sheet or a dialog (a house's inside, the big map, the keys), the keys belong to it. A floating card
    // isn't modal: you can still walk away from it.
    if (t?.closest?.('[aria-modal="true"], dialog')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const walk = WALK_KEYS.get(k);
    if (walk) {
      e.preventDefault();
      // A walk key held down repeats: walking goes on, but Vue only hears about the first press.
      if (this.can("walk")) {
        this.keys.add(k);
        this.stop();
        if (!e.repeat) this.events.onAction(walk);
      }
    }
    if (k === "tab") {
      // Tab picks targets only while the page itself has focus. Inside a card or a sheet it moves focus as usual.
      const focused = document.activeElement;
      if (!focused || focused === document.body || this.host.contains(focused)) {
        this.cycle(e.shiftKey ? -1 : 1);
        e.preventDefault();
      }
    }
    if (k === "escape") this.clearHighlight();
    // A tap of Shift dashes when you let go, unless another key was pressed meanwhile (Shift+Tab is "previous").
    if (k === "shift" && !e.repeat) this.shiftAlone = true;
    else if (e.shiftKey && !e.repeat) this.shiftAlone = false;
    if (k === "e" || k === "enter") this.interact();
    if (k === "q") this.turnView(-1, !e.repeat);
    if (k === "r") this.turnView(1, !e.repeat);
    if (k === "1") this.emote("yes");
    if (k === "2") this.emote("no");
  };

  private keyup = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    this.keys.delete(k);
    if (k === "shift" && this.shiftAlone) this.dash();
    this.shiftAlone = false;
  };

  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoom = THREE.MathUtils.clamp(this.zoom + Math.sign(e.deltaY) * 1.2, ZOOM.min, ZOOM.max);
  };

  /** What the mouse is on: a thing (a person, a house, an empty plot, a lamp), a point on the ground, or nothing. */
  private aim(e: PointerEvent): { thing: Thing | null; ground: THREE.Vector3 | null } {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(pointer, this.camera);
    // People are small: aim at a generous sphere around each one, nearest first. Unless only houses are targets.
    const all = this.controls.targets === "all";
    const people: (Npc | Remote)[] = all ? [...this.npcs.filter((n) => n.avatar.visible), ...this.remotes.values()] : [];
    const hitPerson = people
      .map((who) => ({ who, d: this.ray.ray.distanceSqToPoint(who.avatar.position.clone().setY(0.8)) }))
      .filter((x) => x.d < 1.6)
      .sort((x, y) => x.d - y.d)[0];
    if (hitPerson) return { thing: hitPerson.who, ground: null };
    for (const hit of this.ray.intersectObjects(this.town.children, true)) {
      // A house, an empty plot or a lamp: its model (or forecourt) carries the id, somewhere up the tree.
      let o: THREE.Object3D | null = hit.object;
      while (o && !o.userData.houseId && !o.userData.plotKey && !o.userData.lampId) o = o.parent;
      const { houseId, plotKey, lampId } = o?.userData ?? {};
      // Only houses are targets: look past a plot or a lamp, to whatever is behind it (the ground, usually).
      if (!all && !houseId && (plotKey || lampId)) continue;
      if (houseId) return { thing: this.placed.find((p) => p.house.id === houseId) ?? null, ground: null };
      if (plotKey) return { thing: this.plots.find((p) => p.key === plotKey) ?? null, ground: null };
      if (lampId) return { thing: this.lamps.find((l) => l.id === lampId) ?? null, ground: null };
      if (hit.object.name === "ground") {
        const b = this.bounds;
        return { thing: null, ground: new THREE.Vector3(THREE.MathUtils.clamp(hit.point.x, b.minX, b.maxX), 0, THREE.MathUtils.clamp(hit.point.z, b.minZ, b.maxZ)) };
      }
    }
    return { thing: null, ground: null };
  }

  // Click someone to see who they are; a house, a plot or a lamp to walk up to it and use it; the ground to walk there.
  // With walking switched off, only what's already in reach can be used. Nothing while the camera is away.
  private click = (e: PointerEvent) => {
    if (this.tour) return;
    const { thing, ground } = this.aim(e);
    if (thing?.target.kind === "person") this.events.onSelect(thing.target);
    else if (thing && this.controls.walk) this.walkToward(thing);
    else if (thing && this.distanceTo(thing) < REACH) this.use(thing);
    else if (ground && this.controls.walk) this.routeTo(ground);
  };

  // The same aim as a click, as the mouse moves (a few times a second, never for a finger): what it's over gets
  // an outline and a pointer cursor.
  private pointerMove = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    const now = performance.now();
    if (now - this.lastHover < HOVER_EVERY) return;
    this.lastHover = now;
    this.setHover(this.aim(e).thing);
  };

  private pointerLeave = () => this.setHover(null);

  private blocked(x: number, z: number): boolean {
    return this.solids.some((b) => x > b.minX - RADIUS && x < b.maxX + RADIUS && z > b.minZ - RADIUS && z < b.maxZ + RADIUS);
  }

  private step(dt: number) {
    const calm = this.opts.reduceMotion;
    this.tick++;
    // The camera's quarter turns, eased.
    const wantAngle = (this.turn * Math.PI) / 2;
    this.angle = calm ? wantAngle : this.angle + (wantAngle - this.angle) * (1 - Math.exp(-8 * dt));

    // Screen directions in an isometric view, turned with the camera: "up" is away from it, along the diagonal.
    let dx = 0;
    let dz = 0;
    if (this.keys.has("w") || this.keys.has("arrowup")) (dx -= 1), (dz -= 1);
    if (this.keys.has("s") || this.keys.has("arrowdown")) (dx += 1), (dz += 1);
    if (this.keys.has("a") || this.keys.has("arrowleft")) (dx -= 1), (dz += 1);
    if (this.keys.has("d") || this.keys.has("arrowright")) (dx += 1), (dz -= 1);
    const dir = dx || dz ? rotate(dx, dz, this.angle) : new THREE.Vector3();
    // While the camera is away showing a spot, you wait: no keys are held (see `showSpot`), and no route is walked.
    if (this.tour) this.stuck.at = this.clock.elapsedTime;
    if (!dir.lengthSq() && this.route && !this.tour) {
      const u = this.useOnArrival;
      // Someone you're walking to may be strolling: keep aiming the last leg at the spot beside them.
      if (u && u.target.kind === "person") this.beside(u, this.route[this.route.length - 1]);
      // Past a waypoint: on to the next one.
      dir.subVectors(this.route[0], this.player.position).setY(0);
      while (dir.length() < 0.15 && this.route.length > 1) {
        this.route.shift();
        dir.subVectors(this.route[0], this.player.position).setY(0);
      }
      // There: at the last waypoint, or already close enough to use what you came for.
      const there = dir.length() < 0.15 || (u !== null && this.arrived(u));
      // The route's last cell can sit on a corner of the goal rectangle, a little too far from the building's
      // real walls: one last straight step towards them, once, and the next frame arrives.
      if (there && u?.box && !this.arrived(u) && !this.nudged) {
        this.nudged = true;
        const q = nearestOnBox({ x: this.player.position.x, z: this.player.position.z }, grow(u.box, REACH * 0.5));
        this.route = [new THREE.Vector3(q.x, 0, q.z)];
        dir.subVectors(this.route[0], this.player.position).setY(0);
      } else if (there) {
        this.stop();
        dir.set(0, 0, 0);
        if (u) this.use(u);
      }
    }
    // A dash carries you the way you faced when you had nothing else to go by.
    const dashing = this.clock.elapsedTime < this.dashUntil;
    if (!dir.lengthSq() && dashing) dir.copy(this.dashDir);
    const moving = dir.lengthSq() > 0;
    if (moving) {
      // Much faster for the length of a dash.
      const speed = dashing ? SPEED * DASH.speed : SPEED;
      dir.normalize().multiplyScalar(speed * dt);
      const pos = this.player.position;
      // Slide along walls: try each axis on its own.
      if (!this.blocked(pos.x + dir.x, pos.z)) pos.x += dir.x;
      if (!this.blocked(pos.x, pos.z + dir.z)) pos.z += dir.z;
      pos.x = THREE.MathUtils.clamp(pos.x, this.bounds.minX, this.bounds.maxX);
      pos.z = THREE.MathUtils.clamp(pos.z, this.bounds.minZ, this.bounds.maxZ);
      this.player.rotation.y = Math.atan2(dir.x, dir.z);
      if (this.playerPerson) this.playerPerson.play("walk");
      else if (!calm) this.player.position.y = Math.abs(Math.sin(this.clock.elapsedTime * 12)) * 0.08;
    } else {
      this.player.position.y = 0;
      this.playerPerson?.play("idle");
    }
    // On a route but going nowhere (against a wall, with no way round): give up rather than walk forever.
    if (this.route && this.clock.elapsedTime - this.stuck.at >= STUCK.after) {
      const pos = this.player.position;
      if (Math.hypot(pos.x - this.stuck.x, pos.z - this.stuck.z) < STUCK.moved) this.stop();
      else this.stuck = { at: this.clock.elapsedTime, x: pos.x, z: pos.z };
    }
    if (this.playerPerson) this.player.position.y = 0;
    this.playerPerson?.mixer.update(dt);
    this.report(moving);

    // The dust of a dash grows and fades, then goes.
    for (const puff of [...this.puffs]) {
      puff.age += dt;
      const t = Math.min(puff.age / PUFF_TIME, 1);
      puff.group.scale.setScalar(0.6 + t * 1.6);
      for (const disc of puff.group.children) ((disc as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - t);
      if (t < 1) continue;
      this.scene.remove(puff.group);
      disposeTree(puff.group);
      this.puffs.splice(this.puffs.indexOf(puff), 1);
    }

    // What are we standing next to? Told to Vue when it changes, unless a highlight is showing instead.
    const near = this.reach();
    if (near !== this.near) {
      this.near = near;
      if (!this.highlighted) this.events.onNear(near?.target ?? null);
    }

    // The ring under the highlighted target, breathing gently. Under a person it follows them.
    const h = this.highlighted;
    this.ring.visible = h !== null;
    if (h) {
      const breath = calm ? 0 : Math.sin(this.clock.elapsedTime * 4);
      this.ring.position.set(h.spot.x, 0.2, h.spot.z);
      this.ring.scale.setScalar(1 + breath * 0.08);
      this.ring.material.opacity = 0.75 + breath * 0.15;
    }

    // Flatmates stroll around their front yard.
    for (const n of this.npcs) {
      if (calm || !n.avatar.visible) {
        n.person?.play("idle");
        continue;
      }
      const to = new THREE.Vector3().subVectors(n.goal, n.avatar.position).setY(0);
      if (to.length() < 0.1) {
        n.wait -= dt;
        if (n.wait <= 0) {
          n.goal = n.home.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.4, 0, (Math.random() - 0.5) * 2.4));
          n.wait = 2 + Math.random() * 4;
        }
        n.person?.play("idle");
      } else {
        const move = to.normalize().multiplyScalar(1.2 * dt);
        n.avatar.position.add(move);
        n.avatar.rotation.y = Math.atan2(move.x, move.z);
        n.person?.play("walk");
      }
    }

    // Everyone else glides to where they last said they were.
    for (const r of this.remotes.values()) {
      const k = 1 - Math.exp(-10 * dt);
      r.avatar.position.lerp(r.goal, k);
      r.avatar.rotation.y += shortestAngle(r.avatar.rotation.y, r.ry) * k;
      const still = r.avatar.position.distanceTo(r.goal) < 0.05;
      r.person?.play(r.moving && !still ? "walk" : "idle");
    }

    // Only the people near the camera animate, and only those near you show their name (plus whoever's highlighted).
    const centre = this.player.position;
    const animateRange = this.viewHalf * 2.2;
    for (const n of this.npcs) if (n.person && n.avatar.position.distanceTo(centre) < animateRange) n.person.mixer.update(dt);
    for (const r of this.remotes.values()) r.person?.mixer.update(dt);
    if (this.tick % 6 === 0) {
      const tagRange = this.viewHalf < 9 ? this.viewHalf * 2 : TAG_RANGE;
      for (const n of this.npcs) n.tag.style.visibility = n === h || n.avatar.position.distanceTo(centre) < tagRange ? "" : "hidden";
      for (const r of this.remotes.values()) r.tag.style.visibility = r === h || r.avatar.position.distanceTo(centre) < tagRange * 1.6 ? "" : "hidden";
    }

    // The camera follows from the isometric angle, turned and gliding (or snapping, for calm motion). It looks at
    // you, or beside you when a window is open (see `followPoint`), or at the spot a tour is showing.
    const offset = rotate(CAMERA_OFFSET.x, CAMERA_OFFSET.z, this.angle).setY(CAMERA_OFFSET.y);
    const goal = this.followPoint(new THREE.Vector3());
    const look = this.camera.position.clone().sub(this.lastOffset ?? offset).setY(0);
    if (this.tour) this.touring(look, goal);
    else if (calm || this.snap) look.copy(goal);
    else look.lerp(goal, 1 - Math.exp(-6 * dt));
    this.snap = false;
    this.camera.position.copy(look).add(offset);
    this.camera.lookAt(look);
    this.lastOffset = offset;
    // The sun follows the view, so shadows stay sharp wherever you are.
    this.sun.position.copy(look).add(new THREE.Vector3(18, 22, 6));
    this.sun.target.position.copy(look);

    // A building between the camera and you fades, so you're never lost behind a wall.
    if (this.tick % 4 === 0) {
      const sight = new THREE.Ray(this.player.position.clone().setY(0.9), offset.clone().normalize());
      for (const o of this.occluders) {
        const block = sight.intersectsBox(o.box);
        if (block === o.faded) continue;
        o.faded = block;
        for (const m of o.materials) {
          m.transparent = block;
          m.opacity = block ? 0.22 : 1;
          m.depthWrite = !block;
        }
      }
    }

    // Skyline buildings on the camera's side of town would stand in front of everything: hide them.
    if (this.tick % 10 === 0) {
      const toCamera = new THREE.Vector3(offset.x, 0, offset.z).normalize();
      for (const m of this.skyline) m.visible = m.position.clone().sub(look).setY(0).dot(toCamera) < 6;
    }

    // Zoom eases towards the wheel's choice (or the onboarding's close-up, or the close-up beside a window).
    const want = this.focus ?? (this.framing === "left" ? FRAMED.half : this.zoom);
    if (Math.abs(this.viewHalf - want) > 0.01) {
      this.viewHalf = calm ? want : this.viewHalf + (want - this.viewHalf) * (1 - Math.exp(-8 * dt));
      this.project(this.viewHalf);
    }

    // The minimap's feed: everyone's position, five times a second.
    const now = performance.now();
    if (now - this.lastMap >= MAP_EVERY) {
      this.lastMap = now;
      const you = this.player.position;
      const people = this.npcs.filter((n) => n.avatar.visible).map((n) => ({ login: n.login, x: n.avatar.position.x, z: n.avatar.position.z }));
      for (const [login, r] of this.remotes) people.push({ login, x: r.avatar.position.x, z: r.avatar.position.z });
      this.events.onMap({ you: { x: you.x, z: you.z, ry: this.player.rotation.y }, people, angle: this.angle });
    }
  }

  /**
   * Where the camera looks during a tour, written into `look`: gliding from where it was to the spot, staying,
   * then gliding back to `goal` (you). Ends the tour once it's back. Glides are eased in and out; with calm motion
   * they take no time, so the camera cuts.
   */
  private touring(look: THREE.Vector3, goal: THREE.Vector3) {
    const tour = this.tour!;
    const t = this.clock.elapsedTime - tour.start;
    const { glide, hold } = tour;
    if (t < glide) look.lerpVectors(tour.from, tour.to, easeInOut(t / glide));
    else if (t < glide + hold) look.copy(tour.to);
    else if (t < glide + hold + glide) look.lerpVectors(tour.to, goal, easeInOut((t - glide - hold) / glide));
    else {
      look.copy(goal);
      this.endTour();
    }
  }

  /**
   * Draws the frame. Outlines cost a few extra passes, so the composer only runs while something is outlined:
   * the thing under the mouse in soft white, the Tab highlight in the ring's warm white (or just the latter when
   * they're the same thing). A quiet frame renders straight to the screen, as before.
   */
  private draw() {
    const tab = this.highlighted;
    const hover = this.hover === tab ? null : this.hover;
    if (this.composer && this.hoverPass && this.tabPass && (hover || tab)) {
      this.hoverPass.selectedObjects = hover ? this.outlineOf(hover) : [];
      this.tabPass.selectedObjects = tab ? this.outlineOf(tab) : [];
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  // Tells the others where we are: when it changed, at most ten times a second.
  private report(moving: boolean) {
    const p = this.player.position;
    const key = `${p.x.toFixed(2)},${p.z.toFixed(2)},${this.player.rotation.y.toFixed(2)},${moving}`;
    const now = performance.now();
    if (key === this.lastSent.key || now - this.lastSent.at < 100) return;
    this.lastSent = { at: now, key };
    this.events.onMove({ x: p.x, z: p.z, ry: this.player.rotation.y, moving });
  }

  private loop = () => {
    this.animationFrame = requestAnimationFrame(this.loop);
    this.step(Math.min(this.clock.getDelta(), 0.05));
    this.draw();
    this.labels.render(this.scene, this.camera);
  };
}

/** A building's footprint in the world: `w` wide and `d` deep, turned with its plot. */
function footprint(x: number, z: number, facing: Facing, w: number, d: number): Box {
  const [hw, hd] = facing % 2 === 0 ? [w / 2, d / 2] : [d / 2, w / 2];
  return { minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd };
}

/** Slow, then fast, then slow again: 0 → 0, ½ → ½, 1 → 1 (a cubic). */
function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function shortestAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// three.js removes a name tag's element only when the tag itself is removed, not when a group holding it is.
function removeLabels(root: THREE.Object3D) {
  root.traverse((o) => {
    if (o instanceof CSS2DObject) o.element.remove();
  });
}
