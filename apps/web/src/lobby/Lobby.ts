// The city as a walkable lobby: an isometric neighbourhood at dusk, your character, the flatmates hanging around
// their houses, and everyone else who's online, live. Walk up to a door and press E to go in; walk up to a street
// lamp and press E to light it. Pure three.js; Vue only mounts it and draws what sits on top.
import * as THREE from "three";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { CityHouse } from "../types";
import { PLOT, plots, rowCount, STREET_OFFSET } from "./layout";
import { loadHouse, loadPerson, type Person } from "./assets";
import { colorFor, disposeTree, type HouseModel, makeAvatar, makeHouse, makeRoomBoard, PALETTE } from "./models";

const SPEED = 6; // units per second
const RADIUS = 0.4; // how wide a person is, for bumping into walls
const REACH = 1.6; // how close you stand to use a door or a lamp
// Far back along the isometric angle: an orthographic view looks the same from any distance, and a full-height
// screen reaches ground that a closer camera would clip.
const CAMERA_OFFSET = new THREE.Vector3(42, 48, 42);
const ZOOM = { min: 7, max: 22, start: 12 }; // half the view's width, in world units
const LAMP_LIGHT = 0xffc078;

export type Emote = "yes" | "no";
export type Nearby = { kind: "door"; house: CityHouse } | { kind: "lamp"; on: boolean } | null;

export interface LobbyEvents {
  onNear(thing: Nearby): void;
  onEnter(house: CityHouse): void;
  // Your position, when it changed (at most ten times a second): for the others to see you.
  onMove(state: { x: number; z: number; ry: number; moving: boolean }): void;
  // Which lamps are lit, by id, after you switch one.
  onLamps(lit: string[]): void;
}

export interface LobbyOptions {
  login: string | null;
  character: string | null;
  quality: "high" | "low";
  reduceMotion: boolean;
  litLamps: string[];
}

interface Placed {
  house: CityHouse;
  model: HouseModel;
  // Footprint in world space, for collisions.
  min: THREE.Vector2;
  max: THREE.Vector2;
  door: THREE.Vector3;
  npcs: Npc[];
}

interface Npc {
  login: string;
  avatar: THREE.Group;
  person?: Person;
  home: THREE.Vector3;
  target: THREE.Vector3;
  wait: number;
}

interface Remote {
  avatar: THREE.Group;
  person?: Person;
  target: THREE.Vector3;
  ry: number;
  moving: boolean;
}

interface Lamp {
  id: string;
  position: THREE.Vector3;
  bulb: THREE.Mesh;
  light: THREE.PointLight | null;
  on: boolean;
}

