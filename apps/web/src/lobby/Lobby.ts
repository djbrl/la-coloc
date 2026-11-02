// The city as a walkable lobby: one neighbourhood at a time, generated from its city's name (see neighbourhood.ts),
// always in full daylight (daylight.ts; the UI's day/night theme doesn't touch it) and dressed in its own style (cityStyle.ts). Your character, the
// flatmates hanging around their houses, and everyone else who's online in this neighbourhood, live. Each house's
// front shows its rooms as windows (windows.ts). Every house, empty plot, person and the market's chores board is a
// target: walk up to one and press E, click it, or press [ and ] to pick one from afar; whatever the mouse is over
// gets an outline. Using one is reported to Vue, which draws the card and does the navigating. Anything far away is walked to along a route
// found on a grid (path.ts), so you can get to a building from whichever side you're on. Shift dashes, and
// `travelTo` is fast travel (to a house's door, from the big map). For the tutorial, Vue can switch controls off one by one (`setControls`), hears each
// one you use (`onAction`), and can send the camera to show you a spot (`showSpot`); `frame` makes room for a
// window on the right of the screen. The Arena, a stadium on its own block (arena.ts), is a target too: its big screen
// shows the week's challenge (`setArena`), a few passers-by go and watch, and Vue hears how many are in (`onArenaCrowd`).
// The city's life (life.ts): speech bubbles over people (`say`), each house's happenings played at the house
// (`happening`), and smoke from busy roofs; Kigali has its hills (hills.ts).
// Pure three.js; Vue only mounts it and draws what sits on top (cards, the minimap it's fed by `onMap`).
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutlinePass } from "three/examples/jsm/postprocessing/OutlinePass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { CityHappening, CityHouse } from "../types";
import { type ArenaDisplay, ArenaModel } from "./arena";
import { type ArenaPlan, arenaPlan, insideBowl } from "./arenaPlan";
import { loadHouse, loadModel, loadPerson, PARASOLS, type Person, SHOPS, SKYLINE, STREET, TOWERS, TREES } from "./assets";
import { type CityStyle, styleFor } from "./cityStyle";
import { daylight } from "./daylight";
import { type Box as ScreenBox, clearOf, type EdgeArrow, placeArrow } from "./arrow";
import { type Badge, badgeChip } from "./badge";
import { Beacon } from "./beacon";
import { Fireworks } from "./fireworks";
import { hills } from "./hills";
import { CityLife, roofOf } from "./life";
import { liveKey, liveState } from "./live";
import { colorFor, disposeTree, HIGHLIGHT, makeAvatar, makeHighlight, makeHouse, makePuff, RING, ringPaint } from "./models";
import { CityProps, makeBoard, makePins, waxParasols } from "./props";
import { type Facing, FACING_DIR, facingFront, frontOf, type Neighbourhood, PLOT, ROAD, seeded } from "./neighbourhood";
import { keepApart, laneFor, MOST, passerbyCount, passersBy, type SidewalkPoint, sidewalks, standAt, type Stroll, VISITORS, visitorsIn, walkAhead } from "./passersby";
import { type Box, buildGrid, distanceToBox, findPath, type Grid, grow, nearestOnBox, type Point, RADIUS, smooth } from "./path";
import { cityKey, cityOwnsKeys, readLayout } from "./keys";
import { play } from "./sound";
import { groundMaterial, groundsFor, textures, waxPrint } from "./textures";
import { FrameBudget } from "./frameBudget";
import { isTourist } from "./tags";
import { Tag, type TagKind, TagLayer } from "./tagLayer";
import { declutter, type TagSpot } from "./tags";
import { dye } from "./tint";
import { HouseFace } from "./windows";
import { hudWords as words } from "../components/lobby/words";
import { language } from "../i18n";

export type { ArenaDisplay } from "./arena";
export type { Badge } from "./badge";

const SPEED = 6; // units per second
// A dash (Shift): an instant hop forward, a burst at 4.5 times the speed, then a breather before the next one.
// Lengths in units, times in seconds.
const DASH = { hop: 0.9, speed: 4.5, length: 0.14, cooldown: 0.35 };
const PUFF_TIME = 0.3; // how long the dust at your feet lasts
const HOVER_EVERY = 60; // milliseconds between two looks at what's under the mouse
const MAP_EVERY = 200; // milliseconds between two reports to the minimap
const REACH = 1.6; // how close you stand to use a building, a person or the board
const GRID_CELL = 0.5; // the walk grid's cell size, in units
// Following a route but moved less than this in this long (a wall, a lost cause): the route is dropped.
const STUCK = { moved: 0.05, after: 0.5 };
// Far back along the isometric angle: an orthographic view looks the same from any distance, and a full-height
// screen reaches ground that a closer camera would clip.
const CAMERA_OFFSET = new THREE.Vector3(42, 48, 42);
// Half the view's width, in world units. A city opens zoomed out (`start`), so you see the streets around you and
// the houses at a glance (Jib, 16 10); a phone held upright a little less far (`phone`), or people become specks;
// the quest's one street opens closer (`close`), where it was designed to be seen.
const ZOOM = { min: 7, max: 26, start: 20, phone: 15, close: 13 };
// Showing a spot (`showSpot`): how long the camera takes to glide there (and back), and how long it stays, in seconds.
const TOUR = { glide: 1.2, hold: 2 };
// A window open on the right (`frame("left")`): zoomed in to this half-width, with you this far across the screen
// from the left. A screen narrower than `narrow` pixels shows windows as a bottom sheet: it zooms, and you stand in
// the top third, above the sheet.
const FRAMED = { half: 6.5, at: 0.28, narrow: 720 };
const TAG_RANGE = 10; // people's name tags show within this distance of you
const TAG_MOST = 16; // and no more of them than this, the nearest
const SHADOW_REACH = 1.8; // how much wider than the view the shadow map is
const STAGE_EDGE = 1.25; // how far past the edge of the view people stay in the scene (1 is the edge): their shadows still fall in it, and you can't outrun it
const NOBODY = 0xd8d8de; // the ring colour of someone without a house
// The city is always seen by day, bright and colourful, whatever the time there or the site's theme (15 10 2026):
// a night city read as gloomy. No dusk, no lamps coming on: the light is set once per city (see `light`).
const SPACING = 0.9;
// How much nearer than a building a person must be to win "in reach" (see `reach`).
const PEOPLE_MARGIN = 0.8; // the closest two people standing at a door may get (R39)
const TAG_CHECKS = 8; // name tags checked for a building in the way, per check (a few each time, round and round)
const NARROW_TAGS = 600; // under this width (pixels), only your tag and the nearest person's show
const ARROW_MARGIN = 56; // how far in from the screen's edge the arrow towards an off-screen goal sits, in pixels
const CROWD_EVERY = 250; // milliseconds between two counts of who's inside the Arena
// Passers-by who go to the Arena (see `fanStep`): how long they stay out in the streets before going (again), and how
// long they stay on the pitch, in seconds (a base and a random extra).
const FAN = { street: [25, 40], inside: [15, 25] } as const;

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
  // `example`: a passer-by the lobby made up (passersby.ts), with no house and no GitHub account.
  | { kind: "person"; login: string; name: string; example?: boolean }
  // The chores board on the market square: Vue lists the houses with reviews waiting.
  | { kind: "board"; city: string }
  // The Arena's entrance: Vue opens the week's challenge.
  | { kind: "arena"; city: string };

// Who someone is, for their ring colour and the card you get by clicking them.
export interface Resident {
  houseId: string;
  houseName: string;
  room: string;
  project: string | null;
  // The Arena title they wear, as the city lists them: the flatmates out front carry it on their tags too.
  badge?: Badge | null;
  // Every city they have a room in: they aren't a tourist in any of them.
  cities?: string[];
}

export interface LobbyEvents {
  // The thing in reach of you, or the one you highlighted with [ or ]: Vue shows a prompt for it ("Go in  E").
  onNear(target: Target | null): void;
  // You used a target (E, Enter, a click, or walking up to something you clicked): Vue opens a card for it. `how`
  // says which: "click" for a person clicked or tapped (their card), "use" for E, Enter, the prompt, or arriving
  // where you were heading (on a person, that's saying hi).
  onSelect(target: Target, how: "use" | "click"): void;
  // Your position, when it changed (at most ten times a second): for the others to see you.
  onMove(state: { x: number; z: number; ry: number; moving: boolean }): void;
  // What the mouse is over (it gets an outline and a pointer cursor), when that changes. Nothing: null.
  onHover(target: Target | null): void;
  // For the minimap, five times a second: you, everyone else on the map, and which way the camera is turned.
  onMap(state: { you: { x: number; z: number; ry: number }; people: { login: string; x: number; z: number }[]; angle: number }): void;
  // You used a control that's switched on: a walk key went down (not a key held down repeating), a dash happened
  // (Shift, or `dash()`), or the camera turned (Q, R, or `rotate()`). The tutorial ticks its steps off with this.
  onAction(name: Action): void;
  // How many people are inside the Arena (you, others online, passers-by), when that changes. Checked a few times a
  // second; 0 in a city without one.
  onArenaCrowd?(n: number): void;
}

export interface LobbyOptions {
  login: string | null;
  character: string | null;
  quality: "high" | "low";
  reduceMotion: boolean;
}

// Anything you can aim at, whatever it is: what Vue hears about it, and where it stands.
interface Thing {
  target: Target;
  // Where it is, for the ring, the minimap and the nearest-first order of [ and ]: a person's feet (it moves with
  // them), or, for a building (or the board), its door when you're not on your way there and the nearest point of its reach
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
  // Its front: the windows, the crane (windows.ts). `live` is the state last drawn, to skip a redraw.
  face: HouseFace;
  live: string;
  // The model's materials (its own copies), to darken in a power cut, with their daylight colours.
  materials: { material: THREE.MeshStandardMaterial; color: THREE.Color }[];
  // A visitor waiting at the door while someone's knock is open (R32), and their "☝️" bubble.
  knocker: THREE.Group | null;
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
  dressing?: boolean;
  home: THREE.Vector3;
  // Where they're strolling to right now.
  goal: THREE.Vector3;
  wait: number;
  tag: Tag;
  // Behind a building, seen from the camera: their name tag hides (R39).
  hidden?: boolean;
  // A passer-by (passersby.ts): walks round the blocks on the sidewalks (`stroll`, towards `next`, at `speed`) instead
  // of hanging around a door.
  passerby?: { stroll: Stroll; next: THREE.Vector3 | null; speed: number; fan?: Fan };
}

// A passer-by who goes to the Arena: one who stays in the stands (`seat`), or one who walks over from the street now
// and then, stands around on the pitch a while, and walks back out. `route` is the way they're walking, `until` when
// they set off again (seconds on the clock), `spot` their place round the stage (ArenaPlan.spots).
interface Fan {
  seat: boolean;
  phase: "street" | "going" | "inside" | "leaving";
  until: number;
  route: THREE.Vector3[];
  spot: number;
}

