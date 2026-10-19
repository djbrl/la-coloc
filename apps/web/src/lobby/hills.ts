// Kigali's hills (cityStyle's `hills`): beyond the skyline, the ground rises in a few gentle terraces, like the tea
// and banana terraces on Rwanda's slopes, and a ring of green hills stands on the top one, all round the town. Seen,
// not walked: nothing here is solid. Drawn from plain shapes, painted green in bands (a terraced slope), merged into
// a handful of meshes: the terraces are one, the hills a few clusters, each placed at its middle so the lobby can
// hide the ones on the camera's side, like the skyline's buildings (they'd stand in front of the town).
import * as THREE from "three";
import { box, mesh } from "./windows";

type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };

// The terraces: how far out from the town's edge each one starts, and how high it stands. The first starts past the
// skyline's farthest buildings. They all reach `OUTER` units out, under the fog.
export const TERRACES = [
  { from: 18, height: 0.3, color: 0x6aa64c },
  { from: 21, height: 0.6, color: 0x5f9a45 },
  { from: 24, height: 0.9, color: 0x6fae52 },
];
const OUTER = 110;
// The hills: how far out from the town's edge they stand (on the top terrace, near enough to be seen from the
// town's last street), their width and their height. Three hills next to each other make a cluster.
export const HILLS = { from: 27, spread: 12, width: [10, 18], height: [6, 12], step: [13, 19], perCluster: 3 } as const;
const HILL_GREENS = [0x4f8a3b, 0x5d9a46, 0x6aa84f];

export interface HillSpot {
  x: number;
  z: number;
  width: number;
  height: number;
  turn: number;
  // Which cluster it's drawn in (a few hills side by side, along one side of the town).
  cluster: number;
}

/**
 * Where the hills stand: along each side of the town, a little past its corners, at a step of 13 to 19 units, 27 to
 * 39 units out. The same bounds and dice always give the same hills.
 */
export function hillSpots(b: Bounds, rand: () => number): HillSpot[] {
  const spots: HillSpot[] = [];
  const between = (r: readonly [number, number]) => r[0] + rand() * (r[1] - r[0]);
  const sides = [
    { from: b.minX, to: b.maxX, fixed: b.minZ, out: -1, horizontal: true },
    { from: b.minX, to: b.maxX, fixed: b.maxZ, out: 1, horizontal: true },
    { from: b.minZ, to: b.maxZ, fixed: b.minX, out: -1, horizontal: false },
    { from: b.minZ, to: b.maxZ, fixed: b.maxX, out: 1, horizontal: false },
  ];
  sides.forEach((s, side) => {
    let k = 0;
    for (let t = s.from - 30; t <= s.to + 30; t += between(HILLS.step), k++) {
      const d = s.fixed + s.out * (HILLS.from + rand() * HILLS.spread);
      spots.push({
        x: s.horizontal ? t : d,
        z: s.horizontal ? d : t,
        width: between(HILLS.width),
        height: between(HILLS.height),
        turn: rand() * Math.PI * 2,
        cluster: side * 100 + Math.floor(k / HILLS.perCluster),
      });
    }
  });
  return spots;
}

/**
 * The terraces and the hills, ready to add to the town: `ground` (the terraces, always shown) and `hills` (the
 * clusters, to hide on the camera's side).
 */
export function hills(b: Bounds, rand: () => number): { ground: THREE.Object3D; hills: THREE.Object3D[] } {
  // Each terrace is a frame round the town: four flat boxes from its inner edge out to OUTER, standing on the
  // ground. The higher ones lie on top of the lower ones, so the ground steps up as it goes out.
  const parts: THREE.BufferGeometry[] = [];
  for (const t of TERRACES) {
    const inX = [b.minX - t.from, b.maxX + t.from];
    const inZ = [b.minZ - t.from, b.maxZ + t.from];
    const outX = [b.minX - OUTER, b.maxX + OUTER];
    const outZ = [b.minZ - OUTER, b.maxZ + OUTER];
    const h = t.height + 0.02;
    const y = h / 2 - 0.02;
    // North and south strips span the whole width; west and east strips fill in between them.
    parts.push(
      box(outX[1] - outX[0], h, inZ[0] - outZ[0], (outX[0] + outX[1]) / 2, y, (outZ[0] + inZ[0]) / 2, t.color),
      box(outX[1] - outX[0], h, outZ[1] - inZ[1], (outX[0] + outX[1]) / 2, y, (inZ[1] + outZ[1]) / 2, t.color),
      box(inX[0] - outX[0], h, inZ[1] - inZ[0], (outX[0] + inX[0]) / 2, y, (inZ[0] + inZ[1]) / 2, t.color),
      box(outX[1] - inX[1], h, inZ[1] - inZ[0], (inX[1] + outX[1]) / 2, y, (inZ[0] + inZ[1]) / 2, t.color),
    );
  }
  const ground = mesh(parts);
  ground.castShadow = false;
  ground.name = "ground";
  ground.raycast = () => undefined;

  // The hills, in clusters. Their foot is at ground level, under the terraces, so no gap shows where a hill's edge
  // reaches over a lower step.
  const clusters = new Map<number, HillSpot[]>();
  for (const s of hillSpots(b, rand)) clusters.set(s.cluster, [...(clusters.get(s.cluster) ?? []), s]);
  const meshes: THREE.Object3D[] = [];
  for (const spots of clusters.values()) {
    // The cluster's middle: where its mesh is placed, and what the lobby's skyline check looks at.
    const cx = spots.reduce((sum, s) => sum + s.x, 0) / spots.length;
    const cz = spots.reduce((sum, s) => sum + s.z, 0) / spots.length;
    const m = mesh(spots.map((s) => hill(s).translate(s.x - cx, 0, s.z - cz)));
    m.castShadow = false;
    m.position.set(cx, 0, cz);
    m.raycast = () => undefined;
    meshes.push(m);
  }
  return { ground, hills: meshes };
}

// One hill: a low dome, a little longer one way than the other, painted in green bands up its slope (the terraces),
// lighter at the top.
function hill(s: HillSpot): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed();
  g.scale(s.width / 2, s.height, (s.width / 2) * 0.75);
  g.rotateY(s.turn);
  // Every triangle one colour (flat shading reads cleaner that way), by the height of its middle: bands of a seventh
  // of the hill's height, two greens taking turns, the top band lighter.
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3 / s.height;
    const band = Math.min(6, Math.floor(y * 7));
    c.setHex(band >= 6 ? HILL_GREENS[2] : HILL_GREENS[band % 2]);
    for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (i + k) * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}
