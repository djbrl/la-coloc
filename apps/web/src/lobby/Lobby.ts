// The city as a walkable lobby: an isometric neighbourhood, your avatar, the flatmates hanging around their
// houses. Walk up to a door and press E (or click the prompt) to go in. Pure three.js; Vue only mounts it.
import * as THREE from "three";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { CityHouse } from "../types";
import { PLOT, plots, rowCount, STREET_OFFSET } from "./layout";
import { loadHouse, loadPerson, type Person } from "./assets";
import { colorFor, disposeTree, type HouseModel, makeAvatar, makeHouse, makeRoomBoard, PALETTE } from "./models";

const SPEED = 6; // units per second
const RADIUS = 0.4; // how wide a person is, for bumping into walls
const DOOR_RANGE = 1.6;
const CAMERA_OFFSET = new THREE.Vector3(14, 16, 14);

interface Placed {
  house: CityHouse;
  model: HouseModel;
  // Footprint in world space, for collisions.
  min: THREE.Vector2;
  max: THREE.Vector2;
  door: THREE.Vector3;
  // The flatmates hanging around in front.
  npcs: Npc[];
}

interface Npc {
  avatar: THREE.Group;
  person?: Person;
  home: THREE.Vector3;
  target: THREE.Vector3;
  wait: number;
}

export interface LobbyEvents {
  // The house whose door you're standing at, or null.
  onNear(house: CityHouse | null): void;
  onEnter(house: CityHouse): void;
}

export class Lobby {
  private renderer: THREE.WebGLRenderer;
  private labels = new CSS2DRenderer();
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private clock = new THREE.Clock();
  private player: THREE.Group;
  private town = new THREE.Group();
  private placed: Placed[] = [];
  private npcs: Npc[] = [];
  private keys = new Set<string>();
  private walkTo: THREE.Vector3 | null = null;
  private enterOnArrival: Placed | null = null;
  private near: Placed | null = null;
  private frame = 0;
  private ray = new THREE.Raycaster();
  private resize: ResizeObserver;
  private reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  private playerPerson?: Person;
  // What the town was last built from, to skip rebuilds when nothing changed.
  private builtFrom = "";
  // Where you can walk: the town plus a margin.
  private bounds = { minX: -30, maxX: 30, minZ: -20, maxZ: 20 };
  // Bumped on every rebuild, so models that finish loading late don't land in a town that's gone.
  private generation = 0;

