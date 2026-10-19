// The review's envelope and coin (life.ts plays them): an envelope flies in an arc from one point to another (a
// reviewer to the author, or a house's door up to its roof), turning as it goes; a gold coin pops up over someone's
// head, spins and fades. Both are small merged meshes made per flight (happenings are rare) and thrown away after.
// Points can be people: their figure is followed while it flies, so a flatmate strolling still gets their letter.
import * as THREE from "three";
import { box, mesh, paint } from "./windows";

/** Somewhere to fly from or to: a fixed point, or someone's figure (aimed at their chest). */
export type Spot = THREE.Vector3 | THREE.Object3D;

// How high over a figure's feet an envelope leaves and lands (their hands), and where the coin shows (over the tag).
const CHEST = 1.0;
const COIN = { from: 2.3, rise: 0.6, time: 1.3 };

/**
 * A point along the envelope's arc, `t` from 0 (start) to 1 (end): a straight line on the ground, lifted by a
 * parabola that peaks `lift` units over the line halfway. Written into `out`.
 */
export function arcPoint(from: THREE.Vector3, to: THREE.Vector3, t: number, lift: number, out: THREE.Vector3): THREE.Vector3 {
  out.lerpVectors(from, to, t);
  out.y += 4 * lift * t * (1 - t);
  return out;
}

/** How long a flight takes over a distance, in seconds: a short hop is quick, a long one no more than 1.8 s. */
export function flightTime(distance: number): number {
  return Math.min(1.8, 0.7 + distance * 0.12);
}

interface Flight {
  from: Spot;
  to: Spot;
  object: THREE.Mesh;
  age: number;
  time: number;
  lift: number;
  done?: () => void;
}

interface Coin {
  over: THREE.Object3D;
  object: THREE.Mesh;
  age: number;
}

export class Courier {
  readonly object = new THREE.Group();
  private flights: Flight[] = [];
  private coins: Coin[] = [];
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();

  /** An envelope from one spot to another; `done` is called when it lands. */
  send(from: Spot, to: Spot, done?: () => void) {
    const start = this.where(from, this.a);
    const end = this.where(to, this.b);
    const distance = start.distanceTo(end);
    const object = envelope();
    object.position.copy(start);
    this.object.add(object);
    // High enough to clear the name tags over their heads, higher for a longer throw.
    this.flights.push({ from, to, object, age: 0, time: flightTime(distance), lift: 1.5 + distance * 0.2, done });
  }

  /** A gold coin popping up over someone's head. */
  coin(over: THREE.Object3D) {
    const object = coin();
    this.object.add(object);
    this.coins.push({ over, object, age: 0 });
    this.placeCoin({ over, object, age: 0 });
  }

  tick(dt: number) {
    for (const f of [...this.flights]) {
      f.age += dt;
      const t = Math.min(1, f.age / f.time);
      arcPoint(this.where(f.from, this.a), this.where(f.to, this.b), t, f.lift, f.object.position);
      // It turns as it flies, and leans into the climb, then the fall.
      f.object.rotation.y = t * Math.PI * 2;
      f.object.rotation.x = (0.5 - t) * 0.8;
      // A little smaller as it lands.
      f.object.scale.setScalar(t > 0.85 ? 1 - (t - 0.85) * 4 : 1);
      if (t < 1) continue;
      this.drop(f.object);
      this.flights.splice(this.flights.indexOf(f), 1);
      f.done?.();
    }
    for (const c of [...this.coins]) {
      c.age += dt;
      this.placeCoin(c);
      if (c.age < COIN.time) continue;
      this.drop(c.object);
      this.coins.splice(this.coins.indexOf(c), 1);
    }
  }

  dispose() {
    for (const f of this.flights) this.drop(f.object);
    for (const c of this.coins) this.drop(c.object);
    this.flights = [];
    this.coins = [];
  }

  // The coin's place at its age: it pops in, rises and spins over the head, and fades over its last third.
  private placeCoin(c: Coin) {
    const t = Math.min(1, c.age / COIN.time);
    c.over.getWorldPosition(c.object.position);
    c.object.position.y += COIN.from + COIN.rise * (1 - (1 - t) * (1 - t));
    c.object.rotation.y = c.age * 9;
    c.object.scale.setScalar(Math.min(1, c.age / 0.12));
    const m = c.object.material as THREE.MeshStandardMaterial;
    m.opacity = t < 0.66 ? 1 : 1 - (t - 0.66) / 0.34;
  }

  // Where a spot is right now: a point as it is, a figure at its chest.
  private where(s: Spot, out: THREE.Vector3): THREE.Vector3 {
    if (s instanceof THREE.Vector3) return out.copy(s);
    s.getWorldPosition(out);
    out.y += CHEST;
    return out;
  }

  private drop(object: THREE.Mesh) {
    this.object.remove(object);
    object.geometry.dispose();
    (object.material as THREE.Material).dispose();
  }
}

// A letter: a cream body with a darker flap line and a red seal, about 0.6 units wide, facing +z.
function envelope(): THREE.Mesh {
  const m = mesh([box(0.6, 0.4, 0.05, 0, 0, 0, 0xfaf4e4), box(0.6, 0.04, 0.056, 0, 0.09, 0.002, 0xd8cdb4), box(0.12, 0.12, 0.07, 0, 0.03, 0.006, 0xd2402f)]);
  m.castShadow = false;
  m.raycast = () => undefined;
  return m;
}

// A gold coin, standing up, about 0.4 units across, with a darker rim.
function coin(): THREE.Mesh {
  const face = new THREE.CylinderGeometry(0.19, 0.19, 0.05, 18).toNonIndexed().rotateX(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(0.21, 0.21, 0.035, 18).toNonIndexed().rotateX(Math.PI / 2);
  const m = mesh([paint(face, 0xf5c542), paint(rim, 0xc99a2e)]);
  const material = m.material as THREE.MeshStandardMaterial;
  material.transparent = true;
  material.metalness = 0.3;
  m.castShadow = false;
  m.raycast = () => undefined;
  return m;
}
