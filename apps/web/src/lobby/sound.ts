// The lobby's sounds: short, soft and calm. Nothing is downloaded: every sound is built here from the Web Audio API
// (a few sine waves, a little filtered noise, and a volume curve), so there is no sound file and no licence to declare.
import { settings } from "../settings";

export type Sound =
  | "select"
  | "open"
  | "close"
  | "step"
  | "emote"
  | "knock"
  | "arrive"
  | "build"
  | "dash"
  | "celebrate"
  | "sputter"
  | "clunk"
  | "stamp"
  | "keys"
  | "tick"
  | "crash"
  | "coin"
  | "team";

// Everything a sound needs to be built: the audio context, the master volume, and a bit of noise to reuse.
interface Audio {
  ctx: AudioContext;
  master: GainNode;
  noise: AudioBuffer;
}

let audio: Audio | null = null;
// Set when this browser has no Web Audio at all, so we stop trying.
let unsupported = false;

// The quietest a sound can fade to (an exponential fade can't reach exactly zero).
const SILENT = 0.0001;

// Browsers block sound until the person has clicked or pressed a key. Safari used to call the class webkitAudioContext.
function audioContextClass(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

// One second of random samples is plenty: a footstep or a knock only plays a slice of it.
function makeNoise(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  return buffer;
}

// Creates the audio context the first time it's needed. Returns null when there's no audio, or when nobody has
// touched the page yet (a context made before that could never make a sound).
function getAudio(): Audio | null {
  if (audio) return audio;
  if (unsupported) return null;
  const Context = audioContextClass();
  if (!Context) {
    unsupported = true;
    return null;
  }
  if (typeof navigator !== "undefined" && navigator.userActivation && !navigator.userActivation.hasBeenActive) return null;
  const ctx = new Context();
  const master = ctx.createGain();
  master.gain.value = 0.25;
  master.connect(ctx.destination);
  audio = { ctx, master, noise: makeNoise(ctx) };
  return audio;
}

/**
 * Wakes the audio up. Call it from the first click or key press: browsers keep audio asleep until the person has
 * done something, and this is what wakes it. It's safe to call again and again, and it never throws.
 */
export function unlock(): void {
  try {
    const a = getAudio();
    if (a && a.ctx.state === "suspended") void a.ctx.resume().catch(() => {});
  } catch {
    // No audio here: stay silent.
  }
}

// One soft note. It rises fast to `volume`, then fades away over `length` seconds.
// `to` makes the pitch glide from `pitch` to another one; `dull` is the lowpass cutoff that takes the edge off.
function tone(a: Audio, start: number, length: number, pitch: number, volume: number, opts: { type?: OscillatorType; to?: number; dull?: number } = {}) {
  const osc = a.ctx.createOscillator();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(pitch, start);
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, start + length);
  const filter = a.ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = opts.dull ?? 4000;
  const gain = a.ctx.createGain();
  gain.gain.setValueAtTime(SILENT, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.006);
  gain.gain.exponentialRampToValueAtTime(SILENT, start + length);
  osc.connect(filter).connect(gain).connect(a.master);
  osc.start(start);
  osc.stop(start + length + 0.02);
}

// A short puff of filtered noise: the body of a footstep or a knock. `pitch` is the centre of the filter.
function puff(a: Audio, start: number, length: number, pitch: number, volume: number, kind: BiquadFilterType = "bandpass") {
  const source = a.ctx.createBufferSource();
  source.buffer = a.noise;
  const filter = a.ctx.createBiquadFilter();
  filter.type = kind;
  filter.frequency.value = pitch;
  filter.Q.value = 3;
  const gain = a.ctx.createGain();
  gain.gain.setValueAtTime(SILENT, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.003);
  gain.gain.exponentialRampToValueAtTime(SILENT, start + length);
  source.connect(filter).connect(gain).connect(a.master);
  // Start from a random spot in the noise, so two puffs never sound identical.
  source.start(start, Math.random() * 0.5, length + 0.02);
}

// Notes, for readability: pitches in Hz.
const C5 = 523, E5 = 659, G5 = 784, B5 = 988, A5 = 880;