interface Remote extends Thing {
  avatar: THREE.Group;
  person?: Person;
  dressing?: boolean;
  // The look they chose.
  character: string | null;
  // Where they last said they were.
  goal: THREE.Vector3;
  ry: number;
  moving: boolean;
  tag: Tag;
  hidden?: boolean;
}

// The chores board on the market square (R19): a target, with a pin per house that has reviews waiting.
interface Board extends Thing {
  group: THREE.Group;
  box: Box;
  door: THREE.Vector3;
  pins: THREE.Group;
}

// The Arena (arena.ts): a target at its entrance (`box` is the passage through the stands), with its model and layout.
interface Arena extends Thing {
  model: ArenaModel;
  plan: ArenaPlan;
  box: Box;
  door: THREE.Vector3;
  label: Tag;
  // Its block's sidewalk (an index into `sidewalks`), and the point of it in front of the entrance: where fans leaving
  // the Arena go back to walking round the blocks.
  ring: number;
  exit: number;
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
// The trophy on a title chip (see `trophy`): a cup on a stem, two handles, in the chip's ink.
// (x, z) turned by angle `a` around y, the same way three.js turns an object by rotation.y = a.
const rotate = (x: number, z: number, a: number) => new THREE.Vector3(x * Math.cos(a) + z * Math.sin(a), 0, -x * Math.sin(a) + z * Math.cos(a));
// How far apart two points are on the ground, ignoring height.
const apart = (a: THREE.Vector3, b: THREE.Vector3) => Math.hypot(a.x - b.x, a.z - b.z);

// Who stands outside a house: everyone who rents a room there, once each (someone may rent several).
function flatmatesOf(house: CityHouse) {
  return [...new Map(house.rooms.flatMap((r) => (r.occupant ? [[r.occupant.login, r.occupant] as const] : []))).values()];
}

export class Lobby {
  private renderer: THREE.WebGLRenderer;
  // Speech bubbles and other rare words in the city stay page elements. Name tags and flags are drawn: see `tags`.
  private labels = new CSS2DRenderer();
  private tags = new TagLayer();
  // Every flag in this neighbourhood: the houses' and the Arena's.
  private flags: Tag[] = [];
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private clock = new THREE.Clock();
  private player: THREE.Group;
  private playerPerson?: Person;
  private playerTag: Tag;
  private town = new THREE.Group();
  private placed: Placed[] = [];
  private plots: EmptyPlot[] = [];
  private solids: Box[] = [];
  private npcs: Npc[] = [];
  // The passers-by (also in `npcs`), and the sidewalks they walk round the blocks.
  private walkers: Npc[] = [];
  private sidewalks: SidewalkPoint[][] = [];
  private remotes = new Map<string, Remote>();
  private residents = new Map<string, Resident>();
  // The city each person belongs to, from the live line (people online) or passersby.ts: for the tourist chip.
  private homeCities = new Map<string, string | null>();
  // Off on the tutorial's street, which belongs to no city.
  private touristsHere = true;
  private board: Board | null = null;
  // The Arena, in a city that has one; what its big screen shows (kept across cities), and the last head count told to Vue.
  private arena: Arena | null = null;
  private arenaDisplay: ArenaDisplay | null = null;
  private crowd = { n: 0, at: 0 };
  // The titles worn on name tags (yours and others online), by tag.
  private tagBadges = new WeakMap<Tag, Badge | null>();
  private props: CityProps | null = null;
  // The city's look (colours, grounds, props), and the light of its local time.
  private style: CityStyle = styleFor("");
  private hemi: THREE.HemisphereLight;
  private sky: { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; key: string };
  private fireworks = new Fireworks();
  // Speech bubbles, happenings and the roofs' smoke (life.ts).
  private life: CityLife;
  // The tutorial's quest marker at a house's door (`setBeacon`), and which house. It lives in the scene, not the town,
  // so a rebuild keeps it and clicks go through it; each frame it finds its house again (see `step`).
  private beacon: Beacon | null = null;
  private beaconHouse: string | null = null;
  // The arrow at the screen's edge (arrow.ts) towards the beacon's house, else a house picked from Find or the big
  // map (`pointAt`) until you reach it; hidden while its door is on screen. aria-hidden: the coach and the map say it.
  private arrow: HTMLElement;
  private arrowAt: EdgeArrow = { shown: false, x: 0, y: 0, angle: 0 };
  private arrowKey = "";
  // Where the HUD sits over the stage (the minimap, the coach), so the arrow never hides under it; read twice a second.
  private hudBoxes: ScreenBox[] = [];
  private hudReadAt = 0;
  private pointHouse: string | null = null;
  // The stage's size in pixels, set by `fit`.
  private width = 1;
  private height = 1;
  // Whether you've clicked or tapped the stage: from then on, keys pressed with nothing focused are for walking (R6).
  private stageTouched = false;
  // Single-character keyboard shortcuts on (see `setShortcuts`).
  private shortcuts = true;
  // Where `arriveAt` put you, until you move: a house model loading late moves its door, and you with it.
  private arrival: { placed: Placed; x: number; z: number } | null = null;
  private pendingArrival: string | null = null;
  // The latest city, by house id, for `updateHouses` and a house that's placed later.
  private houses = new Map<string, CityHouse>();
  private tagCursor = 0;
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
  // The thing in reach of you, and the one you picked with [ or ] (which can be far away).
  private near: Thing | null = null;
  private highlighted: Thing | null = null;
  // The thing under the mouse, and when we last looked.
  private hover: Thing | null = null;
  private lastHover = 0;
  // The outline effect: the scene drawn into a buffer, an outline for the hovered thing (soft white) and one for
  // the [ ] highlight (the ring's warm white), then the buffer put on screen in sRGB. Only used while something
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
  // Name tags piling up (tags.ts): a pool of spots reused on every check, and each tag's width, measured once (and
  // again when its house chip changes).
  private tagSpots: TagSpot[] = [];
  // How many steps down this machine has needed (see `easeOff`).
  private budget = new FrameBudget();
  private easedOff = 0;
  private tagCount = 0;

