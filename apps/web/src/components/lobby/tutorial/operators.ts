// The mobile money providers' marks (OperatorMark.vue): each one's brand colour, and a glyph (a path on a 20 x 20
// square) or a letter. Matched on the name, whatever its case, so "Orange Money" and "orange money" are one.
export interface OperatorMark {
  bg: string;
  fg: string;
  path?: string;
  letter?: string;
}

const MARKS: Record<string, OperatorMark> = {
  // Wave's sky blue, and a wave.
  wave: { bg: "#1DC8F2", fg: "#FFFFFF", path: "M4 11.5c1.5-2.4 3-2.4 4 0s2.5 2.4 4 0 3-2.4 4 0" },
  // Orange's square, its white line at the bottom left.
  orange: { bg: "#FF7900", fg: "#FFFFFF", path: "M4.6 15.2h6" },
  free: { bg: "#E2001A", fg: "#FFFFFF", letter: "f" },
  mtn: { bg: "#FFCB05", fg: "#1B1B1B", letter: "M" },
  moov: { bg: "#0062A8", fg: "#FFFFFF", letter: "M" },
  airtel: { bg: "#E40000", fg: "#FFFFFF", letter: "a" },
};

export function operatorMark(name: string): OperatorMark {
  const first = name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return MARKS[first] ?? { bg: "#E6E3E8", fg: "#5B5660", letter: (name.trim()[0] ?? "?").toUpperCase() };
}