// The recipe for each sound. `t` is the moment it starts.
const recipes: Record<Sound, (a: Audio, t: number) => void> = {
  // A tiny tick: the highlight moved.
  select: (a, t) => tone(a, t, 0.04, 1500, 0.12, { type: "triangle", to: 1200 }),

  // A card opens: a soft blip that rises.
  open: (a, t) => tone(a, t, 0.14, 520, 0.2, { to: 780, dull: 2400 }),

  // A card closes: the same blip, falling.
  close: (a, t) => tone(a, t, 0.12, 700, 0.18, { to: 440, dull: 2400 }),

  // A footstep: a dull thud of noise, a little different each time. Very quiet, because it plays often.
  step: (a, t) => puff(a, t, 0.07, 140 + Math.random() * 80, 0.35, "lowpass"),

  // An emote: two quick notes going up, playful.
  emote: (a, t) => {
    tone(a, t, 0.09, E5, 0.18, { type: "triangle", dull: 3000 });
    tone(a, t + 0.07, 0.1, B5, 0.18, { type: "triangle", dull: 3000 });
  },

  // Two knocks on wood: a burst of noise plus a low thump, twice.
  knock: (a, t) => {
    for (const at of [0, 0.11]) {
      puff(a, t + at, 0.05, 700, 0.5);
      tone(a, t + at, 0.06, 190, 0.3, { to: 120 });
    }
  },

  // Arriving somewhere new: a gentle two-note chime, the second note higher and longer.
  arrive: (a, t) => {
    tone(a, t, 0.4, E5, 0.2);
    tone(a, t + 0.17, 0.5, B5, 0.18);
  },

  // A dash: a short whoosh of air, rising.
  dash: (a, t) => {
    puff(a, t, 0.16, 900, 0.3);
    tone(a, t, 0.14, 300, 0.1, { to: 700, dull: 1800 });
  },

  // Something is being built: a quick tap, then three notes of a chord one after another.
  build: (a, t) => {
    puff(a, t, 0.03, 900, 0.3);
    [C5, E5, G5].forEach((pitch, i) => tone(a, t + i * 0.04, 0.15, pitch, 0.16, { type: "triangle", dull: 3000 }));
  },

  // A project went online: a deep drum hit (like a sabar), then three pops and a bright chord rising over them.
  celebrate: (a, t) => {
    tone(a, t, 0.35, 110, 0.35, { to: 70, dull: 900 });
    puff(a, t, 0.08, 300, 0.4, "lowpass");
    [0.18, 0.32, 0.43].forEach((at, i) => puff(a, t + at, 0.09, 1800 + i * 500, 0.35));
    [C5, E5, G5, C5 * 2].forEach((pitch, i) => tone(a, t + 0.2 + i * 0.07, 0.5, pitch, 0.12, { type: "triangle", dull: 3500 }));
  },

  // A power cut: a generator coughing and dying, three low stutters slowing down.
  sputter: (a, t) => {
    [0, 0.12, 0.28].forEach((at, i) => {
      puff(a, t + at, 0.09 + i * 0.03, 120 - i * 20, 0.45, "lowpass");
      tone(a, t + at, 0.08, 75 - i * 10, 0.2, { type: "sawtooth", dull: 400 });
    });
  },

  // The power is back: one heavy switch thrown.
  clunk: (a, t) => {
    puff(a, t, 0.06, 500, 0.5);
    tone(a, t, 0.12, 160, 0.3, { to: 90, dull: 1200 });
  },

  // A chapter of the quest is done: a soft rubber stamp coming down (a muffled thump), then a bright little
  // two-note ding, the second higher, as a reward. Half a second in all.
  stamp: (a, t) => {
    puff(a, t, 0.07, 220, 0.4, "lowpass");
    tone(a, t, 0.1, 150, 0.28, { to: 85, dull: 700 });
    tone(a, t + 0.13, 0.25, G5, 0.15, { dull: 3500 });
    tone(a, t + 0.23, 0.35, G5 * 2, 0.13, { dull: 4000 });
  },

  // The keys to your room: small metal keys jingling, a handful of very short high notes, each with a tick of
  // bright noise, at slightly random moments and pitches, so no two jingles are the same.
  keys: (a, t) => {
    for (let i = 0; i < 6; i++) {
      const at = t + i * 0.07 + Math.random() * 0.03;
      tone(a, at, 0.06 + Math.random() * 0.05, 2600 + Math.random() * 2200, 0.06, { type: "triangle", dull: 7000 });
      puff(a, at, 0.025, 6000 + Math.random() * 2000, 0.12);
    }
  },

  // The launch moved on to its next stage: a light blip that rises, quieter and shorter than "build".
  tick: (a, t) => tone(a, t, 0.09, A5, 0.1, { type: "triangle", to: B5 * 1.2, dull: 3000 }),

  // A room's app crashed and came back (life.ts): a short buzz falling away with a dull thud, then, a beat later, a
  // small rising blip as it starts again.
  crash: (a, t) => {
    tone(a, t, 0.2, 420, 0.2, { type: "sawtooth", to: 90, dull: 1400 });
    puff(a, t, 0.12, 260, 0.4, "lowpass");
    tone(a, t + 0.34, 0.12, E5, 0.12, { type: "triangle", to: B5, dull: 3000 });
  },

  // A review paid: a coin, two bright notes, the second higher and ringing a little longer.
  coin: (a, t) => {
    tone(a, t, 0.07, B5, 0.13, { type: "triangle", dull: 5000 });
    tone(a, t + 0.07, 0.3, E5 * 2, 0.13, { type: "triangle", dull: 5000 });
  },

  // Flatmates teamed up: a little pop of confetti, then two notes going up together.
  team: (a, t) => {
    puff(a, t, 0.05, 1500, 0.3);
    tone(a, t + 0.02, 0.25, G5, 0.12, { type: "triangle", dull: 3500 });
    tone(a, t + 0.1, 0.3, B5, 0.12, { type: "triangle", dull: 3500 });
  },
};

// How soon the same sound may play again, in milliseconds. Footsteps are slower than the rest.
const MIN_GAP = 60;
const GAPS: Partial<Record<Sound, number>> = { step: 180 };
const lastPlayed: Partial<Record<Sound, number>> = {};

/** Plays a short sound. Silent when sounds are off in settings, or when the browser has no audio. */
export function play(name: Sound): void {
  if (!settings.sound) return;
  try {
    const now = Date.now();
    if (now - (lastPlayed[name] ?? 0) < (GAPS[name] ?? MIN_GAP)) return;
    const a = getAudio();
    if (!a) return;
    if (a.ctx.state !== "running") {
      // Still asleep: ask it to wake up, and skip this sound rather than play it late.
      void a.ctx.resume().catch(() => {});
      return;
    }
    lastPlayed[name] = now;
    recipes[name](a, a.ctx.currentTime);
  } catch {
    // Audio is a nicety. If anything goes wrong, stay silent.
  }
}
