// The name on the wall, as neon tubes: one line per letter. The last C is on its way out, so the landing keeps it apart to
// blink; while it's off, the sign reads LA COLO. The loading screen lights the letters one by one.
export const NEON_VIEW = "-20 2 615 140";
export const NEON_TUBES = "M0 24V120H46 M64 120L95 24L126 120M75 86H115 M233 41A38 48 0 1 0 233 103 M290 24A38 48 0 1 0 290 120A38 48 0 1 0 290 24 M350 24V120H396 M456 24A38 48 0 1 0 456 120A38 48 0 1 0 456 24";
export const NEON_BROKEN = "M575 41A38 48 0 1 0 575 103";
export const NEON_RAIL = "M-10 72H580";
export const NEON_CABLE = "M575 103C582 118 596 118 600 146";
// L, A, C, O, L, O, C: the tubes one at a time, in reading order.
export const NEON_LETTERS = [...NEON_TUBES.split(/ (?=M)/), NEON_BROKEN];
