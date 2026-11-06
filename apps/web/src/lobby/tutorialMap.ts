// The tutorial's neighbourhood, made by hand rather than generated: one street to learn on. You start on a small
// paved square at the west end; the street runs east between tree lots and a park, with a lamp every ten units;
// the workshop (La Coloc) stands at the far east end, its front on the street, a few seconds' walk away. Nothing
// here is for rent. It has the same shape `generateNeighbourhood` returns, so the lobby draws it unchanged.
import { type Block, type Facing, type Neighbourhood, type Plot, PLOT, ROAD, SKYLINE_VARIANTS } from "./neighbourhood";

export const WORKSHOP_ID = "atelier";

// The town is 60 units from west to east and 31 from north to south, centred on (0, 0) like a generated one.
// West to east: a street, the square, a street, the middle block, a street, the workshop's block, a street.
const WIDTH = 60;
const DEPTH = 31;
const SQUARE = PLOT; // the square is one plot wide, on both sides of the street
const BLOCK = 2 * PLOT; // the other blocks are two plots wide
// The blocks' west edges, along x.
const SQUARE_AT = -WIDTH / 2 + ROAD; // -25
const MIDDLE_AT = SQUARE_AT + SQUARE + ROAD; // -12
const EAST_AT = MIDDLE_AT + BLOCK + ROAD; // 9
// Every block is one plot deep, on either side of the main street (which runs along z = 0).
const NORTH_Z = -ROAD / 2 - PLOT / 2; // -6.5: the centre of the blocks north of the street
const SOUTH_Z = ROAD / 2 + PLOT / 2; // 6.5: and south of it

/** The tutorial's map. Always the same. */
export function tutorialNeighbourhood(): Neighbourhood {
  const block = (x: number, z: number, width: number, kind: Block["kind"]): Block => ({ x: x + width / 2, z, width, depth: PLOT, kind });
  const blocks: Block[] = [
    // The square you start on: paved, on both sides of the street.
    block(SQUARE_AT, NORTH_Z, SQUARE, "market"),
    block(SQUARE_AT, SOUTH_Z, SQUARE, "market"),
    // The middle: two tree lots to the north, a park to the south.
    block(MIDDLE_AT, NORTH_Z, BLOCK, "homes"),
    block(MIDDLE_AT, SOUTH_Z, BLOCK, "park"),
    // The east end: a tree lot and the workshop to the north, two tree lots to the south.
    block(EAST_AT, NORTH_Z, BLOCK, "homes"),
    block(EAST_AT, SOUTH_Z, BLOCK, "homes"),
  ];

  // Plot keys follow the generator's "block column.block row.plot column.plot row": the square is column 0, the
  // middle 1, the east end 2; row 0 is north of the street, row 1 south. North plots face the street (+z), south
  // ones face it too (-z).
  const plot = (i: number, j: number, c: number, lot: Plot["lot"]): Plot => {
    const x = [SQUARE_AT, MIDDLE_AT, EAST_AT][i] + c * PLOT + PLOT / 2;
    return { key: `${i}.${j}.${c}.0`, x, z: j === 0 ? NORTH_Z : SOUTH_Z, facing: (j === 0 ? 0 : 2) as Facing, lot };
  };
  const plots: Plot[] = [
    plot(1, 0, 0, { kind: "trees", count: 3 }),
    plot(1, 0, 1, { kind: "trees", count: 2 }),
    plot(2, 0, 0, { kind: "trees", count: 4 }),
    plot(2, 0, 1, { kind: "house", houseId: WORKSHOP_ID }),
    plot(2, 1, 0, { kind: "trees", count: 2 }),
    plot(2, 1, 1, { kind: "trees", count: 3 }),
  ];

  // Streets: the main one along z = 0, one along the back of each row of blocks, and one across between (and
  // around) the blocks, like a generated town.
  const lineX = [-WIDTH / 2 + ROAD / 2, MIDDLE_AT - ROAD / 2, EAST_AT - ROAD / 2, WIDTH / 2 - ROAD / 2];
  const lineZ = [-DEPTH / 2 + ROAD / 2, 0, DEPTH / 2 - ROAD / 2];
  const streets: Neighbourhood["streets"] = [
    ...lineX.map((x) => ({ x, z: 0, width: ROAD, depth: DEPTH })),
    ...lineZ.map((z) => ({ x: 0, z, width: WIDTH, depth: ROAD })),
  ];
  const intersections = lineX.flatMap((x) => lineZ.map((z) => ({ x, z })));

  // A lamp every ten units along the main street, on alternate sidewalks, and two traffic lights at its crossings.
  const lamps = [-23, -13, -3, 7, 17, 27].map((x, k) => ({ id: `Atelier:${k}`, x, z: k % 2 === 0 ? ROAD / 2 - 0.5 : -ROAD / 2 + 0.5 }));
  const trafficLights: Neighbourhood["trafficLights"] = [
    { x: MIDDLE_AT - 0.5, z: ROAD / 2 - 0.5, facing: 3 },
    { x: EAST_AT - ROAD + 0.5, z: -ROAD / 2 + 0.5, facing: 1 },
  ];

  // The skyline: low buildings all around, beyond the outer streets, at a steady step. Distance, size and model
  // follow a fixed pattern (no dice), so it reads as a city without looking like a row of copies.
  const skyline: Neighbourhood["skyline"] = [];
  let n = 0;
  const ring = (along: number, fixed: number, horizontal: boolean, facing: Facing) => {
    for (let t = -along / 2 - 4; t <= along / 2 + 4; t += 7) {
      const d = fixed + Math.sign(fixed) * (5 + (n % 3) * 3);
      skyline.push({ x: horizontal ? t : d, z: horizontal ? d : t, variant: (n * 5) % SKYLINE_VARIANTS, facing, scale: 4 + (n % 4) });
      n++;
    }
  };
  ring(WIDTH, -DEPTH / 2, true, 0);
  ring(WIDTH, DEPTH / 2, true, 2);
  ring(DEPTH, -WIDTH / 2, false, 1);
  ring(DEPTH, WIDTH / 2, false, 3);

  return {
    city: "Atelier",
    blocks,
    plots,
    streets,
    intersections,
    lamps,
    trafficLights,
    skyline,
    // In the middle of the square, on the street between its two halves, facing east towards the workshop.
    spawn: { x: SQUARE_AT + SQUARE / 2, z: 0, ry: Math.PI / 2, turn: 0 },
    bounds: { minX: -WIDTH / 2, maxX: WIDTH / 2, minZ: -DEPTH / 2, maxZ: DEPTH / 2 },
  };
}