  constructor(
    private host: HTMLElement,
    private events: LobbyEvents,
    private opts: LobbyOptions,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(this.renderer.domElement);
    this.labels.domElement.className = "lobby-labels";
    host.append(this.tags.canvas, this.tags.names, this.labels.domElement);
    this.arrow = document.createElement("div");
    this.arrow.className = "lobby-arrow";
    this.arrow.setAttribute("aria-hidden", "true");
    this.arrow.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    host.appendChild(this.arrow);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 600);
    // The light is set by `light` (always day) once the city is built: these hold until then.
    this.hemi = new THREE.HemisphereLight(0xe4dcff, 0x6a6488, 1.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffc9a0, 2.1);
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 200 });
    this.scene.add(this.sun, this.sun.target);
    // The far skyline fades into the evening.
    this.scene.fog = new THREE.Fog(0x9d8fc6, 95, 190);
    // The sky behind the city: a vertical gradient, redrawn when the light changes.
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 256;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.sky = { canvas, texture, key: "" };
    this.scene.background = texture;
    this.scene.add(this.town, this.ring, this.fireworks.object);
    this.life = new CityLife({
      calm: () => this.opts.reduceMotion,
      house: (id) => {
        const p = this.placed.find((x) => x.house.id === id);
        return p ? { door: p.door, roof: roofOf(p.group, [p.face.group]), face: p.face, rooms: p.house.rooms.map((r) => r.name) } : null;
      },
      figure: (login) => this.figure(login),
      celebrate: (id) => this.celebrate(id),
      // A house in a power cut has nothing running: no smoke, whatever its last CPU reading said.
      roofs: () => this.placed.map((p) => ({ id: p.house.id, at: roofOf(p.group, [p.face.group]), cpu: liveState(p.house).powerCut ? 0 : (p.house.cpu ?? 0) })),
    });
    this.scene.add(this.life.object);

    const you = this.makePerson(opts.login ?? "visitor", opts.login ? `@${opts.login}` : words.youTag, "you");
    this.player = you.avatar;
    this.playerTag = you.tag;
    this.scene.add(this.player);
    this.setCharacter(opts.character);

    this.applyQuality();
    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(host);
    this.fit();
    window.addEventListener("keydown", this.keydown);
    // The letters to print on the walk keys' caps, for this keyboard (keys.ts).
    void readLayout();
    window.addEventListener("keyup", this.keyup);
    window.addEventListener("blur", this.releaseKeys);
    document.addEventListener("visibilitychange", this.releaseKeys);
    this.renderer.domElement.addEventListener("pointerdown", this.touchStage);
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

  /**
   * Builds a neighbourhood. Moving to another one puts you at its entrance, zoomed out (`close`: at the closer zoom,
   * for the tutorial's street). `passersBy: false` leaves its streets to the flatmates (the tutorial's one street,
   * where nothing should distract).
   */
  setNeighbourhood(n: Neighbourhood, houses: CityHouse[], opts: { passersBy?: boolean; close?: boolean; tourists?: boolean } = {}) {
    this.touristsHere = opts.tourists !== false;
    // The city stream re-sends the city often. Only rebuild if what's drawn changed; the live state (windows, the
    // crane, the power, knocks, the board's pins) is redrawn in place by `updateHouses`.
    const key = JSON.stringify([n.city, houses.map((h) => [h.id, h.name, h.status, h.demo, h.plot, h.rooms.map((r) => r.name)])]);
    // Someone moved in or out: the streets stay, and only that house's people change (a full rebuild freezes the city
    // for a moment, the more houses the longer).
    if (key === this.builtFrom) {
      for (const h of houses) this.refreshFlatmates(h);
      return this.updateHouses(houses);
    }
    const arriving = n.city !== this.builtCity;
    this.builtCity = n.city;
    if (arriving) {
      // A new place starts at its own zoom, whatever the wheel chose in the last one; no ease, the camera cuts there.
      this.zoom = opts.close ? ZOOM.close : this.aspect < 1 ? ZOOM.phone : ZOOM.start;
      if (this.focus === null && this.framing !== "left") {
        this.viewHalf = this.zoom;
        this.project();
      }
    }
    this.builtFrom = key;
    this.budget.settle();
    const gen = ++this.generation;
    this.life.clear();
    this.arena?.model.dispose();
    this.arena = null;
    for (const p of this.placed) p.face.dispose();
    // Those off stage have to be disposed of too.
    for (const n of this.npcs) if (!n.avatar.parent) this.town.add(n.avatar);
    removeLabels(this.town);
    this.flags = [];
    disposeTree(this.town);
    this.town.clear();
    this.placed = [];
    this.plots = [];
    this.solids = [];
    this.npcs = [];
    this.walkers = [];
    this.sidewalks = [];
    this.board = null;
    this.props = null;
    this.skyline = [];
    this.occluders = [];
    this.arrival = null;
    this.style = styleFor(n.city);
    const rand = seeded(`decor:${n.city}`);
    // The city's own props have their own dice, so adding one never moves the trees and parasols.
    const dice = seeded(`props:${n.city}`);
    const style = this.style;
    const props = new CityProps();
    this.props = props;
    this.town.add(props.group);
    const tex = textures();
    const ground = groundsFor(style.ground, style.grassy);
    const { minX, maxX, minZ, maxZ } = n.bounds;
    const width = maxX - minX;
    const depth = maxZ - minZ;
    this.bounds = { minX: minX - 2, maxX: maxX + 2, minZ: minZ - 2, maxZ: maxZ + 2 };

    // The city's ground to the horizon (grass, sand, red earth…), asphalt under the whole town; blocks sit on top, a
    // curb higher, ringed by sidewalk.
    this.flat(ground.horizon, 0, 0, width + 260, depth + 260, 4, -0.02).name = "ground";
    this.flat(ground.road, 0, 0, width, depth, 6, 0.0).name = "ground";
    for (const b of n.blocks) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(b.width + 1.6, 0.14, b.depth + 1.6), groundMaterial(ground.sidewalk, b.width + 1.6, b.depth + 1.6, 3));
      curb.position.set(b.x, 0.07, b.z);
      curb.receiveShadow = true;
      curb.name = "ground";
      this.town.add(curb);
      // The Arena stands on a paved forecourt, like the market.
      const surface = b.kind === "market" || b.kind === "arena" ? ground.market : b.kind === "park" ? ground.park : ground.lawn;
      this.flat(surface, b.x, b.z, b.width - 0.4, b.depth - 0.4, b.kind === "market" ? 4 : 5, 0.145).name = "ground";
      if (b.kind === "market") this.market(b, rand, gen);
      if (b.kind === "park") for (let i = 0; i < 9; i++) this.tree(b.x + (rand() - 0.5) * (b.width - 3), b.z + (rand() - 0.5) * (b.depth - 3), rand, gen);
      if (b.kind === "arena") {
        // The Arena took the park's block. The decor's dice still roll for the park's nine trees (five rolls each), so
        // every tree lot in town keeps its trees where they were.
        for (let i = 0; i < 45; i++) rand();
        if (n.arena) this.addArena(n.arena, n.city);
      }
      // Palms on two corners of each block's sidewalk (the other two have a lamp and a traffic light).
      if (style.props.includes("palms") && b.kind !== "park" && b.kind !== "arena") {
        if (dice() < 0.7) props.palm(b.x + b.width / 2 + 0.35, b.z - b.depth / 2 - 0.35, dice);
        if (dice() < 0.7) props.palm(b.x - b.width / 2 - 0.35, b.z + b.depth / 2 + 0.35, dice);
      }
    }
    this.streetMarkings(n, style.zebra);
    // Dakar's baobab: in the park if there is one, else on a corner of the market square.
    if (style.props.includes("baobab")) {
      const park = n.blocks.find((b) => b.kind === "park");
      const market = n.blocks.find((b) => b.kind === "market")!;
      const at = park ? { x: park.x, z: park.z } : { x: market.x - market.width / 2 + 2.2, z: market.z - market.depth / 2 + 2.2 };
      props.baobab(at.x, at.z);
      this.solid(at.x, at.z, 0, 2.2, 2.2);
    }
    // The coast, on the town's south side: a beach, the sea, and pirogues.
    if (style.coast && style.props.includes("pirogues")) props.coast(minX, maxX, maxZ, dice);
    props.finish();

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
      const roof = dice();
      this.load(gen, loadModel(url, size), (m) => {
        m.position.set(p.x, 0.14, p.z);
        m.rotation.y = yaw(p.facing);
        m.userData.plotKey = p.key;
        dye(m, style);
        plot.objects.push(m);
        this.occluder(m);
        this.onRoof(m, lot.kind === "shop", roof);
      });
    }

    // Lamps at the crossings (scenery, always off), traffic lights at a few, where the city has them.
    this.addLamps(n.lamps);
    if (n.board) this.addBoard(n.board, n.city);
    for (const t of this.style.trafficLights ? n.trafficLights : []) {
      this.load(gen, loadModel(STREET.trafficLight, 3.4, "height"), (m) => {
        m.position.set(t.x, 0.14, t.z);
        m.rotation.y = yaw(t.facing);
      });
    }

    // The rest of the city, beyond the last street: seen, not walked. On a coast, the sea takes the south side.
    for (const s of n.skyline) {
      if (style.coast && style.props.includes("pirogues") && s.z > maxZ) continue;
      this.load(gen, loadModel(SKYLINE[s.variant], s.scale * 1.4, "height"), (m) => {
        m.position.set(s.x, 0, s.z);
        m.rotation.y = yaw(s.facing);
        dye(m, style);
        this.skyline.push(m);
      });
    }

    // Kigali's hills and the terraces rising to them, beyond the skyline: hidden on the camera's side, like it.
    if (style.hills) {
      const land = hills(n.bounds, seeded(`hills:${n.city}`));
      this.town.add(land.ground, ...land.hills);
      this.skyline.push(...land.hills);
    }

    // The walk grid, from every footprint placed above. House models that load later refine theirs: see `grid`.
    this.gridDirty = true;
    this.grid();
    if (opts.passersBy !== false) this.addPassersBy(n);

    if (arriving) {
      // In front of the nearest real house, facing it, the camera turned to show its front (R3).
      this.player.position.set(n.spawn.x, 0, n.spawn.z);
      this.player.rotation.y = n.spawn.ry;
      this.turn = n.spawn.turn;
      this.angle = (this.turn * Math.PI) / 2;
      this.stop();
      this.snap = true;
      play("arrive");
    }
    this.updateHouses(houses);
    this.light();
    // A house opened from the address bar before its neighbourhood was built: go there now.
    if (this.pendingArrival) this.arriveAt(this.pendingArrival);
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

  /** The language changed: the words drawn in the city follow (a visitor's own tag, the knock bubbles' names). */
  relabel() {
    if (!this.opts.login) this.playerTag.say({ text: words.youTag });
    for (const p of this.placed) p.knocker?.traverse((o) => {
      if (o instanceof CSS2DObject) o.element.setAttribute("aria-label", words.knocking(p.house.name));
    });
    const a = this.arena;
    if (a) {
      a.label.say({ text: words.arena });
      a.model.redraw();
    }
    this.trophy(this.playerTag);
    for (const r of this.remotes.values()) this.trophy(r.tag);
    this.setResidents(this.residents);
  }

  setQuality(quality: "high" | "low", reduceMotion: boolean) {
    if (quality !== this.opts.quality) this.easedOff = 0;
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
   * "houses": houses are the only things to aim at ([ and ], reach, hover and clicks pass over everything else).
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
   * narrow screen, where windows are bottom sheets, it zooms and lifts you into the top third, above the sheet).
   * "follow": back to normal, at the zoom the wheel chose. Eased either way, unless motion is calm.
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
   * Puts you on the sidewalk in front of a house's door, facing it, with the camera turned so its front is in frame:
   * at once, no glide (R3). For a house opened from the address bar, the top bar or Find. A house that isn't in this
   * neighbourhood yet is remembered, and you arrive once it's built.
   */
  arriveAt(houseId: string) {
    const p = this.placed.find((x) => x.house.id === houseId);
    if (!p) {
      this.pendingArrival = houseId;
      return;
    }
    this.pendingArrival = null;
    const facing = p.group.userData.facing as Facing;
    // Just out from the door, within reach of the house: the flatmates hang around either side of it, a step away.
    const at = facingFront({ x: p.door.x, z: p.door.z, facing }, 0.4, this.turn);
    this.player.position.set(at.x, 0, at.z);
    this.player.rotation.y = at.ry;
    this.turn = at.turn;
    this.angle = (at.turn * Math.PI) / 2;
    this.stop();
    this.dashUntil = 0;
    this.setHover(null);
    this.snap = true;
    this.arrival = { placed: p, x: at.x, z: at.z };
  }

  /** Fireworks over a house and a cheer (R8); with calm motion, a soft glow. Vue decides when (a project went online). */
  celebrate(houseId: string) {
    const p = this.placed.find((x) => x.house.id === houseId);
    if (!p) return;
    // In front of its face, at the height of its roof: from the isometric camera that reads as "over the house",
    // and it stays in frame when you stand in the street in front of it.
    const top = new THREE.Box3().setFromObject(p.group).max.y;
    const front = p.group.position.clone().lerp(p.door, 0.9).setY(Math.min(top, 5) - 1.2);
    this.fireworks.celebrate(front, this.opts.reduceMotion);
    play("celebrate");
  }

  /**
   * A speech bubble over someone for about 5 s (bubbles.ts): someone online here, a flatmate out front, or you. Plain
   * text, cut to about 80 characters; their newer line replaces the older one. Not on screen here: nothing.
   */
  say(login: string, text: string) {
    this.life.say(login, text);
  }

  /**
   * Plays one of a house's happenings at the house (life.ts, happenings.ts): a review's envelope and coin, a crash's
   * red window and puff, a project's fireworks, a team's confetti. A house that isn't in this neighbourhood: nothing.
   */
  happening(houseId: string, h: CityHappening) {
    this.life.happening(houseId, h);
  }

  /**
   * A quest marker at a house's door: a glowing ring, a column of light, a diamond above (beacon.ts). Null takes it
   * away. A house that isn't built yet gets it as soon as it is.
   */
  setBeacon(houseId: string | null) {
    this.beaconHouse = houseId;
    if (!houseId) {
      this.beacon?.dispose();
      this.beacon = null;
    } else if (!this.beacon) {
      this.beacon = new Beacon();
      this.beacon.object.visible = false;
      this.scene.add(this.beacon.object);
    }
  }

  /**
   * Points the arrow at the screen's edge at a house (picked from Find or the big map) while its door is off screen,
   * until you're at it. Null stops pointing. The tutorial's beacon, when there is one, takes precedence.
   */
  pointAt(houseId: string | null) {
    this.pointHouse = houseId;
  }

  /** Where a house's door is (where you'd walk to), or null if it isn't in this neighbourhood (yet). */
  houseSpot(houseId: string): { x: number; z: number } | null {
    const p = this.placed.find((x) => x.house.id === houseId);
    return p ? { x: p.door.x, z: p.door.z } : null;
  }

  /**
   * The city's live state, without rebuilding anything: each house's windows (one per room), the crane while a build
   * runs, the power (a real house whose caretaker is offline goes dark, with a sputter, and comes back with a clunk),
   * the visitor at the door while a knock is open, and the board's pins. `setNeighbourhood` calls it too.
   */
  updateHouses(houses: CityHouse[]) {
    for (const h of houses) this.houses.set(h.id, h);
    for (const p of this.placed) {
      const house = this.houses.get(p.house.id);
      if (!house) continue;
      // The card Vue opens shows the latest state.
      p.house = house;
      p.target = { kind: "house", house };
      const live = liveState(house);
      const key = liveKey(live);
      if (key === p.live) continue;
      const first = p.live === "";
      p.live = key;
      const changed = p.face.update(live);
      this.darken(p, live.powerCut);
      this.knocker(p, live.knocking > 0);
      // Sounds only for a change you witness, not for what was already so when you arrived.
      if (first) continue;
      if (changed.cut) play("sputter");
      if (changed.restored) play("clunk");
      if (changed.buildStarted) play("build");
    }
    // The roofs' smoke follows the rooms' CPU use.
    this.life.touch();
    this.pinBoard();
  }

  /**
   * Single-character keyboard shortcuts on or off (the "Keyboard shortcuts" setting, R6 / WCAG 2.1.4). Off: W A S D,
   * E, Q, R, [ and ] do nothing; the arrow keys, Enter, Shift (dash) and Escape still work.
   */
  setShortcuts(on: boolean) {
    this.shortcuts = on;
    if (!on) for (const k of [...this.keys]) if (k.length === 1) this.keys.delete(k);
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

  /**
   * Fast travel, the only kind left: from the big map, straight to a house's door (as `arriveAt`), with the arrival's
   * sound. The minimap no longer travels: walking is the game.
   */
  travelTo(houseId: string) {
    this.clearHighlight();
    this.arriveAt(houseId);
    play("arrive");
  }

  /** Walks to the sidewalk in front of an empty plot, then selects it. */
  goToPlot(key: string) {
    const p = this.plots.find((x) => x.key === key);
    if (p) this.walkToward(p);
  }

  /** Who's around in this lobby, for Find: people really online, flatmates out front, passers-by. */
  peopleHere(): { login: string; name: string }[] {
    const people = new Map<string, string>();
    for (const thing of [...this.remotes.values(), ...this.npcs.filter((n) => n.avatar.visible)]) {
      if (thing.target.kind === "person") people.set(thing.target.login, thing.target.name);
    }
    return [...people].map(([login, name]) => ({ login, name }));
  }

  /** Walks to just beside someone (really online, or a flatmate out front), then selects them. */
  goToPerson(login: string) {
    const who = this.remotes.get(login) ?? this.npcs.find((n) => n.login === login && n.avatar.visible);
    if (who) this.walkToward(who);
  }

  /** What the Arena's big screen shows (null: just its name). Kept for the next city's Arena too. */
  setArena(display: ArenaDisplay | null) {
    this.arenaDisplay = display;
    this.arena?.model.setDisplay(display);
  }

  /**
   * To the Arena's entrance. By default at once (fast travel, like `travelTo`): in the street in front of the gate,
   * facing it, the camera turned to see it, the entrance in reach. `"walk"` walks there instead, and uses it on
   * arrival. Nothing in a city without one.
   */
  goToArena(how: "travel" | "walk" = "travel") {
    const a = this.arena;
    if (!a) return;
    if (how === "walk") {
      if (this.controls.walk) this.walkToward(a);
      return;
    }
    const at = facingFront({ ...a.plan.gate.outerEdge, facing: a.plan.facing }, 1, this.turn);
    this.player.position.set(at.x, 0, at.z);
    this.player.rotation.y = at.ry;
    this.turn = at.turn;
    this.angle = (at.turn * Math.PI) / 2;
    this.stop();
    this.dashUntil = 0;
    this.arrival = null;
    this.setHover(null);
    this.clearHighlight();
    this.snap = true;
    play("arrive");
  }

  /** Someone's title, worn on their name tag (yours too), when it changed after they arrived. Null takes it off. */
  setBadge(login: string, badge: Badge | null) {
    const tag = login === this.opts.login ? this.playerTag : this.remotes.get(login)?.tag;
    if (!tag) return;
    this.tagBadges.set(tag, badge);
    this.trophy(tag);
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

  // ---- Everyone else who's online here ----

  addRemote(p: { login: string; name: string | null; avatar: string | null; x: number; z: number; ry: number; moving: boolean; badge?: Badge | null; homeCity?: string | null }) {
    this.homeCities.set(p.login, p.homeCity ?? null);
    // The line says who we are too: that's where your own title and home city come from.
    if (p.login === this.opts.login) {
      this.setBadge(p.login, p.badge ?? null);
      this.badge(this.playerTag, p.login);
    }
    if (p.login === this.opts.login || this.remotes.has(p.login)) return;
    const name = p.name ?? p.login;
    const { avatar, tag } = this.makePerson(p.login, name, "person");
    this.tagBadges.set(tag, p.badge ?? null);
    this.trophy(tag);
    // Someone who just arrived stands at the neighbourhood's entrance, next to where you came in.
    const start = p.x || p.z ? new THREE.Vector3(p.x, 0, p.z) : this.player.position.clone().add(new THREE.Vector3(1.5, 0, 1));
    avatar.position.copy(start);
    avatar.rotation.y = p.ry;
    this.scene.add(avatar);
    const remote: Remote = { avatar, goal: start.clone(), ry: p.ry, moving: p.moving, tag, character: p.avatar, target: { kind: "person", login: p.login, name }, spot: avatar.position };
    this.remotes.set(p.login, remote);
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
    window.removeEventListener("blur", this.releaseKeys);
    document.removeEventListener("visibilitychange", this.releaseKeys);
    this.fireworks.dispose();
    this.life.dispose();
    this.setBeacon(null);
    for (const p of this.placed) p.face.dispose();
    this.arena?.model.dispose();
    this.renderer.domElement.removeEventListener("pointerdown", this.touchStage);
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
    this.tags.dispose();
    this.arrow.remove();
  }

  // ---- Targets: what you can aim at, and using it ----

  /** Every target in the neighbourhood right now. */
  private things(): Thing[] {
    if (this.controls.targets === "houses") return [...this.placed];
    return [...this.placed, ...this.plots, ...this.npcs.filter((n) => n.avatar.visible), ...this.remotes.values(), ...(this.board ? [this.board] : []), ...(this.arena ? [this.arena] : [])];
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

  /**
   * The thing you're standing next to. Houses outrank people: at a door, the flatmates hanging around it would
   * otherwise always win, and E would say hi instead of going in. So a person wins only when clearly nearer than
   * any building, and right after `arriveAt` the house you arrived at wins outright.
   */
  private reach(): Thing | null {
    if (this.arrival) return this.arrival.placed;
    // The nearest of a list within REACH, and how far it is.
    const nearest = (list: Iterable<Thing>): [Thing | null, number] => {
      let best: Thing | null = null;
      let range = REACH;
      for (const t of list) {
        const d = this.distanceTo(t);
        if (d < range) [best, range] = [t, d];
      }
      return [best, range];
    };
    // Only houses are targets: skip straight to them.
    const all = this.controls.targets === "all";
    const [building, db] = nearest(all ? [...this.placed, ...this.plots, ...(this.board ? [this.board] : []), ...(this.arena ? [this.arena] : [])] : this.placed);
    if (!all) return building;
    const [person, dp] = nearest([...this.npcs.filter((n) => n.avatar.visible && !n.passerby), ...this.remotes.values()]);
    if (person && (!building || dp + PEOPLE_MARGIN < db)) return person;
    // Someone passing by is in reach only when nothing else is, so they never steal a door's prompt as they walk past.
    return building ?? nearest(this.walkers.filter((w) => w.avatar.visible))[0];
  }

  private isRemote(t: Thing): boolean {
    for (const r of this.remotes.values()) if (r === t) return true;
    return false;
  }

  /** Uses a thing you're next to: Vue opens it. */
  private use(thing: Thing) {
    this.events.onSelect(thing.target, "use");
  }

  /**
   * Sets off for a thing, to use it on arrival. A building can be used from any side: you head for the free
   * ground within reach of its walls that's nearest by foot. For a person, you stop a step away on your side of
   * them.
   */
  private walkToward(thing: Thing) {
    // Setting off for something else drops the highlight, so what's in reach on arrival is what you use.
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

  /** What gets an outline when a thing is hovered or highlighted: its model(s), but not the ring at a person's feet. */
  private outlineOf(thing: Thing): THREE.Object3D[] {
    if (thing.target.kind === "house") return [(thing as Placed).group];
    if (thing.target.kind === "empty") return (thing as EmptyPlot).objects;
    if (thing.target.kind === "board") return [(thing as Board).group];
    if (thing.target.kind === "arena") return [(thing as Arena).model.group];
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

  /** Dashed centre lines along every street, and zebra crossings at every crossing where the city paints them. One draw call each. */
  private streetMarkings(n: Neighbourhood, zebra: boolean) {
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
    for (const p of zebra ? n.intersections : []) {
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
      if (!list.length) continue;
      const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), white, list.length);
      list.forEach((m, i) => mesh.setMatrixAt(i, m));
      // Markings are paint on the road, not something to aim at: the mouse looks straight through them.
      mesh.raycast = () => undefined;
      this.town.add(mesh);
    }
  }

  /**
   * The market square: parasols over stalls, everyone's meeting point. In a city with wax-print cloth, the stalls
   * are drawn here with wax-print canopies; elsewhere they're Kenney's parasols. The south edge stays clear for the
   * chores board.
   */
  private market(b: { x: number; z: number; width: number; depth: number }, rand: () => number, gen: number) {
    const spots = Array.from({ length: 8 }, () => ({
      x: b.x + (rand() - 0.5) * (b.width - 4),
      z: b.z - (b.depth - 4) / 2 + rand() * (b.depth - 7),
      turn: rand() * Math.PI * 2,
    }));
    if (this.style.props.includes("wax-parasols")) {
      this.town.add(waxParasols(spots, [waxPrint(`${this.style.city}:a`), waxPrint(`${this.style.city}:b`)]));
      return;
    }
    spots.forEach((s, i) =>
      this.load(gen, loadModel(PARASOLS[i % 2], 1.9), (m) => {
        m.position.set(s.x, 0.15, s.z);
        m.rotation.y = s.turn;
      }),
    );
  }

  /**
   * What stands on a flat roof, in a city that has it: a black water tank, and on some shops the rebar of an upper
   * floor still to come. `roll` is the plot's own dice roll, so the same roof always gets the same.
   */
  private onRoof(model: THREE.Object3D, shop: boolean, roll: number) {
    const props = this.props;
    if (!props) return;
    const has = this.style.props;
    const b = new THREE.Box3().setFromObject(model);
    if (has.includes("water-tanks") && roll < 0.55) props.tank(b.max.x - 0.8, b.max.y, b.min.z + 0.8);
    if (has.includes("rebar") && shop && roll > 0.6) props.rods(b.min.x + 0.3, b.max.z - 0.3, b.min.x + 0.3 + (b.max.x - b.min.x) * 0.6, b.max.z - 0.3, b.max.y, seeded(`rebar:${roll}`));
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
        freeze(m);
      })
      .catch(() => undefined);
  }

  /** A real house: placeholder first, its model when loaded, a window per room on its front, flatmates out front. */
  private placeHouse(house: CityHouse, x: number, z: number, facing: Facing, gen: number) {
    const placeholder = makeHouse(house);
    const group = new THREE.Group();
    group.add(placeholder.group);
    group.position.set(x, 0.14, z);
    group.rotation.y = yaw(facing);
    group.userData.houseId = house.id;
    group.userData.facing = facing;
    // Its name on a flag, after a little square in the house's colour (its flatmates' rings, its marker on the map).
    this.flags.push(new Tag(group, 6.4, { kind: "house", text: house.name, swatch: `#${new THREE.Color(colorFor(house.id)).getHexString()}` }));
    this.town.add(group);
    const box = this.solid(x, z, facing, placeholder.halfWidth * 2, placeholder.halfDepth * 2);
    // The placeholder is its own windows; the face takes over once the model is in.
    const face = new HouseFace(house.rooms.length);
    face.group.visible = false;
    group.add(face.group);
    const placed: Placed = {
      house,
      group,
      box,
      door: new THREE.Vector3(),
      npcs: [],
      target: { kind: "house", house },
      spot: new THREE.Vector3(),
      face,
      live: "",
      materials: [],
      knocker: null,
    };
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
          dye(model, this.style);
          group.add(model);
          this.occluder(model);
          freeze(model);
          // Its own copies of its materials (see `occluder`), remembered with their colours for a power cut.
          model.traverse((o) => {
            const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
            if ((o as THREE.Mesh).isMesh && m?.color) placed.materials.push({ material: m, color: m.color.clone() });
          });
          if (liveState(placed.house).powerCut) this.darken(placed, true);
          // Windows on the front wall: its walls stop where the roof starts, a little over half the model's height.
          face.fit(local.max.x - local.min.x - 0.6, (local.max.y - local.min.y) * 0.58, local.max.z);
          face.group.visible = true;
          // The real footprint replaces the placeholder's; the walk grid follows on the next route.
          Object.assign(box, footprint(x, z, facing, local.max.x - local.min.x, local.max.z - local.min.z));
          this.gridDirty = true;
          this.fitDoor(placed, facing, local.max.z);
        })
        .catch(() => undefined);
    }

    this.addFlatmates(placed, house);
  }

  /**
   * The flatmates hang around in front (unless they're online: then it's really them walking), on either side of
   * the door and a step apart, so the doorway stays clear and nobody stands inside anybody (R39).
   */
  private addFlatmates(placed: Placed, house: CityHouse) {
    const facing = placed.group.userData.facing as Facing;
    flatmatesOf(house)
      .forEach((person, k) => {
        const login = person.login;
        const name = person.name ?? login;
        const { avatar, tag } = this.makePerson(login, name, "small");
        avatar.visible = !this.remotes.has(login) && login !== this.opts.login;
        this.town.add(avatar);
        const npc: Npc = { login, avatar, home: new THREE.Vector3(), goal: new THREE.Vector3(), wait: Math.random() * 3, tag, target: { kind: "person", login, name }, spot: avatar.position };
        const side = k % 2 ? 1 : -1;
        npc.home.copy(placed.door).add(rotate(side * (1.1 + Math.floor(k / 2) * 1.1), 0.7, yaw(facing)));
        npc.goal.copy(npc.home);
        avatar.position.copy(npc.home);
        this.npcs.push(npc);
        placed.npcs.push(npc);
      });
  }

  /** A house whose flatmates aren't the ones standing outside any more: those go, the new ones come out. */
  private refreshFlatmates(house: CityHouse) {
    const placed = this.placed.find((p) => p.house.id === house.id);
    if (!placed) return;
    const logins = flatmatesOf(house).map((p) => p.login);
    if (logins.join() === placed.npcs.map((n) => n.login).join()) return;
    for (const n of placed.npcs) {
      this.npcs.splice(this.npcs.indexOf(n), 1);
      n.avatar.parent?.remove(n.avatar);
      removeLabels(n.avatar);
      disposeTree(n.avatar);
      if (this.useOnArrival === n) this.stop();
      if (this.highlighted === n) this.clearHighlight();
      if (this.hover === n) this.setHover(null);
      if (this.near === n) this.near = null;
    }
    placed.npcs = [];
    this.addFlatmates(placed, house);
  }

  /**
   * Passers-by (passersby.ts): made-up people with GitHub-style handles on their tags, walking round the blocks on
   * the sidewalks and crossing at the zebras, so a city has life beyond the few flatmates by their doors. They're all
   * made at once; how many show depends on the quality (`showPassersBy`).
   */
  private addPassersBy(n: Neighbourhood) {
    this.sidewalks = sidewalks(n.blocks);
    if (!this.sidewalks.length) return;
    const rand = seeded(`walkers:${n.city}`);
    for (const who of [...visitorsIn(n.city, VISITORS), ...passersBy(n.city, MOST - VISITORS)]) {
      this.homeCities.set(who.login, who.from ?? n.city);
      const dir: 1 | -1 = rand() < 0.5 ? 1 : -1;
      const stroll: Stroll = { block: Math.floor(rand() * this.sidewalks.length), at: Math.floor(rand() * 16), dir, lane: laneFor(dir, rand) };
      const at = standAt(this.sidewalks[stroll.block][stroll.at], stroll.lane);
      // The tag shows their handle; the card (the target's name) their full name.
      const { avatar, tag } = this.makePerson(who.login, who.login, "small");
      avatar.position.set(at.x, 0, at.z);
      avatar.rotation.y = rand() * Math.PI * 2;
      const walker: Npc = {
        login: who.login,
        avatar,
        home: avatar.position.clone(),
        goal: avatar.position.clone(),
        wait: rand() * 4,
        tag,
        target: { kind: "person", login: who.login, name: who.name, example: true },
        spot: avatar.position,
        passerby: { stroll, next: null, speed: 1.1 + rand() * 0.5 },
      };
      this.town.add(avatar);
      this.npcs.push(walker);
      this.walkers.push(walker);
    }
    if (this.arena) this.addFans(n, this.arena);
    this.showPassersBy();
  }

  /**
   * Some passers-by go to the Arena: one in eight stays in the stands, one in four walks over now and then and stands
   * round the stage a while (half of those start there, so the Arena is never empty when you arrive). Picked by their
   * place in the list, so a few still go on low quality (see `showPassersBy`).
   */
  private addFans(n: Neighbourhood, a: Arena) {
    a.ring = n.blocks.findIndex((b) => b.kind === "arena");
    const ring = this.sidewalks[a.ring];
    if (!ring) return;
    // The point of the Arena's sidewalk in front of the entrance: where fans walk back out to.
    let best = Infinity;
    ring.forEach((p, i) => {
      const d = Math.hypot(p.x - a.door.x, p.z - a.door.z);
      if (d < best) [best, a.exit] = [d, i];
    });
    const rand = seeded(`fans:${n.city}`);
    const { seats, spots } = a.plan;
    const now = this.clock.elapsedTime;
    let visitors = 0;
    this.walkers.forEach((w, i) => {
      const walk = w.passerby!;
      const pos = w.avatar.position;
      if (i % 8 === 3) {
        const seat = seats[(i * 11 + Math.floor(rand() * 5)) % seats.length];
        pos.set(seat.x, seat.y + 0.15, seat.z);
        w.avatar.rotation.y = seat.ry;
        walk.fan = { seat: true, phase: "inside", until: Infinity, route: [], spot: 0 };
      } else if (i % 4 === 1) {
        const inside = visitors++ % 2 === 0;
        const spot = (i + Math.floor(rand() * 3)) % spots.length;
        if (inside) pos.set(spots[spot].x, 0, spots[spot].z);
        walk.fan = { seat: false, phase: inside ? "inside" : "street", until: now + rand() * (inside ? FAN.inside[1] : FAN.street[1]), route: [], spot };
      }
    });
  }

  /** A fan whose time in the streets is up sets off for a spot round the stage, through the entrance. False: no way there. */
  private setOff(fan: Fan, from: THREE.Vector3): boolean {
    const a = this.arena;
    if (!a) return false;
    fan.spot = Math.floor(Math.random() * a.plan.spots.length);
    fan.route = this.routeFor(from, a.plan.spots[fan.spot]);
    if (!fan.route.length) {
      fan.until = this.clock.elapsedTime + 10;
      return false;
    }
    fan.phase = "going";
    return true;
  }

  /**
   * A fan's step at the Arena: walking in along their route, standing round the stage watching (now and then a spot
   * along), walking back out to the sidewalk once their time is up, then off round the blocks again. One in the stands
   * just watches.
   */
  private fanStep(n: Npc, walk: NonNullable<Npc["passerby"]>, fan: Fan, dt: number) {
    const a = this.arena;
    const pos = n.avatar.position;
    if (fan.seat || !a) {
      n.person?.play("idle");
      return;
    }
    if (fan.route.length) {
      // On the way: straight at the route's next point, then the one after.
      const next = fan.route[0];
      const dx = next.x - pos.x;
      const dz = next.z - pos.z;
      const d = Math.hypot(dx, dz);
      const step = walk.speed * dt;
      if (d <= step) {
        pos.set(next.x, 0, next.z);
        fan.route.shift();
      } else {
        pos.x += (dx / d) * step;
        pos.z += (dz / d) * step;
        n.avatar.rotation.y = Math.atan2(dx, dz);
      }
      n.person?.play("walk");
      return;
    }
    const now = this.clock.elapsedTime;
    if (fan.phase === "leaving") {
      // Back on the sidewalk in front of the entrance: round the blocks again, for a while.
      fan.phase = "street";
      fan.until = now + FAN.street[0] + Math.random() * FAN.street[1];
      walk.stroll = { block: a.ring, at: a.exit, dir: walk.stroll.dir, lane: walk.stroll.lane };
      walk.next = null;
      return;
    }
    if (fan.phase === "going") {
      fan.phase = "inside";
      fan.until = now + FAN.inside[0] + Math.random() * FAN.inside[1];
    }
    if (n.wait > 0) {
      // Watching the ring.
      n.wait -= dt;
      n.avatar.rotation.y = Math.atan2(a.plan.centre.x - pos.x, a.plan.centre.z - pos.z);
      n.person?.play("idle");
      return;
    }
    if (now > fan.until && this.sidewalks[a.ring]) {
      const route = this.routeFor(pos, a.plan.gate.door);
      if (route.length) {
        const out = standAt(this.sidewalks[a.ring][a.exit], walk.stroll.lane);
        route.push(new THREE.Vector3(out.x, 0, out.z));
        fan.route = route;
        fan.phase = "leaving";
        return;
      }
    }
    // A spot along, one way or the other, then a while watching.
    const spots = a.plan.spots;
    fan.spot = (fan.spot + (Math.random() < 0.5 ? 1 : spots.length - 1)) % spots.length;
    fan.route = [new THREE.Vector3(spots[fan.spot].x, 0, spots[fan.spot].z)];
    n.wait = 3 + Math.random() * 6;
  }

  /** A route on the walk grid between two points, without its first point (where you are). Empty when there's no way. */
  private routeFor(from: THREE.Vector3, to: Point): THREE.Vector3[] {
    const grid = this.grid();
    const found = findPath(grid, { x: from.x, z: from.z }, to);
    return found ? smooth(grid, found).slice(1).map((p) => new THREE.Vector3(p.x, 0, p.z)) : [];
  }

  /** As many passers-by as the quality allows (fewer on low, and on a phone's small screen). */
  private showPassersBy() {
    const count = passerbyCount(this.opts.quality, window.innerWidth < 520);
    this.walkers.forEach((w, i) => {
      w.avatar.visible = i < count;
    });
  }

  /**
   * Only the people around the view are in the scene, and they get their model the first time they come by. The rest
   * keep walking as a position and nothing else: a person is about 30 objects (their skeleton) that three.js would go
   * through every frame, and a city of 100 houses has 400 of them.
   */
  private stage() {
    const at = this.scratch;
    const onStage = (who: Npc | Remote, home: THREE.Object3D) => {
      at.copy(who.avatar.position).project(this.camera);
      const near = Math.abs(at.x) < STAGE_EDGE && Math.abs(at.y) < STAGE_EDGE;
      if (near && !who.avatar.parent) home.add(who.avatar);
      else if (!near && who.avatar.parent) home.remove(who.avatar);
      if (near) this.dressUp(who);
    };
    for (const n of this.npcs) onStage(n, this.town);
    for (const r of this.remotes.values()) onStage(r, this.scene);
  }

  private dressUp(who: Npc | Remote) {
    if (who.person || who.dressing || !who.avatar.visible) return;
    who.dressing = true;
    const { login } = who.avatar.userData as { login: string };
    const gen = this.generation;
    loadPerson(login, "character" in who ? who.character : undefined)
      .then((person) => {
        // Rebuilt or gone meanwhile.
        if (gen !== this.generation && !("character" in who)) return;
        if ("character" in who && this.remotes.get(login) !== who) return;
        who.person = person;
        this.dress(who.avatar, person);
      })
      .catch(() => undefined);
  }

  /**
   * One passer-by's step: on to the next point of their walk round the block (`walkAhead`), now and then a pause.
   * Someone you've picked, are walking to or standing next to stops and turns to you, so you can say hi.
   */
  private walkOn(n: Npc, walk: NonNullable<Npc["passerby"]>, dt: number) {
    const pos = n.avatar.position;
    if (this.highlighted === n || this.near === n || this.useOnArrival === n) {
      n.avatar.rotation.y = Math.atan2(this.player.position.x - pos.x, this.player.position.z - pos.z);
      n.person?.play("idle");
      return;
    }
    // A fan at the Arena, or on their way there or back (see `fanStep`).
    const fan = walk.fan;
    if (fan && fan.phase !== "street") return this.fanStep(n, walk, fan, dt);
    if (n.wait > 0) {
      n.person?.play("idle");
      n.wait -= dt;
      return;
    }
    if (!walk.next) {
      // A fan whose time in the streets is up heads for the Arena from here.
      if (fan && this.clock.elapsedTime > fan.until && this.setOff(fan, pos)) return;
      walk.stroll = walkAhead(this.sidewalks, walk.stroll, Math.random);
      const p = standAt(this.sidewalks[walk.stroll.block][walk.stroll.at], walk.stroll.lane);
      walk.next = new THREE.Vector3(p.x, 0, p.z);
    }
    const next = walk.next;
    const to = new THREE.Vector3(next.x - pos.x, 0, next.z - pos.z);
    const step = walk.speed * dt;
    if (to.length() <= step) {
      pos.set(next.x, 0, next.z);
      walk.next = null;
      // Now and then they stop a moment, mostly at a zebra.
      const zebra = walk.stroll.at % 4 === 1 || walk.stroll.at % 4 === 2;
      if (Math.random() < (zebra ? 0.2 : 0.04)) n.wait = 1 + Math.random() * 3;
    } else {
      to.setLength(step);
      pos.add(to);
      n.avatar.rotation.y = Math.atan2(to.x, to.z);
    }
    n.person?.play("walk");
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
    p.knocker?.position.add(moved);
    // You arrived at this house and haven't moved since: you step out with its door.
    const a = this.arrival;
    const you = this.player.position;
    if (a?.placed === p && Math.abs(you.x - a.x) < 0.01 && Math.abs(you.z - a.z) < 0.01) {
      you.add(moved);
      this.arrival = { placed: p, x: you.x, z: you.z };
      this.snap = true;
    }
  }

  /** A power cut: the house's walls go dim (its windows go dark in windows.ts). Back to its colours when it's over. */
  private darken(p: Placed, dark: boolean) {
    for (const { material, color } of p.materials) material.color.copy(color).multiplyScalar(dark ? 0.42 : 1);
  }

  /**
   * Someone waits at the door while a knock is open (R32): a faceless visitor, grey, with a "☝️" bubble. Not a
   * target: Vue's house card says who it is to the flatmates.
   */
  private knocker(p: Placed, on: boolean) {
    if (!on && p.knocker) {
      removeLabels(p.knocker);
      p.knocker.parent?.remove(p.knocker);
      disposeTree(p.knocker);
      p.knocker = null;
    }
    if (!on || p.knocker) return;
    const visitor = makeAvatar(0x9a96a0);
    const facing = p.group.userData.facing as Facing;
    const dir = FACING_DIR[facing];
    // A step from the wall, between the door and the flatmates out front, facing the door.
    visitor.position.set(p.door.x - dir.x * 0.45 + dir.z * 0.5, 0, p.door.z - dir.z * 0.45 - dir.x * 0.5);
    visitor.rotation.y = Math.atan2(-dir.x, -dir.z);
    const el = document.createElement("div");
    el.className = "lobby-emote knock";
    el.textContent = "☝️";
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", words.knocking(p.house.name));
    const bubble = new CSS2DObject(el);
    bubble.position.set(0, 2.1, 0);
    visitor.add(bubble);
    this.town.add(visitor);
    p.knocker = visitor;
    loadPerson(`knocker:${p.house.id}`)
      .then((person) => {
        if (p.knocker !== visitor) return;
        this.dress(visitor, person);
      })
      .catch(() => undefined);
  }

  /**
   * The street lamps: scenery only, always off (no light, no switching). Two instanced meshes, posts and bulbs: two
   * draw calls however many crossings there are.
   */
  private addLamps(spots: { x: number; z: number }[]) {
    const n = spots.length;
    if (!n) return;
    const post = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.08, 2.6, 8), new THREE.MeshStandardMaterial({ color: 0x2c2a33, roughness: 0.6, metalness: 0.4 }), n);
    const bulb = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 14, 10), new THREE.MeshStandardMaterial({ color: 0x77736c }), n);
    const m = new THREE.Matrix4();
    spots.forEach((p, i) => {
      post.setMatrixAt(i, m.makeTranslation(p.x, 1.3, p.z));
      bulb.setMatrixAt(i, m.makeTranslation(p.x, 2.7, p.z));
    });
    post.castShadow = true;
    for (const mesh of [post, bulb]) mesh.computeBoundingSphere();
    this.town.add(post, bulb);
  }

  /** The chores board on the market square (R19): a cork board on two legs, facing the street. */
  private addBoard(at: { x: number; z: number; facing: Facing }, city: string) {
    const group = makeBoard();
    group.position.set(at.x, 0.15, at.z);
    group.rotation.y = yaw(at.facing);
    group.userData.board = true;
    const pins = new THREE.Group();
    group.add(pins);
    this.town.add(group);
    const front = frontOf(at, 1.2);
    const door = new THREE.Vector3(front.x, 0, front.z);
    const box = this.solid(at.x, at.z, at.facing, 2.2, 0.4);
    this.board = { group, pins, box, door, spot: door.clone(), target: { kind: "board", city } };
  }

  /**
   * The Arena (arena.ts) on its block: the stadium and its pitch; its stands are walls with the entrance left open (the
   * walk grid follows), each piece fading on its own when it stands between the camera and you; its name on a flag
   * over the middle, like a house's. A target at the entrance: in reach anywhere in the passage or just outside it.
   */
  private addArena(site: NonNullable<Neighbourhood["arena"]>, city: string) {
    const plan = arenaPlan(site);
    const model = new ArenaModel(plan, this.style, this.opts.quality);
    this.town.add(model.group, model.ground);
    this.solids.push(...plan.colliders);
    model.group.updateMatrixWorld(true);
    for (const piece of model.stands) this.occluder(piece);
    const label = new Tag(model.group, 7.6, { kind: "arena", text: words.arena });
    this.flags.push(label);
    model.setDisplay(this.arenaDisplay);
    const door = new THREE.Vector3(plan.gate.door.x, 0, plan.gate.door.z);
    this.arena = { model, plan, box: plan.gate.box, door, label, spot: door.clone(), target: { kind: "arena", city }, ring: -1, exit: 0 };
  }

  /**
   * Who's inside the Arena (you, others online, passers-by who show), told to Vue when it changes. A few times a
   * second, over the lists as they are: nothing new is made.
   */
  private countCrowd() {
    const a = this.arena;
    let n = 0;
    if (a) {
      const plan = a.plan;
      if (insideBowl(plan, this.player.position.x, this.player.position.z)) n++;
      for (const r of this.remotes.values()) if (insideBowl(plan, r.avatar.position.x, r.avatar.position.z)) n++;
      for (const w of this.walkers) if (w.avatar.visible && insideBowl(plan, w.avatar.position.x, w.avatar.position.z)) n++;
    }
    if (n === this.crowd.n) return;
    this.crowd.n = n;
    this.events.onArenaCrowd?.(n);
  }

  /** A pin on the board for each house with reviews waiting; red when one is late. */
  private pinBoard() {
    const b = this.board;
    if (!b) return;
    const wanted = this.placed.map((p) => liveState(p.house)).filter((l) => l.openChores > 0);
    const key = wanted.map((l) => (l.lateChores > 0 ? "r" : "y")).join("");
    if (b.pins.userData.key === key) return;
    b.pins.userData.key = key;
    disposeTree(b.pins);
    b.pins.clear();
    if (!key) return;
    b.pins.add(makePins(key.split("").map((k) => k === "r")));
  }

  /** The light: the sky, the sun and the fog of full day, tinted by the city's sky colour. Set when a city is built. */
  private light() {
    const l = daylight(new THREE.Color(this.style.palette.sky).getHex());
    this.hemi.color.setHex(l.sky);
    this.hemi.groundColor.setHex(l.ground);
    this.hemi.intensity = l.hemi;
    this.sun.color.setHex(l.sunColor);
    this.sun.intensity = l.sunPower;
    (this.scene.fog as THREE.Fog).color.setHex(l.fog);
    const key = `${l.top}:${l.bottom}`;
    if (key !== this.sky.key) {
      this.sky.key = key;
      const g = this.sky.canvas.getContext("2d")!;
      const grad = g.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, `#${l.top.toString(16).padStart(6, "0")}`);
      grad.addColorStop(1, `#${l.bottom.toString(16).padStart(6, "0")}`);
      g.fillStyle = grad;
      g.fillRect(0, 0, 2, 256);
      this.sky.texture.needsUpdate = true;
    }
  }

  // ---- People ----

  /** A placeholder person with a name tag (name, then their house) and a ring at their feet, in their house's colour. */
  private makePerson(login: string, name: string, kind: TagKind): { avatar: THREE.Group; tag: Tag } {
    const avatar = makeAvatar(colorFor(login));
    avatar.userData.login = login;
    avatar.userData.name = name;
    const tag = new Tag(avatar, 1.75, { kind, text: name });
    this.badge(tag, login);
    const ring = new THREE.Mesh(RING, ringPaint(NOBODY));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.17;
    ring.name = "ring";
    avatar.add(ring);
    this.paintRing(avatar, login);
    return { avatar, tag };
  }

  /**
   * Someone's figure on screen in this neighbourhood, for a bubble or a happening: you, someone online, or a flatmate
   * standing out front (not a made-up passer-by). Null when they aren't here.
   */
  private figure(login: string): THREE.Object3D | null {
    if (login === this.opts.login) return this.player;
    const remote = this.remotes.get(login);
    if (remote) return remote.avatar;
    return this.npcs.find((n) => n.login === login && !n.passerby && n.avatar.visible)?.avatar ?? null;
  }

  private paintRing(avatar: THREE.Group, login: string | null) {
    const ring = avatar.getObjectByName("ring") as THREE.Mesh | undefined;
    if (!ring) return;
    const home = login ? this.residents.get(login) : undefined;
    ring.material = ringPaint(home ? colorFor(home.houseId) : NOBODY);
  }

  /**
   * The small badge after a name: their house, on the house's colour (the same as the ring at their feet), so
   * flatmates read as a group. Someone without a house gets none: just their name. After it, "tourist" for someone
   * visiting from another city. Rebuilt whenever the residents change.
   */
  private badge(tag: Tag, login: string | null) {
    const home = login ? this.residents.get(login) : undefined;
    const tourist = this.touristsHere && !!login && isTourist(this.builtCity, home?.cities ?? [], this.homeCities.get(login));
    tag.say({ tourist: tourist ? words.tourist : null });
    if (!home) {
      tag.say({ home: null });
      return;
    }
    const color = new THREE.Color(colorFor(home.houseId));
    // Dark text on a light colour, white on a dark one. The colour's channels are linear, as luminance wants.
    const luminance = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
    tag.say({
      home: {
        text: home.houseName.length > 12 ? `${home.houseName.slice(0, 11)}…` : home.houseName,
        background: `#${color.getHexString()}`,
        color: luminance > 0.25 ? "#1d1d1f" : "#fff",
      },
    });
    // Their Arena title, as the city lists them, unless the live line already told us (people online, and you).
    const won = home.badge ?? null;
    if (login && login !== this.opts.login && !this.remotes.has(login) && JSON.stringify(this.tagBadges.get(tag) ?? null) !== JSON.stringify(won)) {
      this.tagBadges.set(tag, won);
      this.trophy(tag);
    }
  }

  /**
   * The title someone won in the Arena, right after their name: a trophy and the title in the chosen language, gold,
   * silver or bronze by place (badge.ts). People online and you, from the live line; the flatmates out front, from the
   * city's listing; passers-by never. When the tag is crowded its words go but the trophy stays, in its colour
   * (style.css); it's redrawn when the language changes.
   */
  private trophy(tag: Tag) {
    const badge = this.tagBadges.get(tag);
    if (!badge) {
      tag.say({ won: null });
      return;
    }
    const chip = badgeChip(badge, language.lang);
    tag.say({ won: { text: chip.text, tone: chip.tone } });
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
    // "yes" is the wave (the HUD's thumbs are gone, 15 10): a hand. "no" stays a thumbs down.
    el.textContent = name === "yes" ? "👋" : "👎";
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", name === "yes" ? words.waves : words.thumbsDown);
    const obj = new CSS2DObject(el);
    obj.position.set(0, 2.25, 0);
    avatar.add(obj);
    setTimeout(() => {
      el.remove();
      avatar.remove(obj);
    }, 2200);
  }

  // ---- Rendering, input, the frame loop ----

  /**
   * The machine can't keep up: draw less, in the order you'd notice least. First fewer pixels (a sharp screen has four
   * times as many as it needs for a city seen from afar), then no shadows. Your setting stays as you chose it.
   */
  private easeOff() {
    if (this.opts.quality !== "high" || this.easedOff >= 2) return;
    this.easedOff++;
    this.applyQuality();
  }

  private applyQuality() {
    const high = this.opts.quality === "high";
    this.showPassersBy();
    this.renderer.setPixelRatio(high && this.easedOff === 0 ? Math.min(window.devicePixelRatio, 2) : 1);
    const shadows = high && this.easedOff < 2;
    this.renderer.shadowMap.enabled = shadows;
    this.sun.castShadow = shadows;
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
    this.width = w;
    this.height = h;
    this.narrow = w < FRAMED.narrow;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.tags.setSize(w, h);
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
    // The shadows only need to cover what's on screen, plus what a tall building just outside it throws in. Less to
    // draw into the shadow map, and sharper shadows from the same map.
    const reach = width * SHADOW_REACH;
    Object.assign(this.sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach });
    this.sun.shadow.camera.updateProjectionMatrix();
  }

  /** Half of the view's width on the ground, for a zoom of `half`. */
  private halfWidth(half = this.viewHalf): number {
    // A phone held upright is narrow: show a little less of the town rather than shrinking everyone.
    return this.aspect < 1 ? half * 0.85 : half;
  }

  /**
   * Where the camera aims to look: at you, or, with a window open on the right, at a point to your right, so you
   * stand about a quarter of the way across the screen (on a phone, where the window is a bottom sheet, at a point
   * below you, so you stand in the top third). Writes into `out`.
   */
  private followPoint(out: THREE.Vector3): THREE.Vector3 {
    out.copy(this.player.position).setY(0);
    if (this.framing === "left" && this.narrow) {
      // A phone: the window is a sheet over the bottom of the screen. Aim below you, so you (and the house in front
      // of you) stand in the top third. The view looks down at about 39°, so a step on the ground towards the
      // bottom of the screen moves the picture by sin(39°) of a step.
      const down = rotate(1, 1, this.angle).normalize();
      const halfHeight = this.halfWidth() / this.aspect;
      out.addScaledVector(down, (halfHeight * 0.35) / Math.sin(Math.atan2(CAMERA_OFFSET.y, Math.hypot(CAMERA_OFFSET.x, CAMERA_OFFSET.z))));
    } else if (this.framing === "left") {
      // The screen's right, on the ground (the way D walks), turned with the camera. You're at the centre of the
      // screen plus `shift` to the left; the screen is 2 × halfWidth wide, so that puts you at FRAMED.at across.
      const right = rotate(1, -1, this.angle).normalize();
      const shift = (1 - 2 * FRAMED.at) * this.halfWidth();
      out.addScaledVector(right, shift);
    }
    return out;
  }

  /** You clicked or tapped the stage: it takes the keyboard focus, and keys pressed with nothing focused are ours. */
  private touchStage = () => this.takeKeys();

  /**
   * Whether a key press is for the city (R6): when the stage has focus, or when nothing has focus (the page itself)
   * once you've arrived with nothing over the city, or clicked the stage. Before that (the loading screen, the
   * welcome), the keys belong to the page. Tab is never the city's (see `keydown`).
   */
  private ownsKeys(): boolean {
    return cityOwnsKeys(document.activeElement, document.body, this.host, this.stageTouched);
  }

  /**
   * Hands the keyboard to the city, as a click on it would: the stage takes the focus and counts as touched. Vue
   * calls it when a welcome, a card, a sheet or a dialog closes, so the keys on screen (E, M, W A S D) work at once.
   */
  takeKeys() {
    this.keysOnArrival();
    if (!this.host.contains(document.activeElement)) this.host.focus({ preventScroll: true });
  }

  /** You've arrived: keys pressed with nothing focused are the city's, with no click. The focus stays where it is. */
  keysOnArrival() {
    this.stageTouched = true;
  }

  // The window lost the focus (Alt-Tab, another app) or the tab was hidden: no key-up will come for the keys held
  // down, so they're all let go, or you'd come back walking.
  private releaseKeys = () => {
    if (document.visibilityState === "visible" && document.hasFocus()) return;
    this.keys.clear();
    this.shiftAlone = false;
  };

  private keydown = (e: KeyboardEvent) => {
    if (!this.ownsKeys()) return;
    // Typing in a field elsewhere on the page isn't walking.
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    // Inside a sheet or a dialog (a house's inside, the big map, the keys), the keys belong to it. A floating card
    // isn't modal: you can still walk away from it.
    if (t?.closest?.('[aria-modal="true"], dialog')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // W A S D, Q, E and R by their place on the keyboard (AZERTY's Z Q S D walk), the rest as typed (keys.ts).
    const k = cityKey(e);
    // Single-character shortcuts switched off in settings (WCAG 2.1.4): W A S D, E, Q, R, [ and ] do nothing.
    // The arrows, Enter, Shift and Escape still work.
    if (!this.shortcuts && k.length === 1) return;
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
    // [ and ] pick the previous and next target. Tab is never taken: it always moves the focus, in and out of the
    // city, like anywhere else on the page.
    if (k === "]" || k === "[") this.cycle(k === "]" ? 1 : -1);
    if (k === "escape") this.clearHighlight();
    // A tap of Shift dashes when you let go, unless another key was pressed meanwhile.
    if (k === "shift" && !e.repeat) this.shiftAlone = true;
    else if (e.shiftKey && !e.repeat) this.shiftAlone = false;
    if (k === "e" || k === "enter") this.interact();
    if (k === "q") this.turnView(-1, !e.repeat);
    if (k === "r") this.turnView(1, !e.repeat);
  };

  private keyup = (e: KeyboardEvent) => {
    const k = cityKey(e);
    // Always let go of a key, wherever the focus went meanwhile.
    this.keys.delete(k);
    if (k === "shift" && this.shiftAlone) this.dash();
    this.shiftAlone = false;
  };

  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoom = THREE.MathUtils.clamp(this.zoom + Math.sign(e.deltaY) * 1.2, ZOOM.min, ZOOM.max);
  };

  /** What the mouse is on: a thing (a person, a house, an empty plot, the board, the Arena), a point on the ground, or nothing. */
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
      // A house, an empty plot, the board or the Arena: its model (or forecourt) carries the id, somewhere up the tree.
      // The Arena's pitch is ground: a click there walks you in.
      let o: THREE.Object3D | null = hit.object;
      while (o && !o.userData.houseId && !o.userData.plotKey && !o.userData.board && !o.userData.arena) o = o.parent;
      const { houseId, plotKey, board, arena } = o?.userData ?? {};
      // Only houses are targets: look past a plot, the board or the Arena, to whatever is behind it (the ground, usually).
      if (!all && !houseId && (plotKey || board || arena)) continue;
      if (houseId) return { thing: this.placed.find((p) => p.house.id === houseId) ?? null, ground: null };
      if (plotKey) return { thing: this.plots.find((p) => p.key === plotKey) ?? null, ground: null };
      if (board) return { thing: this.board, ground: null };
      if (arena) return { thing: this.arena, ground: null };
      if (hit.object.name === "ground") {
        const b = this.bounds;
        return { thing: null, ground: new THREE.Vector3(THREE.MathUtils.clamp(hit.point.x, b.minX, b.maxX), 0, THREE.MathUtils.clamp(hit.point.z, b.minZ, b.maxZ)) };
      }
    }
    return { thing: null, ground: null };
  }

  // Click someone to see who they are; a house, a plot or the board to walk up to it and use it; the ground to walk there.
  // With walking switched off, only what's already in reach can be used. Nothing while the camera is away.
  private click = (e: PointerEvent) => {
    if (this.tour) return;
    const { thing, ground } = this.aim(e);
    if (thing?.target.kind === "person") this.events.onSelect(thing.target, "click");
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
    // Moving at all after `arriveAt` means you're not waiting at that door any more.
    if (moving) this.arrival = null;
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

    // Flatmates stroll around their front yard; passers-by walk their routes across town.
    for (const n of this.npcs) {
      if (calm || !n.avatar.visible) {
        n.person?.play("idle");
        continue;
      }
      if (n.passerby) {
        this.walkOn(n, n.passerby, dt);
        continue;
      }
      const to = new THREE.Vector3().subVectors(n.goal, n.avatar.position).setY(0);
      if (to.length() < 0.1) {
        n.wait -= dt;
        if (n.wait <= 0) {
          // A small stroll around their spot, never as far as the next flatmate's.
          n.goal = n.home.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.1, 0, (Math.random() - 0.5) * 1.1));
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

    // Flatmates at the same door keep a little apart (R39): two people closer than SPACING step away from each other.
    if (!calm) for (const p of this.placed) separate(p.npcs, dt);
    // Passers-by don't walk through each other: those who overlap step aside.
    if (!calm) keepApart(this.walkers.filter((w) => w.avatar.visible).map((w) => w.avatar.position), RADIUS * 2);

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
    for (const r of this.remotes.values()) if (r.avatar.parent) r.person?.mixer.update(dt);
    if (this.tick % 6 === 0) {
      const tagRange = this.viewHalf < 9 ? this.viewHalf * 2 : TAG_RANGE;
      for (const n of this.npcs) n.tag.on = n === h || (n.avatar.position.distanceTo(centre) < tagRange && !n.hidden);
      for (const r of this.remotes.values()) r.tag.on = r === h || (r.avatar.position.distanceTo(centre) < tagRange * 1.6 && !r.hidden);
      this.declutterTags(h);
      if (this.tick % 60 === 0) this.tags.sayNames(this.flags, this.tagSpots, this.tagCount);
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
    // A name tag whose owner stands behind a building would float over its roof: a few people a tick are checked.
    if (this.tick % 3 === 0) this.checkTags(offset);
    if (this.tick % 10 === 0) this.stage();
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

    // Houses' windows flicker and cranes turn; fireworks fly; the light follows the city's clock.
    const time = this.clock.elapsedTime;
    for (const p of this.placed) p.face.tick(time, calm);
    this.props?.tick(time, calm);
    this.fireworks.tick(dt);
    this.life.tick(dt);
    if (this.beacon) {
      // It follows the door (a model loading late moves it), and hides while its house isn't built.
      const p = this.placed.find((x) => x.house.id === this.beaconHouse);
      this.beacon.object.visible = !!p;
      if (p) this.beacon.place(p.door.x, p.door.z);
      this.beacon.update(time, calm);
    }
    if (this.tick % 2 === 0) this.pointArrow();

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
    // Who's inside the Arena, a few times a second; its screen's countdown moves on once a minute.
    if (now - this.crowd.at >= CROWD_EVERY) {
      this.crowd.at = now;
      this.countCrowd();
      this.arena?.model.tick(Date.now());
    }
  }

  /** The HUD's boxes over the stage, in the stage's pixels: the minimap, the round tools, the keys, the place, the quest and the coach. */
  private hud(): ScreenBox[] {
    const now = performance.now();
    if (now - this.hudReadAt < 500) return this.hudBoxes;
    this.hudReadAt = now;
    const stage = this.host.getBoundingClientRect();
    const root = this.host.parentElement ?? document.body;
    this.hudBoxes = Array.from(root.querySelectorAll<HTMLElement>(".hud.map, .hud.tools, .hud.dock, .hud.place, .hud.quest, .coach"))
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => ({ left: r.left - stage.left, top: r.top - stage.top, right: r.right - stage.left, bottom: r.bottom - stage.top }));
    return this.hudBoxes;
  }

  /**
   * The arrow at the screen's edge: towards the door of the beacon's house, else of the house you picked, while
   * that door is off screen. Hidden while the camera is away on a tour or a window is open. The element is only
   * touched when what it shows changes.
   */
  private pointArrow() {
    const id = this.beaconHouse ?? this.pointHouse;
    let goal: Placed | null = null;
    if (id) for (const p of this.placed) if (p.house.id === id) goal = p;
    // A picked house is reached once you stand at it.
    if (goal && id === this.pointHouse && !this.beaconHouse && this.distanceTo(goal) < REACH) {
      this.pointHouse = null;
      goal = null;
    }
    let key = "";
    const at = this.arrowAt;
    if (goal && !this.tour && this.framing !== "left") {
      const v = this.scratch.copy(goal.door).project(this.camera);
      placeArrow(v.x, v.y, this.width, this.height, ARROW_MARGIN, at);
      if (at.shown) clearOf(at, this.hud(), this.width, this.height, ARROW_MARGIN);
      if (at.shown) key = `${at.x.toFixed(0)},${at.y.toFixed(0)},${at.angle.toFixed(2)}`;
    }
    if (key === this.arrowKey) return;
    this.arrowKey = key;
    this.arrow.classList.toggle("on", key !== "");
    if (!key) return;
    // The key moves; only the chevron turns, so the key's lip stays underneath.
    this.arrow.style.transform = `translate(${at.x.toFixed(0)}px, ${at.y.toFixed(0)}px)`;
    (this.arrow.firstElementChild as SVGElement | null)?.style.setProperty("transform", `rotate(${at.angle.toFixed(2)}rad)`);
  }

  /**
   * Name tags that overlap on screen (people bunched at a door): the nearest stays as it is and the others fade back
   * without their house chip; on a narrow screen only yours and the nearest person's show at all (tags.ts). Runs with
   * the tags' range check, a few times a second, over a reused pool: nothing new is made per check.
   */
  private declutterTags(h: Thing | null) {
    const you = this.player.position;
    let n = this.tagSpot(0, this.playerTag, you, -1, true);
    for (const p of this.npcs) if (p.avatar.visible && p.tag.on) n = this.tagSpot(n, p.tag, p.avatar.position, apart(p.avatar.position, you), p === h);
    for (const r of this.remotes.values()) if (r.tag.on) n = this.tagSpot(n, r.tag, r.avatar.position, apart(r.avatar.position, you), r === h);
    declutter(this.tagSpots, n, this.width < NARROW_TAGS ? 1 : TAG_MOST);
    for (let i = 0; i < n; i++) this.tagSpots[i].tag!.crowd(this.tagSpots[i].crowded);
    this.tagCount = n;
  }

  /** Fills the pool's spot `i` with a tag on screen (its head's point, projected) and returns the next index. */
  private tagSpot(i: number, tag: Tag, at: THREE.Vector3, d: number, keep: boolean): number {
    const v = this.scratch.copy(at).setY(at.y + 1.9).project(this.camera);
    if (Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) return i;
    let spot = this.tagSpots[i];
    if (!spot) {
      spot = { x: 0, y: 0, w: 0, d: 0, keep: false, shown: true, crowded: false, tag: null };
      this.tagSpots.push(spot);
    }
    spot.x = ((v.x + 1) / 2) * this.width;
    spot.y = ((1 - v.y) / 2) * this.height;
    spot.w = this.tags.widthOf(tag);
    spot.d = d;
    spot.keep = keep;
    spot.crowded = tag.crowded;
    spot.tag = tag;
    return i + 1;
  }

  /**
   * Whether people stand behind a building, seen from the camera: a ray from their head towards the camera that
   * meets a building's box (one that isn't faded) means a wall is in the way, and their tag hides. A few people per
   * call, round and round, so a crowd costs no more than a handful.
   */
  private checkTags(offset: THREE.Vector3) {
    const people: (Npc | Remote)[] = [...this.npcs.filter((n) => n.avatar.visible), ...this.remotes.values()];
    if (!people.length) return;
    const toCamera = offset.clone().normalize();
    const ray = new THREE.Ray();
    for (let k = 0; k < Math.min(TAG_CHECKS, people.length); k++) {
      const who = people[this.tagCursor++ % people.length];
      ray.set(who.avatar.position.clone().setY(1.6), toCamera);
      who.hidden = this.occluders.some((o) => !o.faded && ray.intersectsBox(o.box));
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
   * the thing under the mouse in soft white, the [ ] highlight in the ring's warm white (or just the latter when
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
    const dt = this.clock.getDelta();
    if (this.budget.add(dt * 1000)) this.easeOff();
    this.step(Math.min(dt, 0.05));
    this.draw();
    this.tags.draw(this.camera, this.flags, this.tagSpots, this.tagCount);
    // Going through the whole scene to find the few words left in it is not free: when there are none, only now and then.
    if (this.labels.domElement.childElementCount > 0 || this.tick % 6 === 0) this.labels.render(this.scene, this.camera);
  };
}

/** A building's footprint in the world: `w` wide and `d` deep, turned with its plot. */
function footprint(x: number, z: number, facing: Facing, w: number, d: number): Box {
  const [hw, hd] = facing % 2 === 0 ? [w / 2, d / 2] : [d / 2, w / 2];
  return { minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd };
}

/**
 * Keeps people at a door at least SPACING apart: each pair that's too close steps away from each other, half the
 * gap each, a little every frame, and whoever was strolling towards the other picks the spot they're pushed to.
 */
function separate(people: { avatar: THREE.Object3D; goal: THREE.Vector3 }[], dt: number) {
  for (let i = 0; i < people.length; i++)
    for (let j = i + 1; j < people.length; j++) {
      const a = people[i].avatar;
      const b = people[j].avatar;
      if (!a.visible || !b.visible) continue;
      const dx = b.position.x - a.position.x;
      const dz = b.position.z - a.position.z;
      const d = Math.hypot(dx, dz);
      if (d >= SPACING) continue;
      const push = Math.min(SPACING - d, 3 * dt) / 2;
      const [ux, uz] = d > 0.001 ? [dx / d, dz / d] : [1, 0];
      a.position.x -= ux * push;
      a.position.z -= uz * push;
      b.position.x += ux * push;
      b.position.z += uz * push;
      // Their goals step apart too, or they'd walk straight back into each other.
      people[i].goal.x -= ux * push;
      people[i].goal.z -= uz * push;
      people[j].goal.x += ux * push;
      people[j].goal.z += uz * push;
    }
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

// Something that will never move: three.js stops working out where it is, every frame, along with all its parts.
function freeze(root: THREE.Object3D) {
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    o.matrixAutoUpdate = false;
    o.matrixWorldAutoUpdate = false;
  });
}

// three.js removes a name tag's element only when the tag itself is removed, not when a group holding it is.
function removeLabels(root: THREE.Object3D) {
  root.traverse((o) => {
    if (o instanceof CSS2DObject) o.element.remove();
  });
}
