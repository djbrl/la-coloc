// The city's life, as the street shows it: speech bubbles over people (`say`), each house's happenings played at the
// house (`happening`: an envelope and a coin for a review, a red window and a dark puff for a crash, fireworks for a
// project going live), and smoke from busy roofs. The lobby owns one `CityLife`, tells it what
// it needs through a small `LifeHost` (where a house is, who stands where), and ticks it every frame. Everything
// here is cheap: one pool of particles for all the smoke, a few small meshes per flight.
// With calm motion nothing flies: soft glows instead (glow.ts).
import * as THREE from "three";
import type { CityHappening } from "../types";
import { SpeechBubbles } from "./bubbles";
import { Courier } from "./courier";
import { Glows, softDot } from "./glow";
import { planFor } from "./happenings";
import { RoofSmoke } from "./smoke";
import { play } from "./sound";
import type { HouseFace } from "./windows";

// How far from a house's door someone may stand and still count as "at the house" for its happenings.
const AT_HOUSE = 7;
// How often the roofs are looked at again for the smoke (a model loading in moves its roof), in seconds.
const ROOFS_EVERY = 1.5;
const GOLD = 0xf5c542;

/** A house as its happenings need it: its door, the top of its roof, its windows, its rooms in window order. */
export interface LifeHouse {
  door: THREE.Vector3;
  roof: THREE.Vector3;
  face: HouseFace;
  rooms: string[];
}

/** What the lobby tells the city's life. */
export interface LifeHost {
  calm(): boolean;
  // A house in this neighbourhood, or null.
  house(id: string): LifeHouse | null;
  // Someone's figure on screen in this neighbourhood (someone online, a flatmate out front, you), or null.
  figure(login: string): THREE.Object3D | null;
  // Fireworks over a house (the lobby's `celebrate`).
  celebrate(id: string): void;
  // Every house's roof top and its rooms' CPU use (0 for a house in a power cut), for the smoke.
  roofs(): { id: string; at: THREE.Vector3; cpu: number }[];
}

/**
 * The top of a house's roof, in the world: the middle of the visible model's bounding box, at its highest point
 * minus a little (the ridge), a step off centre like a chimney. `skip`: parts that aren't the building (the windows
 * and the crane in front, which would lift it).
 */
export function roofOf(group: THREE.Object3D, skip: THREE.Object3D[]): THREE.Vector3 {
  const box = new THREE.Box3();
  group.updateWorldMatrix(true, false);
  for (const child of group.children) if (child.visible && !skip.includes(child)) box.expandByObject(child);
  if (box.isEmpty()) return group.getWorldPosition(new THREE.Vector3()).setY(3);
  const centre = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  return new THREE.Vector3(centre.x + size.x * 0.25, box.max.y - 0.25, centre.z - size.z * 0.15);
}

export class CityLife {
  readonly object = new THREE.Group();
  private bubbles = new SpeechBubbles();
  private courier = new Courier();
  private glows = new Glows();
  private smoke = new RoofSmoke(softDot());
  private sinceRoofs = Infinity;

  constructor(private host: LifeHost) {
    this.object.add(this.courier.object, this.glows.object, this.smoke.object);
  }

  /** A speech bubble over someone, if they're on screen here (see bubbles.ts). */
  say(login: string, text: string) {
    const figure = this.host.figure(login);
    if (!figure) return;
    this.bubbles.say(login, (figure.userData.name as string | undefined) ?? login, figure, text);
  }

  /** Plays one of a house's happenings at the house, if it's in this neighbourhood (see happenings.ts). */
  happening(houseId: string, h: CityHappening) {
    const house = this.host.house(houseId);
    if (!house) return;
    const here = (login: string) => {
      const f = this.host.figure(login);
      return !!f && Math.hypot(f.position.x - house.door.x, f.position.z - house.door.z) < AT_HOUSE;
    };
    const plan = planFor(h, here, house.rooms);
    if (!plan) return;
    const calm = this.host.calm();
    switch (plan.kind) {
      case "envelope": {
        const from = this.host.figure(plan.from)!;
        const to = this.host.figure(plan.to)!;
        if (calm) {
          this.glows.glow(above(to, 1.2), 0xfff1c9, 1.6);
          this.glows.glow(above(from, 2.2), GOLD, 1.2);
          play("coin");
          return;
        }
        this.courier.send(from, to, () => {
          this.courier.coin(from);
          play("coin");
        });
        return;
      }
      case "envelope-to-roof": {
        if (calm) {
          this.glows.glow(house.roof.clone().setY(house.roof.y + 0.5), 0xfff1c9, 2);
          return;
        }
        this.courier.send(house.door.clone().setY(0.9), house.roof.clone().setY(house.roof.y + 0.3));
        return;
      }
      case "crash": {
        if (plan.window >= 0) house.face.flash(plan.window, calm);
        if (calm) this.glows.glow(house.roof.clone().setY(house.roof.y + 0.8), 0x8a8c94, 2.2, 0.5);
        else this.smoke.burst(house.roof);
        play("crash");
        return;
      }
      case "celebrate":
        this.host.celebrate(houseId);
        return;
    }
  }

  /** The city changed (`updateHouses`): the roofs' smoke is looked at again on the next frame. */
  touch() {
    this.sinceRoofs = Infinity;
  }

  /** A new neighbourhood: every bubble, letter and puff of the old one goes. */
  clear() {
    this.bubbles.clear();
    this.courier.dispose();
    this.smoke.set([]);
    this.sinceRoofs = Infinity;
  }

  tick(dt: number) {
    this.smoke.setCalm(this.host.calm());
    this.sinceRoofs += dt;
    if (this.sinceRoofs >= ROOFS_EVERY) {
      this.sinceRoofs = 0;
      this.smoke.set(this.host.roofs());
    }
    this.smoke.tick(dt);
    this.courier.tick(dt);
    this.glows.tick(dt);
  }

  dispose() {
    this.clear();
    this.smoke.dispose();
    this.glows.dispose();
  }
}

// A point `y` units over someone's feet.
function above(figure: THREE.Object3D, y: number): THREE.Vector3 {
  const p = figure.getWorldPosition(new THREE.Vector3());
  p.y += y;
  return p;
}
