// Name tags and house flags, drawn on one flat canvas over the 3D view. As page elements they cost the browser a style
// recalculation for every tag that moved, every frame (measured at 100 people: 5 to 700 ms a frame). Here, each tag is
// drawn once into a small picture, cached by what it says; a frame only stamps those pictures at the right places.
import * as THREE from "three";
import type { TagSpot } from "./tags";

export type TagKind = "you" | "person" | "small" | "house" | "arena";
export type Tone = "gold" | "silver" | "bronze";

export interface TagWords {
  kind: TagKind;
  text: string;
  // A little square in the house's colour, before a house's name.
  swatch?: string;
  // Their house, on the house's colour, after a name.
  home?: { text: string; background: string; color: string } | null;
  // The title they won in the Arena: a trophy and its words.
  won?: { text: string; tone: Tone } | null;
  // They're visiting from another city: the word for it, after their house.
  tourist?: string | null;
  // On a house's flag: someone living there takes part in this week's Arena challenge. A red chip, a trophy and the word.
  arena?: string | null;
}

/** One tag: what it says, and the thing it floats over (it follows it, `y` metres up). */
export class Tag {
  // Within range of you and not behind a wall (Lobby.ts decides); and faded back behind a nearer tag.
  on = true;
  crowded = false;
  alpha = 1;
  picture: Picture | null = null;
  pictureOf = -1;
  clearWidth = 0;
  clearWidthOf = -1;

  constructor(
    readonly owner: THREE.Object3D,
    readonly y: number,
    public words: TagWords,
  ) {}

  /** Changes what it says: the next frame looks up the matching picture. */
  say(words: Partial<TagWords>) {
    this.words = { ...this.words, ...words };
    this.pictureOf = -1;
    this.clearWidthOf = -1;
  }

  /** Faded back or not. Its crowded look is another picture. */
  crowd(crowded: boolean) {
    if (crowded === this.crowded) return;
    this.crowded = crowded;
    this.pictureOf = -1;
  }
}

interface Picture {
  image: HTMLCanvasElement;
  // Its size on screen, in CSS pixels, and where the tag's centre falls in it. The arrow and the lip hang below.
  w: number;
  h: number;
  cy: number;
  // The tag's own width, for telling which tags overlap.
  width: number;
}

const LOOKS = {
  small: { size: 11, padX: 6, padY: 2, arrow: 6, chipGap: 4 },
  person: { size: 13, padX: 9, padY: 4, arrow: 8, chipGap: 6 },
  you: { size: 13, padX: 9, padY: 4, arrow: 8, chipGap: 6 },
  house: { size: 15, padX: 10, padY: 5, arrow: 8, chipGap: 6 },
  arena: { size: 15, padX: 10, padY: 5, arrow: 8, chipGap: 6 },
};
const LIP = 2;
const RADIUS = 9;
const SWATCH = 10;
const SWATCH_GAP = 7;
const CUP = "🏆";
const TROPHY_SIZE = 10;
const TROPHY = "M4 1.5h8V3h2.5v1.8a3.2 3.2 0 0 1-3 3.2A4 4 0 0 1 9 10.2V12h2.2v2.5H4.8V12H7v-1.8A4 4 0 0 1 4.5 8a3.2 3.2 0 0 1-3-3.2V3H4zm8 2.9V6.4a1.6 1.6 0 0 0 1-1.6v-.4zM4 4.4H3v.4a1.6 1.6 0 0 0 1 1.6z";
const TONES: Record<Tone, { background: string; color: string }> = {
  gold: { background: "#f5c542", color: "#3a2a00" },
  silver: { background: "#d5d9e0", color: "#23262c" },
  bronze: { background: "#dc955c", color: "#3b1d05" },
};
const TOURIST = { background: "#0f6e84", color: "#fff" };
const CROWDED_ALPHA = 0.35;
const FADE = 0.2;
// Enough for everyone you'll meet in a while. Past this the pictures start over; the ones in use are redrawn as needed.
const MOST_PICTURES = 400;
// How far off screen a tag's centre may be and still show its edge, in CSS pixels.
const MARGIN = 120;

