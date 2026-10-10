// The light of a city at its real local time (R29): day, dusk or night, with the street lamps on from sunset to
// sunrise. Pure: it takes a date, a time zone and where the city is, and returns numbers and colours; the lobby
// applies them. Sunrise and sunset come from the usual textbook approximation (the sun's declination for the day of
// the year, and the hour angle at which it crosses the horizon): a few minutes off at most, plenty for a game.

export type Phase = "day" | "dusk" | "night" | "dawn";

export interface Daylight {
  // The local time, in hours (13.5 is half past one in the afternoon), and the sun's times that day.
  hour: number;
  sunrise: number;
  sunset: number;
  phase: Phase;
  // Street lamps and lit windows: on from a little before sunset to a little after sunrise.
  lampsOn: boolean;
  // How much daylight there is, from 0 (night) to 1 (full day): everything below blends on it.
  sun: number;
}

/** The local hour (0–24, with minutes as a fraction) at `date` in time zone `tz`. */
export function localHour(date: Date, tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(date);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    return get("hour") + get("minute") / 60;
  } catch {
    // An unknown time zone: the visitor's own clock.
    return date.getHours() + date.getMinutes() / 60;
  }
}

/** The time zone's offset from UTC at `date`, in hours (Dakar 0, Kigali 2). */
export function utcOffset(date: Date, tz: string): number {
  const local = localHour(date, tz);
  const utc = date.getUTCHours() + date.getUTCMinutes() / 60;
  let d = local - utc;
  if (d > 12) d -= 24;
  if (d < -12) d += 24;
  return d;
}

/** Sunrise and sunset, in local hours, for a place at latitude `lat`, longitude `lon` (degrees, east positive). */
export function sunTimes(date: Date, lat: number, lon: number, offset: number): { sunrise: number; sunset: number } {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = Math.floor((date.getTime() - start) / 86_400_000);
  const rad = Math.PI / 180;
  // The sun's declination: how far north or south of the equator it stands that day.
  const decl = 23.44 * Math.sin(((2 * Math.PI) / 365) * (day - 81));
  // The hour angle at which the sun's centre crosses the horizon (a little below it, for the refraction).
  const cos = (Math.sin(-0.83 * rad) - Math.sin(lat * rad) * Math.sin(decl * rad)) / (Math.cos(lat * rad) * Math.cos(decl * rad));
  const half = (Math.acos(Math.max(-1, Math.min(1, cos))) / rad) / 15;
  // Solar noon: 12:00 at the time zone's own meridian, later the further west the city is from it.
  const noon = 12 + offset - lon / 15;
  return { sunrise: noon - half, sunset: noon + half };
}

/** The light at `date` for a city (its time zone and where it is). `hourOverride` pins the local hour (dev tool). */
export function daylightAt(date: Date, place: { tz: string; lat: number; lon: number }, hourOverride: number | null = null): Daylight {
  const hour = hourOverride ?? localHour(date, place.tz);
  const { sunrise, sunset } = sunTimes(date, place.lat, place.lon, utcOffset(date, place.tz));
  // Full day an hour after sunrise until an hour before sunset; full night from 40 minutes after sunset to 40
  // minutes before sunrise; a blend in between (dawn and dusk).
  const sun = hour < sunrise - 0.66 || hour > sunset + 0.66 ? 0 : hour < sunrise + 1 ? (hour - (sunrise - 0.66)) / 1.66 : hour > sunset - 1 ? (sunset + 0.66 - hour) / 1.66 : 1;
  const phase: Phase = sun >= 1 ? "day" : sun <= 0 ? "night" : hour < 12 ? "dawn" : "dusk";
  const lampsOn = hour >= sunset - 0.4 || hour <= sunrise + 0.3;
  return { hour, sunrise, sunset, phase, lampsOn, sun: Math.max(0, Math.min(1, sun)) };
}

// Three looks to blend between, by `sun`: night (0), dusk (0.5) and day (1). Night stays readable: a blue moonlight,
// not black. Colours are hex numbers, as three.js takes them.
interface Look {
  sky: number; // the hemisphere light from above
  ground: number; // and from below
  hemi: number; // its strength
  sunColor: number;
  sunPower: number;
  fog: number;
  top: number; // the sky behind the city: top of the screen
  bottom: number; // and the horizon
}

const NIGHT: Look = { sky: 0x8796d8, ground: 0x3a3a5c, hemi: 1.45, sunColor: 0xa9b8ff, sunPower: 0.7, fog: 0x2c3157, top: 0x0f1630, bottom: 0x2d3566 };
const DUSK: Look = { sky: 0xe4dcff, ground: 0x6a6488, hemi: 1.9, sunColor: 0xffc9a0, sunPower: 2.1, fog: 0x9d8fc6, top: 0x2a2148, bottom: 0x8a6aa0 };
const DAY: Look = { sky: 0xf4f6ff, ground: 0x9a9480, hemi: 2.0, sunColor: 0xfff1dc, sunPower: 2.4, fog: 0xbcd3ea, top: 0x6fa6dc, bottom: 0xcfe2f2 };

export interface Lighting extends Look {}

function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

/** The light for an amount of daylight (0 night, 1 day), tinted towards the city's sky colour at dusk and by day. */
export function lightingFor(sun: number, skyTint: number | null = null): Lighting {
  const [from, to, t] = sun < 0.5 ? [NIGHT, DUSK, sun / 0.5] : [DUSK, DAY, (sun - 0.5) / 0.5];
  const out = {} as Lighting;
  for (const k of Object.keys(from) as (keyof Look)[]) {
    out[k] = k === "hemi" || k === "sunPower" ? from[k] + (to[k] - from[k]) * t : mix(from[k], to[k], t);
  }
  // A touch of the city's own sky (Dakar's yellow haze, Kigali's pale blue) on the horizon, never at night.
  if (skyTint !== null) {
    const amount = 0.25 * Math.min(1, sun * 2);
    out.bottom = mix(out.bottom, skyTint, amount);
    out.fog = mix(out.fog, skyTint, amount * 0.6);
  }
  return out;
}
