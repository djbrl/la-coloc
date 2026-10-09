// Where each house stands. Rows of houses, real houses first, each row facing its own street.
// Every house faces the camera (+z): from an isometric view, a house facing away shows a blank back wall.
export const PLOT = { width: 9, depth: 13, perRow: 4 };

export interface Plot {
  x: number;
  z: number;
}

export function plots(count: number): Plot[] {
  return Array.from({ length: count }, (_, i) => ({
    x: ((i % PLOT.perRow) - (PLOT.perRow - 1) / 2) * PLOT.width,
    z: Math.floor(i / PLOT.perRow) * PLOT.depth,
  }));
}

export function rowCount(count: number): number {
  return Math.max(1, Math.ceil(count / PLOT.perRow));
}

// The street runs in front of each row.
export const STREET_OFFSET = 5.2;