/**
 * Where everything goes in a tag, in CSS pixels, from how wide its words measure. A crowded tag drops its house and
 * tourist chips and the words of its title, keeping the trophy in its colour: who won still shows at a busy door.
 */
export function tagLayout(words: TagWords, crowded: boolean, measure: (text: string, size: number) => number) {
  const look = LOOKS[words.kind];
  const small = words.kind === "small";
  let x = look.padX;
  const swatchAt = words.swatch ? x : -1;
  if (words.swatch) x += SWATCH + SWATCH_GAP;
  const cupAt = words.kind === "arena" ? x : -1;
  if (words.kind === "arena") x += measure(CUP, look.size) + SWATCH_GAP;
  const textAt = x;
  x += measure(words.text, look.size);
  const won = words.won
    ? { at: x + look.chipGap, textSize: small ? 10 : 11, height: small ? 12 : 14, w: 0, pad: crowded ? 3 : small ? 3 : 4, withWords: !crowded }
    : null;
  if (won) {
    won.w = won.pad + TROPHY_SIZE + (won.withWords ? 3 + measure(words.won!.text, won.textSize) + (small ? 5 : 6) : won.pad);
    x = won.at + won.w;
  }
  const home = words.home && !crowded ? { at: x + look.chipGap, textSize: small ? 8 : 9, height: small ? 12 : 14, pad: small ? 5 : 6, w: 0 } : null;
  if (home) {
    home.w = home.pad * 2 + measure(words.home!.text, home.textSize);
    x = home.at + home.w;
  }
  const tourist = words.tourist && !crowded ? { at: x + look.chipGap, textSize: small ? 8 : 9, height: small ? 12 : 14, pad: small ? 5 : 6, w: 0 } : null;
  if (tourist) {
    tourist.w = tourist.pad * 2 + measure(words.tourist!, tourist.textSize);
    x = tourist.at + tourist.w;
  }
  // The Arena tag on a house's flag: a trophy, then the word, on the sign's red.
  const arena = words.arena ? { at: x + look.chipGap, textSize: 11, height: 16, pad: 5, w: 0 } : null;
  if (arena) {
    arena.w = arena.pad + TROPHY_SIZE + 3 + measure(words.arena!, arena.textSize) + arena.pad + 1;
    x = arena.at + arena.w;
  }
  const width = Math.ceil(x + look.padX);
  const height = Math.ceil(look.size * 1.2 + look.padY * 2);
  return { look, width, height, swatchAt, cupAt, textAt, won, home, tourist, arena };
}

export class TagLayer {
  readonly canvas = document.createElement("canvas");
  // What the tags on screen say, for screen readers (the canvas itself says nothing to them).
  readonly names = document.createElement("ul");
  private readonly ctx = this.canvas.getContext("2d");
  private readonly scratch = document.createElement("canvas").getContext("2d");
  private pictures = new Map<string, Picture>();
  private generation = 0;
  private ratio = 1;
  private width = 0;
  private height = 0;
  private said = "";
  private readonly at = new THREE.Vector3();
  private readonly toScreen = new THREE.Matrix4();
  private readonly colours: { font: string; surface: string; text: string; red: string; onRed: string; lip: string };
  private readonly trophy = typeof Path2D === "undefined" ? null : new Path2D(TROPHY);

  constructor() {
    this.canvas.className = "lobby-tags";
    this.canvas.setAttribute("aria-hidden", "true");
    this.names.className = "sr-only";
    const css = getComputedStyle(document.documentElement);
    const v = (name: string) => css.getPropertyValue(name).trim();
    this.colours = { font: v("--font") || "sans-serif", surface: v("--surface"), text: v("--text"), red: v("--panel-red"), onRed: v("--on-panel"), lip: v("--accent-lip") };
    // A picture drawn before the font arrived has the wrong letters: they're drawn again.
    void document.fonts?.ready.then(() => this.forget());
  }

