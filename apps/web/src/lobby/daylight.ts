// The city's light: full day, always (no dusk, no night, no lamps coming on). Pure: it returns numbers and colours;
// the lobby applies them once per city. Colours are hex numbers, as three.js takes them.

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

const DAY: Lighting = { sky: 0xf4f6ff, ground: 0x9a9480, hemi: 2.0, sunColor: 0xfff1dc, sunPower: 2.4, fog: 0xbcd3ea, top: 0x6fa6dc, bottom: 0xcfe2f2 };

function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

/** Full daylight, with a touch of the city's own sky (Dakar's yellow haze, Kigali's pale blue) on the horizon. */
export function daylight(skyTint: number | null = null): Lighting {
  if (skyTint === null) return { ...DAY };
  return { ...DAY, bottom: mix(DAY.bottom, skyTint, 0.25), fog: mix(DAY.fog, skyTint, 0.15) };
}