export class Lobby {
  private renderer: THREE.WebGLRenderer;
  private labels = new CSS2DRenderer();
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private clock = new THREE.Clock();
  private player: THREE.Group;
  private playerPerson?: Person;
  private town = new THREE.Group();
  private placed: Placed[] = [];
  private npcs: Npc[] = [];
  private remotes = new Map<string, Remote>();
  private lamps: Lamp[] = [];
  private lit: Set<string>;
  private keys = new Set<string>();
  private walkTo: THREE.Vector3 | null = null;
  private enterOnArrival: Placed | null = null;
  private near: Placed | Lamp | null = null;
  private frame = 0;
  private ray = new THREE.Raycaster();
  private resize: ResizeObserver;
  private zoom = ZOOM.start;
  private viewHalf = ZOOM.start;
  // Set when the camera should jump to you rather than glide (first frame, first arrival in town).
  private snap = true;
  private focus: number | null = null;
  private lastSent = { at: 0, key: "" };
  private sun: THREE.DirectionalLight;
  // What the town was last built from, to skip rebuilds when nothing changed.
  private builtFrom = "";
  // Where you can walk: the town plus a margin.
  private bounds = { minX: -30, maxX: 30, minZ: -20, maxZ: 20 };
  // Bumped on every rebuild, so models that finish loading late don't land in a town that's gone.
  private generation = 0;

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

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 400);
    // Early evening: a lilac sky light, a low warm sun, and enough dark for the lamps to matter.
    this.scene.add(new THREE.HemisphereLight(0xe4dcff, 0x6a6488, 1.9));
    this.sun = new THREE.DirectionalLight(0xffc9a0, 2.1);
    this.sun.position.set(18, 14, 6);
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40 });
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(this.town);

    this.player = makeAvatar(opts.login ? colorFor(opts.login) : 0x2f5fb3);
    this.player.add(this.label(opts.login ? `@${opts.login}` : "you", "lobby-label you", 1.75));
    this.scene.add(this.player);
    this.setCharacter(opts.character);

    this.applyQuality();
    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(host);
    this.fit();
    window.addEventListener("keydown", this.keydown);
    window.addEventListener("keyup", this.keyup);
    this.renderer.domElement.addEventListener("pointerdown", this.click);
    this.renderer.domElement.addEventListener("wheel", this.wheel, { passive: false });
    this.loop();
    // Development only: poke at the lobby from the browser console.
    if (import.meta.env.DEV) (window as unknown as { lobby: Lobby }).lobby = this;
  }

  // ---- What Vue tells the lobby ----

  /** Builds (or rebuilds) the neighbourhood from the city. The player stays where they are. */
  setCity(houses: CityHouse[]) {
    // The city stream re-sends the city often. Only rebuild if what's drawn changed.
    const key = JSON.stringify(houses.map((h) => [h.id, h.name, h.status, h.demo, h.rooms.map((r) => [r.status, r.occupant?.login ?? null])]));
    if (key === this.builtFrom) return;
    this.builtFrom = key;
    const gen = ++this.generation;
    removeLabels(this.town);
    disposeTree(this.town);
    this.town.clear();
    this.placed = [];
    this.npcs = [];
    this.lamps = [];

    const rows = rowCount(houses.length);
    const length = PLOT.perRow * PLOT.width + 10;
    const depth = rows * PLOT.depth;
    this.bounds = { minX: -length / 2 - 4, maxX: length / 2 + 4, minZ: -PLOT.depth / 2 - 2, maxZ: depth };
    // Much bigger than the town, so the camera never sees the edge of the world.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(length + 120, depth + 120), new THREE.MeshStandardMaterial({ color: 0x7fa06a, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = ((rows - 1) * PLOT.depth) / 2;
    ground.receiveShadow = true;
    ground.name = "ground";
    this.town.add(ground);
    for (let r = 0; r < rows; r++) {
      const z = r * PLOT.depth + STREET_OFFSET;
      const street = new THREE.Mesh(new THREE.PlaneGeometry(length, 3.2), new THREE.MeshStandardMaterial({ color: PALETTE.street, roughness: 1 }));
      street.rotation.x = -Math.PI / 2;
      street.position.set(0, 0.01, z);
      street.receiveShadow = true;
      this.town.add(street);
      // Lamps between the houses, on the near kerb: the far one hides behind the next row's roofs. Light them all.
      for (let c = 0; c <= PLOT.perRow; c++) {
        const x = (c - PLOT.perRow / 2) * PLOT.width;
        this.addLamp(`${r}:${c}`, new THREE.Vector3(x, 0, z - 2.1));
      }
    }

    plots(houses.length).forEach((plot, i) => {
      const house = houses[i];
      const model = makeHouse(house);
      model.group.position.set(plot.x, 0, plot.z);
      model.group.userData.houseId = house.id;
      model.group.add(this.label(house.name, house.demo ? "lobby-label house demo" : "lobby-label house", 6.2));
      this.town.add(model.group);
      model.group.updateMatrixWorld(true);
      const door = model.group.localToWorld(model.door.clone());
      const placed: Placed = {
        house,
        model,
        min: new THREE.Vector2(plot.x - model.halfWidth, plot.z - model.halfDepth),
        max: new THREE.Vector2(plot.x + model.halfWidth, plot.z + model.halfDepth),
        door,
        npcs: [],
      };
      this.placed.push(placed);
      if (house.status === "live") this.upgradeHouse(placed, gen);

      // The flatmates hang around in front of their house (unless they're online: then it's really them walking).
      house.rooms
        .filter((r) => r.occupant)
        .forEach((r, k) => {
          const login = r.occupant!.login;
          const avatar = makeAvatar(colorFor(login));
          const home = door.clone().add(new THREE.Vector3((k - 1) * 1.2, 0, 1.2));
          avatar.position.copy(home);
          avatar.add(this.label(r.occupant!.name ?? login, "lobby-label small", 1.6));
          avatar.visible = !this.remotes.has(login) && login !== this.opts.login;
          this.town.add(avatar);
          const npc: Npc = { login, avatar, home, target: home.clone(), wait: Math.random() * 3 };
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
    });

    // First time in town: start on the first street, in front of the first house.
    if (this.player.position.lengthSq() === 0 && this.placed[0]) {
      this.player.position.copy(this.placed[0].door).add(new THREE.Vector3(0, 0, 2.5));
      this.snap = true;
    }
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

  /** Zooms in on your character (for the onboarding), or back out with null. */
  focusOnPlayer(on: boolean) {
    this.focus = on ? 4.5 : null;
  }

  goTo(houseId: string) {
    const p = this.placed.find((x) => x.house.id === houseId);
    if (!p) return;
    this.walkTo = p.door.clone();
    this.enterOnArrival = p;
  }

  /** Uses whatever you're standing next to: goes in a door, or flips a lamp. */
  interact() {
    const n = this.near;
    if (!n) return;
    if ("house" in n) this.events.onEnter(n.house);
    else this.toggleLamp(n);
  }

  emote(name: Emote) {
    this.playerPerson?.play(`emote-${name}`, true);
    this.bubble(this.player, name);
  }

  // ---- Everyone else who's online ----

  addRemote(p: { login: string; name: string | null; avatar: string | null; x: number; z: number; ry: number; moving: boolean }) {
    if (p.login === this.opts.login || this.remotes.has(p.login)) return;
    const avatar = makeAvatar(colorFor(p.login));
    avatar.add(this.label(p.name ?? p.login, "lobby-label online", 1.75));
    // Someone who just arrived and hasn't moved yet stands at the town's entrance.
    const start = p.x || p.z ? new THREE.Vector3(p.x, 0, p.z) : this.placed[0]?.door.clone().add(new THREE.Vector3(1.5, 0, 2.5)) ?? new THREE.Vector3();
    avatar.position.copy(start);
    avatar.rotation.y = p.ry;
    this.scene.add(avatar);
    const remote: Remote = { avatar, target: start.clone(), ry: p.ry, moving: p.moving };
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
    r.target.set(x, 0, z);
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
    for (const n of this.npcs) if (n.login === login) n.avatar.visible = true;
  }

  clearRemotes() {
    for (const login of [...this.remotes.keys()]) this.removeRemote(login);
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.resize.disconnect();
    window.removeEventListener("keydown", this.keydown);
    window.removeEventListener("keyup", this.keyup);
    this.renderer.domElement.removeEventListener("pointerdown", this.click);
    this.renderer.domElement.removeEventListener("wheel", this.wheel);
    removeLabels(this.scene);
    disposeTree(this.scene);
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.domElement.remove();
  }

  // ---- Building blocks ----

  /** Swaps a house's placeholder for its model, adds the room board, and walks the footprint out to fit. */
  private async upgradeHouse(p: Placed, gen: number) {
    let model: THREE.Object3D;
    try {
      model = await loadHouse(p.house.id, 5.2);
    } catch {
      return; // keep the placeholder
    }
    if (gen !== this.generation) return;
    const group = p.model.group;
    group.children.forEach((c) => {
      if (!(c instanceof CSS2DObject)) c.visible = false;
    });
    group.add(model);
    const box = new THREE.Box3().setFromObject(model);
    const board = makeRoomBoard(p.house);
    board.position.set(box.max.x - group.position.x + 0.6, 0, box.max.z - group.position.z + 0.3);
    group.add(board);
    p.min.set(box.min.x, box.min.z);
    p.max.set(box.max.x, box.max.z);
    const moved = new THREE.Vector3((box.min.x + box.max.x) / 2, 0, box.max.z + 1.1).sub(p.door);
    p.door.add(moved);
    // The flatmates follow their door.
    for (const n of p.npcs) {
      n.home.add(moved);
      n.target.add(moved);
      n.avatar.position.add(moved);
    }
  }

  private addLamp(id: string, position: THREE.Vector3) {
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.4, 8), new THREE.MeshStandardMaterial({ color: 0x2c2a33, roughness: 0.6, metalness: 0.4 }));
    post.position.y = 1.2;
    post.castShadow = true;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), new THREE.MeshStandardMaterial({ color: 0x77736c, emissive: LAMP_LIGHT, emissiveIntensity: 0 }));
    bulb.position.y = 2.5;
    g.add(post, bulb);
    g.position.copy(position);
    this.town.add(g);
    const lamp: Lamp = { id, position: position.clone(), bulb, light: null, on: false };
    this.lamps.push(lamp);
    this.setLamp(lamp, this.lit.has(id));
  }

  private setLamp(lamp: Lamp, on: boolean) {
    lamp.on = on;
    const m = lamp.bulb.material as THREE.MeshStandardMaterial;
    m.emissiveIntensity = on ? 2.2 : 0;
    m.color.set(on ? 0xfff1d6 : 0x77736c);
    // Real light only where it's lit and the machine can afford it.
    if (on && this.opts.quality === "high" && !lamp.light) {
      lamp.light = new THREE.PointLight(LAMP_LIGHT, 18, 9, 1.6);
      lamp.light.position.copy(lamp.position).setY(2.3);
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
    this.events.onLamps([...this.lit]);
    this.near = null; // so the prompt refreshes (switch on → switch off)
  }

  /** The number of lamps in town, and how many are lit. */
  lampCount(): { lit: number; total: number } {
    return { lit: this.lamps.filter((l) => l.on).length, total: this.lamps.length };
  }

  /** Puts a loaded person in place of a placeholder avatar (keeping its name tag). */
  private dress(avatar: THREE.Group, person: Person) {
    avatar.children.forEach((c) => {
      if (!(c instanceof CSS2DObject) && c !== person.object) c.visible = false;
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

  private applyQuality() {
    const high = this.opts.quality === "high";
    this.renderer.setPixelRatio(high ? Math.min(window.devicePixelRatio, 2) : 1);
    this.renderer.shadowMap.enabled = high;
    this.sun.castShadow = high;
    for (const l of this.lamps) this.setLamp(l, l.on);
    this.fit();
  }

  private fit() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.project();
  }

  private project(half = this.viewHalf) {
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    // A phone held upright is narrow: show a little less of the town rather than shrinking everyone.
    const aspect = w / h;
    const width = aspect < 1 ? half * 0.85 : half;
    Object.assign(this.camera, { left: -width, right: width, top: width / aspect, bottom: -width / aspect });
    this.camera.updateProjectionMatrix();
  }

  private keydown = (e: KeyboardEvent) => {
    // Typing in a field elsewhere on the page isn't walking.
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
      this.keys.add(k);
      this.walkTo = null;
      this.enterOnArrival = null;
      e.preventDefault();
    }
    if (k === "e" || k === "enter") this.interact();
    if (k === "1") this.emote("yes");
    if (k === "2") this.emote("no");
  };

  private keyup = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());

  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoom = THREE.MathUtils.clamp(this.zoom + Math.sign(e.deltaY) * 1.2, ZOOM.min, ZOOM.max);
  };

  // Click the ground to walk there; click a house to walk to its door and go in.
  private click = (e: PointerEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(pointer, this.camera);
    for (const hit of this.ray.intersectObjects(this.town.children, true)) {
      let o: THREE.Object3D | null = hit.object;
      while (o && !o.userData.houseId) o = o.parent;
      if (o) {
        this.goTo(o.userData.houseId);
        return;
      }
      if (hit.object.name === "ground") {
        const b = this.bounds;
        this.walkTo = new THREE.Vector3(THREE.MathUtils.clamp(hit.point.x, b.minX, b.maxX), 0, THREE.MathUtils.clamp(hit.point.z, b.minZ, b.maxZ));
        this.enterOnArrival = null;
        return;
      }
    }
  };

  private blocked(x: number, z: number): boolean {
    return this.placed.some((p) => x > p.min.x - RADIUS && x < p.max.x + RADIUS && z > p.min.y - RADIUS && z < p.max.y + RADIUS);
  }

  private step(dt: number) {
    const calm = this.opts.reduceMotion;
    // Screen directions in an isometric view: "up" is away from the camera, along the diagonal.
    const dir = new THREE.Vector3();
    if (this.keys.has("w") || this.keys.has("arrowup")) dir.add(new THREE.Vector3(-1, 0, -1));
    if (this.keys.has("s") || this.keys.has("arrowdown")) dir.add(new THREE.Vector3(1, 0, 1));
    if (this.keys.has("a") || this.keys.has("arrowleft")) dir.add(new THREE.Vector3(-1, 0, 1));
    if (this.keys.has("d") || this.keys.has("arrowright")) dir.add(new THREE.Vector3(1, 0, -1));
    if (!dir.lengthSq() && this.walkTo) {
      dir.subVectors(this.walkTo, this.player.position).setY(0);
      if (dir.length() < 0.15) {
        this.walkTo = null;
        dir.set(0, 0, 0);
        if (this.enterOnArrival) {
          const p = this.enterOnArrival;
          this.enterOnArrival = null;
          this.events.onEnter(p.house);
        }
      }
    }
    const moving = dir.lengthSq() > 0;
    if (moving) {
      dir.normalize().multiplyScalar(SPEED * dt);
      const pos = this.player.position;
      // Slide along walls: try each axis on its own.
      if (!this.blocked(pos.x + dir.x, pos.z)) pos.x += dir.x;
      if (!this.blocked(pos.x, pos.z + dir.z)) pos.z += dir.z;
      // Stay in town.
      pos.x = THREE.MathUtils.clamp(pos.x, this.bounds.minX, this.bounds.maxX);
      pos.z = THREE.MathUtils.clamp(pos.z, this.bounds.minZ, this.bounds.maxZ);
      this.player.rotation.y = Math.atan2(dir.x, dir.z);
      if (this.playerPerson) this.playerPerson.play("walk");
      else if (!calm) this.player.position.y = Math.abs(Math.sin(this.clock.elapsedTime * 12)) * 0.08;
    } else {
      this.player.position.y = 0;
      this.playerPerson?.play("idle");
    }
    if (this.playerPerson) this.player.position.y = 0;
    this.playerPerson?.mixer.update(dt);
    this.report(moving);

    // What are we standing next to? Lamps win over doors when both are in reach: they're smaller.
    const here = this.player.position.clone().setY(0);
    const lamp = this.lamps.find((l) => l.position.distanceTo(here) < REACH * 0.9) ?? null;
    const door = lamp ? null : (this.placed.find((p) => p.door.distanceTo(here) < REACH) ?? null);
    const near = lamp ?? door;
    if (near !== this.near) {
      this.near = near;
      this.events.onNear(lamp ? { kind: "lamp", on: lamp.on } : door ? { kind: "door", house: door.house } : null);
    }

    // Flatmates stroll around their front yard.
    for (const n of this.npcs) {
      if (calm || !n.avatar.visible) {
        n.person?.play("idle");
        continue;
      }
      const to = new THREE.Vector3().subVectors(n.target, n.avatar.position).setY(0);
      if (to.length() < 0.1) {
        n.wait -= dt;
        if (n.wait <= 0) {
          n.target = n.home.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 1.5));
          n.wait = 2 + Math.random() * 4;
        }
        n.avatar.position.y = 0;
        n.person?.play("idle");
      } else {
        const move = to.normalize().multiplyScalar(1.2 * dt);
        n.avatar.position.add(move);
        n.avatar.rotation.y = Math.atan2(move.x, move.z);
        if (n.person) n.person.play("walk");
        else n.avatar.position.y = Math.abs(Math.sin(this.clock.elapsedTime * 9 + n.home.x)) * 0.05;
      }
    }
    for (const n of this.npcs) n.person?.mixer.update(dt);

    // Everyone else glides to where they last said they were.
    for (const r of this.remotes.values()) {
      const k = 1 - Math.exp(-10 * dt);
      r.avatar.position.lerp(r.target, k);
      r.avatar.rotation.y += shortestAngle(r.avatar.rotation.y, r.ry) * k;
      const still = r.avatar.position.distanceTo(r.target) < 0.05;
      r.person?.play(r.moving && !still ? "walk" : "idle");
      r.person?.mixer.update(dt);
    }

    // The camera follows from a fixed isometric angle, gliding (or snapping, for calm motion).
    const goal = this.player.position.clone().setY(0).add(CAMERA_OFFSET);
    if (calm || this.snap) this.camera.position.copy(goal);
    else this.camera.position.lerp(goal, 1 - Math.exp(-6 * dt));
    this.snap = false;
    const look = this.camera.position.clone().sub(CAMERA_OFFSET);
    this.camera.lookAt(look.x, 0, look.z);
    // Zoom eases towards the wheel's choice (or the onboarding's close-up).
    const want = this.focus ?? this.zoom;
    if (Math.abs(this.viewHalf - want) > 0.01) {
      this.viewHalf = calm ? want : this.viewHalf + (want - this.viewHalf) * (1 - Math.exp(-8 * dt));
      this.project(this.viewHalf);
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
    this.frame = requestAnimationFrame(this.loop);
    this.step(Math.min(this.clock.getDelta(), 0.05));
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  };
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