  setSize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(width * this.ratio);
    this.canvas.height = Math.round(height * this.ratio);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.forget();
  }

  /**
   * How wide a tag is on screen when it isn't faded back, in CSS pixels. Always that width: a faded tag is narrower
   * (no house chip), so measuring it as drawn would make it stop overlapping, come back, overlap again, and blink.
   */
  widthOf(tag: Tag): number {
    if (tag.clearWidthOf === this.generation) return tag.clearWidth;
    if (!this.scratch) return 80;
    tag.clearWidth = tagLayout(tag.words, false, this.measure).width;
    tag.clearWidthOf = this.generation;
    return tag.clearWidth;
  }

  /** One frame: the flags at the back, then people's tags, the nearest last (`spots` comes nearest first). */
  draw(camera: THREE.Camera, flags: Tag[], spots: TagSpot[], count: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.toScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    for (const flag of flags) this.stamp(ctx, flag);
    for (let i = count - 1; i >= 0; i--) if (spots[i].shown && spots[i].tag) this.stamp(ctx, spots[i].tag!);
    ctx.globalAlpha = 1;
  }

  /** Tells screen readers what's on screen, when that changed. Called rarely: it's the one thing here that touches the page. */
  sayNames(flags: Tag[], spots: TagSpot[], count: number) {
    const names: string[] = [];
    for (let i = 0; i < count; i++) if (spots[i].shown && spots[i].tag) names.push(spots[i].tag!.words.text);
    for (const flag of flags) if (flag.owner.visible) names.push(flag.words.arena ? `${flag.words.text}, ${flag.words.arena}` : flag.words.text);
    const said = names.join("\n");
    if (said === this.said) return;
    this.said = said;
    this.names.replaceChildren(...names.map((name) => Object.assign(document.createElement("li"), { textContent: name })));
  }

  dispose() {
    this.canvas.remove();
    this.names.remove();
    this.pictures.clear();
  }

  private measure = (text: string, size: number): number => {
    const measurer = this.scratch!;
    measurer.font = `800 ${size}px ${this.colours.font}`;
    return measurer.measureText(text).width;
  };

  private forget() {
    this.pictures.clear();
    this.generation++;
  }

  private stamp(ctx: CanvasRenderingContext2D, tag: Tag) {
    for (let o: THREE.Object3D | null = tag.owner; o; o = o.parent) if (!o.visible) return;
    const m = tag.owner.matrixWorld.elements;
    const v = this.at.set(m[12], m[13] + tag.y, m[14]).applyMatrix4(this.toScreen);
    if (v.z < -1 || v.z > 1) return;
    const x = ((v.x + 1) / 2) * this.width;
    const y = ((1 - v.y) / 2) * this.height;
    if (x < -MARGIN || x > this.width + MARGIN || y < -MARGIN || y > this.height + MARGIN) return;
    const picture = this.pictureFor(tag);
    if (!picture) return;
    tag.alpha += ((tag.crowded ? CROWDED_ALPHA : 1) - tag.alpha) * FADE;
    ctx.globalAlpha = tag.alpha;
    const r = this.ratio;
    // On whole device pixels, so the letters stay sharp.
    ctx.drawImage(picture.image, Math.round((x - picture.w / 2) * r), Math.round((y - picture.cy) * r));
  }

  private pictureFor(tag: Tag): Picture | null {
    if (tag.pictureOf === this.generation && tag.picture) return tag.picture;
    const { kind, text, swatch, home, won, tourist, arena } = tag.words;
    const key = `${kind}|${text}|${swatch ?? ""}|${home?.text ?? ""}|${home?.background ?? ""}|${won?.text ?? ""}|${won?.tone ?? ""}|${tourist ?? ""}|${arena ?? ""}|${tag.crowded}`;
    let picture = this.pictures.get(key);
    if (!picture) {
      if (this.pictures.size >= MOST_PICTURES) this.forget();
      picture = this.paint(tag.words, tag.crowded) ?? undefined;
      if (!picture) return null;
      this.pictures.set(key, picture);
    }
    tag.picture = picture;
    tag.pictureOf = this.generation;
    return picture;
  }

  private paint(words: TagWords, crowded: boolean): Picture | null {
    if (!this.scratch) return null;
    const c = this.colours;
    const font = (size: number) => `800 ${size}px ${c.font}`;
    const layout = tagLayout(words, crowded, this.measure);
    const { look, width, height } = layout;
    const below = Math.max(LIP, look.arrow / 2 + LIP);
    const image = document.createElement("canvas");
    const r = this.ratio;
    image.width = Math.ceil(width * r);
    image.height = Math.ceil((height + below) * r);
    const ctx = image.getContext("2d");
    if (!ctx) return null;
    ctx.scale(r, r);
    ctx.textBaseline = "middle";
    const you = words.kind === "you";
    const body = (colour: string, dy: number) => {
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.roundRect(0, dy, width, height, RADIUS);
      ctx.fill();
      // The little arrow under it, a square on its corner.
      const a = look.arrow / 2;
      ctx.beginPath();
      ctx.moveTo(width / 2 - a, height + dy - a * 0.2);
      ctx.lineTo(width / 2, height + dy + a * 0.8);
      ctx.lineTo(width / 2 + a, height + dy - a * 0.2);
      ctx.fill();
    };
    body(you ? c.lip : "rgba(20, 12, 18, 0.45)", LIP);
    body(you ? c.red : c.surface, 0);
    const mid = height / 2;
    if (layout.swatchAt >= 0) {
      ctx.fillStyle = words.swatch!;
      ctx.beginPath();
      ctx.roundRect(layout.swatchAt, mid - SWATCH / 2, SWATCH, SWATCH, 3);
      ctx.fill();
    }
    ctx.font = font(look.size);
    if (layout.cupAt >= 0) ctx.fillText(CUP, layout.cupAt, mid);
    ctx.fillStyle = you ? c.onRed : c.text;
    ctx.fillText(words.text, layout.textAt, mid);
    if (layout.won && words.won) {
      const tone = TONES[words.won.tone];
      const w = layout.won;
      chip(ctx, w.at, mid, w.w, w.height, tone.background);
      ctx.fillStyle = tone.color;
      if (this.trophy) {
        ctx.save();
        ctx.translate(w.at + w.pad, mid - TROPHY_SIZE / 2);
        ctx.scale(TROPHY_SIZE / 16, TROPHY_SIZE / 16);
        ctx.fill(this.trophy);
        ctx.restore();
      }
      if (w.withWords) {
        ctx.font = font(w.textSize);
        ctx.fillText(words.won.text, w.at + w.pad + TROPHY_SIZE + 3, mid);
      }
    }
    if (layout.home && words.home) {
      const h = layout.home;
      chip(ctx, h.at, mid, h.w, h.height, words.home.background);
      ctx.fillStyle = words.home.color;
      ctx.font = font(h.textSize);
      ctx.fillText(words.home.text, h.at + h.pad, mid);
    }
    if (layout.tourist && words.tourist) {
      const t = layout.tourist;
      chip(ctx, t.at, mid, t.w, t.height, TOURIST.background);
      ctx.fillStyle = TOURIST.color;
      ctx.font = font(t.textSize);
      ctx.fillText(words.tourist, t.at + t.pad, mid);
    }
    if (layout.arena && words.arena) {
      const a = layout.arena;
      chip(ctx, a.at, mid, a.w, a.height, c.red);
      ctx.fillStyle = c.onRed;
      if (this.trophy) {
        ctx.save();
        ctx.translate(a.at + a.pad, mid - TROPHY_SIZE / 2);
        ctx.scale(TROPHY_SIZE / 16, TROPHY_SIZE / 16);
        ctx.fill(this.trophy);
        ctx.restore();
      }
      ctx.font = font(a.textSize);
      ctx.fillText(words.arena, a.at + a.pad + TROPHY_SIZE + 3, mid);
    }
    return { image, w: width, h: height + below, cy: height / 2, width };
  }
}

function chip(ctx: CanvasRenderingContext2D, x: number, mid: number, w: number, h: number, colour: string) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.roundRect(x, mid - h / 2, w, h, 4);
  ctx.fill();
}