  constructor(
    private host: HTMLElement,
    private events: LobbyEvents,
    playerLogin: string | null,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(this.renderer.domElement);
    this.labels.domElement.className = "lobby-labels";
    host.appendChild(this.labels.domElement);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    this.scene.add(new THREE.HemisphereLight(0xfff4e0, 0x5a6b4a, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(12, 24, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40 });
    this.scene.add(sun, sun.target);
    this.scene.add(this.town);

    this.player = makeAvatar(playerLogin ? colorFor(playerLogin) : 0x2f5fb3);
    this.player.add(this.label(playerLogin ? `@${playerLogin}` : "you", "lobby-label you", 1.75));
    this.scene.add(this.player);
    loadPerson(playerLogin ?? "visitor")
      .then((p) => {
        this.playerPerson = p;
        this.dress(this.player, p);
      })
      .catch(() => undefined);

    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(host);
    this.fit();
    window.addEventListener("keydown", this.keydown);
    window.addEventListener("keyup", this.keyup);
    this.renderer.domElement.addEventListener("pointerdown", this.click);
    this.loop();
  }

  /** Builds (or rebuilds) the neighbourhood from the city. The player stays where they are. */
  setCity(houses: CityHouse[]) {
    // The city stream re-sends the city often (a CPU reading, someone online). Only rebuild if what's drawn changed.
    const key = JSON.stringify(houses.map((h) => [h.id, h.name, h.status, h.demo, h.rooms.map((r) => [r.status, r.occupant?.login ?? null])]));
    if (key === this.builtFrom) return;
    this.builtFrom = key;
    const gen = ++this.generation;
    removeLabels(this.town);
    disposeTree(this.town);
    this.town.clear();
    this.placed = [];
    this.npcs = [];

    const rows = rowCount(houses.length);
    const length = PLOT.perRow * PLOT.width + 10;
    const depth = rows * PLOT.depth;
    this.bounds = { minX: -length / 2 - 4, maxX: length / 2 + 4, minZ: -PLOT.depth / 2 - 2, maxZ: depth };
    // Much bigger than the town, so the camera never sees the edge of the world.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(length + 120, depth + 120),
      new THREE.MeshStandardMaterial({ color: PALETTE.ground, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = ((rows - 1) * PLOT.depth) / 2;
    ground.receiveShadow = true;
    ground.name = "ground";
    this.town.add(ground);
    for (let r = 0; r < rows; r++) {
      const street = new THREE.Mesh(new THREE.PlaneGeometry(length, 3.2), new THREE.MeshStandardMaterial({ color: PALETTE.street, roughness: 1 }));
      street.rotation.x = -Math.PI / 2;
      street.position.set(0, 0.01, r * PLOT.depth + STREET_OFFSET);
      street.receiveShadow = true;
      this.town.add(street);
    }

    plots(houses.length).forEach((plot, i) => {
      const house = houses[i];
      const model = makeHouse(house);
      model.group.position.set(plot.x, 0, plot.z);
      model.group.userData.houseId = house.id;
      model.group.add(this.label(`${house.name}${house.demo ? " · demo" : ""}`, "lobby-label", 6.2));
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

      // The flatmates hang around in front of their house.
      house.rooms
        .filter((r) => r.occupant)
        .forEach((r, k) => {
          const avatar = makeAvatar(colorFor(r.occupant!.login));
          const home = door.clone().add(new THREE.Vector3((k - 1) * 1.2, 0, 1.2));
          avatar.position.copy(home);
          avatar.add(this.label(r.occupant!.name ?? r.occupant!.login, "lobby-label small", 1.6));
          this.town.add(avatar);
          const npc: Npc = { avatar, home, target: home.clone(), wait: Math.random() * 3 };
          this.npcs.push(npc);
          placed.npcs.push(npc);
          loadPerson(r.occupant!.login)
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
    }
  }

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

  /** Puts a loaded person in place of a placeholder avatar (keeping its name tag). */
  private dress(avatar: THREE.Group, person: Person) {
    avatar.children.forEach((c) => {
      if (!(c instanceof CSS2DObject)) c.visible = false;
    });
    avatar.add(person.object);
  }

  /** Walks to a house's door, and goes in on arrival. */
  goTo(houseId: string) {
    const p = this.placed.find((x) => x.house.id === houseId);
    if (!p) return;
    this.walkTo = p.door.clone();
    this.enterOnArrival = p;
  }

  enterNear() {
    if (this.near) this.events.onEnter(this.near.house);
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.resize.disconnect();
    window.removeEventListener("keydown", this.keydown);
    window.removeEventListener("keyup", this.keyup);
    this.renderer.domElement.removeEventListener("pointerdown", this.click);
    removeLabels(this.scene);
    disposeTree(this.scene);
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.domElement.remove();
  }

  private label(text: string, className: string, y: number): CSS2DObject {
    const el = document.createElement("div");
    el.className = className;
    el.textContent = text;
    const obj = new CSS2DObject(el);
    obj.position.set(0, y, 0);
    return obj;
  }

  private fit() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    // About 26 world units across, whatever the screen.
    const half = 13;
    const aspect = w / h;
    Object.assign(this.camera, { left: -half, right: half, top: half / aspect, bottom: -half / aspect });
    this.camera.updateProjectionMatrix();
  }

  private keydown = (e: KeyboardEvent) => {
    // Typing in a field elsewhere on the page isn't walking.
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    const k = e.key.toLowerCase();
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
      this.keys.add(k);
      this.walkTo = null;
      this.enterOnArrival = null;
      e.preventDefault();
    }
    if ((k === "e" || k === "enter") && this.near) this.events.onEnter(this.near.house);
  };

  private keyup = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());

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
    if (dir.lengthSq()) {
      dir.normalize().multiplyScalar(SPEED * dt);
      const pos = this.player.position;
      // Slide along walls: try each axis on its own.
      if (!this.blocked(pos.x + dir.x, pos.z)) pos.x += dir.x;
      if (!this.blocked(pos.x, pos.z + dir.z)) pos.z += dir.z;
      // Stay in town.
      pos.x = THREE.MathUtils.clamp(pos.x, this.bounds.minX, this.bounds.maxX);
      pos.z = THREE.MathUtils.clamp(pos.z, this.bounds.minZ, this.bounds.maxZ);
      this.player.rotation.y = Math.atan2(dir.x, dir.z);
      // The model walks; the placeholder bobs.
      if (this.playerPerson) this.playerPerson.play("walk");
      else if (!this.reducedMotion) this.player.position.y = Math.abs(Math.sin(this.clock.elapsedTime * 12)) * 0.08;
    } else {
      this.player.position.y = 0;
      this.playerPerson?.play("idle");
    }
    if (this.playerPerson) this.player.position.y = 0;
    this.playerPerson?.mixer.update(dt);

    // Which door are we standing at?
    const near = this.placed.find((p) => p.door.distanceTo(this.player.position.clone().setY(0)) < DOOR_RANGE) ?? null;
    if (near !== this.near) {
      this.near = near;
      this.events.onNear(near?.house ?? null);
    }

    // Flatmates stroll around their front yard.
    if (!this.reducedMotion) {
      for (const n of this.npcs) {
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
    }
    for (const n of this.npcs) n.person?.mixer.update(dt);

    // The camera follows, from a fixed isometric angle.
    this.camera.position.copy(this.player.position).setY(0).add(CAMERA_OFFSET);
    this.camera.lookAt(this.player.position.x, 0, this.player.position.z);
  }

  private loop = () => {
    this.frame = requestAnimationFrame(this.loop);
    this.step(Math.min(this.clock.getDelta(), 0.05));
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  };
}

// three.js removes a name tag's element only when the tag itself is removed, not when a group holding it is.
function removeLabels(root: THREE.Object3D) {
  root.traverse((o) => {
    if (o instanceof CSS2DObject) o.element.remove();
  });
}
