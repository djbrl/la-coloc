// The city's light: dusk, always, as the landing's street: the sun low and orange, the sky going dark overhead, windows
// lit. Pure: it returns numbers and colours; the lobby applies them once per city. Colours are hex numbers, as three.js takes them.

export interface Lighting {
  sky: number; // the hemisphere light from above
  ground: number; // and from below
  hemi: number; // its strength
  sunColor: number;
  sunPower: number;
  fog: number;
  top: number; // the sky behind the city: top of the screen
  bottom: number; // and the horizon
}

const DUSK: Lighting = { sky: 0x7068c8, ground: 0x3f3458, hemi: 1.55, sunColor: 0xe08a90, sunPower: 0.85, fog: 0x4f3f6e, top: 0x1c1840, bottom: 0x7a5580 };

function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

/** Dusk, with a touch of the city's own sky (Dakar's yellow haze, Kigali's pale blue) on the horizon. */
export function daylight(skyTint: number | null = null): Lighting {
  if (skyTint === null) return { ...DUSK };
  return { ...DUSK, bottom: mix(DUSK.bottom, skyTint, 0.25), fog: mix(DUSK.fog, skyTint, 0.15) };
}
