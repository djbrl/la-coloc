<script setup lang="ts">
// The neighbourhood from above, north up, on a small flat panel: a muted ground with the blocks on it (the market
// and the park in their own tints), a round marker per house in its colour, a dot per person in their house's
// colour, and you as a ring. Nothing else: the map is there to see where you are, who's around, and to click a
// block to go there. With `large` it fills the middle of the screen (the M key), every house named next to its
// marker, and the houses listed beside it as buttons that travel to their door. Drawn on a canvas, only when
// something moved, in the site's own colours so it follows day and night.
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { colorFor } from "../../lobby/models";
import type { Neighbourhood } from "../../lobby/neighbourhood";
import { settings } from "../../settings";
import type { CityHouse } from "../../types";
import { type Home, type MapState, statusLine } from "./cards";

const props = defineProps<{
  neighbourhood: Neighbourhood;
  // The houses of this neighbourhood, for their names and free rooms.
  houses: CityHouse[];
  // Who lives where: a person's dot takes their house's colour.
  residents: Map<string, Home>;
  // The latest word from the engine, or null before the first.
  state: MapState | null;
  large?: boolean;
}>();
const emit = defineEmits<{ travel: [x: number, z: number]; close: [] }>();

const canvas = ref<HTMLCanvasElement | null>(null);
// The house buttons beside the big map (Vue fills the array from the v-for); the first one takes focus.
const houseButtons = ref<HTMLButtonElement[]>([]);
// The house under the mouse on the small map, named in a small label (the big map names them all).
const hover = ref<{ name: string; x: number; y: number } | null>(null);
const size = ref(pickSize());

// Marker sizes, small map / big map, in CSS pixels across.
const HOUSE = { small: 9, big: 16 };
const PERSON = { small: 5, big: 9 };
const YOU = { small: 12, big: 18 };
// The two fixed colours: markers get a white edge, and you a dark one, so they read on any ground.
const WHITE = "#ffffff";
const DARK = "#1d1d1f";

/** The panel's size: small in the corner (smaller still on a phone), big in the middle. */
function pickSize(): { w: number; h: number } {
  const phone = window.matchMedia("(max-width: 520px)").matches;
  if (props.large) {
    const w = Math.min(480, window.innerWidth - 64);
    return { w, h: Math.round(w * 0.75) };
  }
  return phone ? { w: 120, h: 90 } : { w: 170, h: 130 };
}

const css = (hex: number) => `#${hex.toString(16).padStart(6, "0")}`;

// ---- The site's colours, read from its tokens so the map matches day or night ----

/** A token's value as the page has it right now ("#1d1d1f"). */
function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** A hex colour at some opacity, as a string the canvas understands. */
function fade(hex: string, alpha: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  if (hex.length !== 7 || Number.isNaN(n)) return hex;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// Each house on the map: its plot, and what the city says about it.
const housesOnMap = computed(() => {
  const out: { x: number; z: number; house: CityHouse }[] = [];
  for (const p of props.neighbourhood.plots) {
    if (p.lot.kind !== "house") continue;
    const id = p.lot.houseId;
    const house = props.houses.find((h) => h.id === id);
    if (house) out.push({ x: p.x, z: p.z, house });
  }
  // Real houses first, then the samples, each by name.
  return out.sort((a, b) => Number(a.house.demo) - Number(b.house.demo) || a.house.name.localeCompare(b.house.name));
});

// "Sacré-Cœur, 3 rooms free" / "Bè Kpota, full".
const line = (h: CityHouse) => `${h.name}, ${statusLine(h).replace(/\.$/, "").toLowerCase()}`;

// "3 people here", under the small map, so a glance (or a screen reader) gets the gist without the dots.
const peopleLine = computed(() => {
  const n = props.state?.people.length ?? 0;
  return n === 0 ? "You're the only one here" : n === 1 ? "1 person here" : `${n} people here`;
});

// ---- World to canvas and back: a uniform scale, with a margin, centred ----

function frame() {
  const b = props.neighbourhood.bounds;
  const { w, h } = size.value;
  const margin = props.large ? 12 : 6;
  const scale = Math.min((w - 2 * margin) / (b.maxX - b.minX), (h - 2 * margin) / (b.maxZ - b.minZ));
  const ox = (w - (b.maxX - b.minX) * scale) / 2;
  const oy = (h - (b.maxZ - b.minZ) * scale) / 2;
  return {
    scale,
    toX: (x: number) => ox + (x - b.minX) * scale,
    toY: (z: number) => oy + (z - b.minZ) * scale,
    fromX: (px: number) => b.minX + (px - ox) / scale,
    fromY: (py: number) => b.minZ + (py - oy) / scale,
  };
}

function draw() {
  const c = canvas.value;
  const ctx = c?.getContext("2d");
  if (!c || !ctx) return;
  const { w, h } = size.value;
  const dpr = window.devicePixelRatio || 1;
  if (c.width !== w * dpr || c.height !== h * dpr) {
    c.width = w * dpr;
    c.height = h * dpr;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const { scale, toX, toY } = frame();
  const n = props.neighbourhood;
  const big = props.large;
  const text = token("--text");
  const surface = token("--surface");
  const muted = token("--muted");

  /** A filled circle with an edge; `dashed` for the sample houses. */
  const marker = (x: number, z: number, across: number, fill: string, edge: string, edgeWidth: number, dashed = false) => {
    ctx.beginPath();
    ctx.arc(toX(x), toY(z), across / 2, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.setLineDash(dashed ? [edgeWidth * 1.5, edgeWidth * 1.5] : []);
    ctx.strokeStyle = edge;
    ctx.lineWidth = edgeWidth;
    ctx.stroke();
    ctx.setLineDash([]);
  };

  // The ground: the text colour, very faint, over the panel's surface. Streets are the ground itself, so only the
  // blocks are drawn on it, a shade stronger; the market and the park get their own muted tints.
  ctx.fillStyle = fade(text, 0.06);
  ctx.fillRect(0, 0, w, h);
  for (const b of n.blocks) {
    ctx.fillStyle = b.kind === "market" ? "rgba(235, 160, 60, 0.4)" : b.kind === "park" ? "rgba(70, 170, 100, 0.4)" : fade(text, 0.1);
    ctx.fillRect(toX(b.x - b.width / 2), toY(b.z - b.depth / 2), b.width * scale, b.depth * scale);
  }

  // Houses: a round marker in the house's colour. Sample houses get a dashed edge instead of a solid one.
  for (const p of housesOnMap.value) marker(p.x, p.z, big ? HOUSE.big : HOUSE.small, css(colorFor(p.house.id)), WHITE, 2, p.house.demo);

  // The big map names every house next to its marker, with a halo in the surface colour so it reads on any block.
  if (big) {
    ctx.font = `600 12px ${token("--font")}`;
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 3;
    ctx.strokeStyle = surface;
    ctx.fillStyle = text;
    for (const p of housesOnMap.value) {
      const gap = HOUSE.big / 2 + 5;
      const width = ctx.measureText(p.house.name).width;
      // To the right of the marker, unless that runs off the edge; then to the left.
      const right = toX(p.x) + gap + width <= w - 4;
      ctx.textAlign = right ? "left" : "right";
      const x = toX(p.x) + (right ? gap : -gap);
      ctx.strokeText(p.house.name, x, toY(p.z));
      ctx.fillText(p.house.name, x, toY(p.z));
    }
  }

  const s = props.state;
  if (!s) return;

  // People: a small dot in their house's colour; grey when they're just visiting.
  for (const p of s.people) {
    const home = props.residents.get(p.login);
    marker(p.x, p.z, big ? PERSON.big : PERSON.small, home ? css(colorFor(home.houseId)) : muted, WHITE, 1.5);
  }

  // You: a white ring with a dark edge, and a dot in the middle.
  const across = big ? YOU.big : YOU.small;
  marker(s.you.x, s.you.z, across, WHITE, DARK, 2);
  ctx.beginPath();
  ctx.arc(toX(s.you.x), toY(s.you.z), across / 6, 0, Math.PI * 2);
  ctx.fillStyle = DARK;
  ctx.fill();
}

// ---- The mouse: a name on hover (small map), travel on click ----

function onMove(e: MouseEvent) {
  if (props.large) return;
  const { toX, toY } = frame();
  let best: { name: string; x: number; y: number } | null = null;
  let bestD = 7;
  for (const p of housesOnMap.value) {
    const d = Math.hypot(toX(p.x) - e.offsetX, toY(p.z) - e.offsetY);
    if (d < bestD) {
      bestD = d;
      best = { name: p.house.name, x: toX(p.x), y: toY(p.z) };
    }
  }
  hover.value = best;
}

function onClick(e: MouseEvent) {
  const b = props.neighbourhood.bounds;
  const { fromX, fromY } = frame();
  const x = Math.min(b.maxX, Math.max(b.minX, fromX(e.offsetX)));
  const z = Math.min(b.maxZ, Math.max(b.minZ, fromY(e.offsetY)));
  emit("travel", x, z);
}

const resize = () => (size.value = pickSize());

onMounted(() => {
  window.addEventListener("resize", resize);
  draw();
  // The big map takes focus on its first house, a moment later: the M that opened it must not land here.
  if (props.large) setTimeout(() => houseButtons.value[0]?.focus({ preventScroll: true }), 0);
});
onBeforeUnmount(() => window.removeEventListener("resize", resize));

// Redraw when the engine speaks, the city changes or the look switches between day and night, never every frame.
watch(() => [props.state, props.neighbourhood, props.houses, props.residents, size.value, settings.theme], draw, { flush: "post" });

// Enter presses the focused button, and must not also reach the lobby, which would read it as E.
function onKey(e: KeyboardEvent) {
  if (e.key === "Enter") e.stopPropagation();
}
</script>

<template>
  <!-- Big: a scrim dims the city, and a click on it (not on the panel) closes. -->
  <div v-if="large" class="veil" @click.self="emit('close')">
    <section class="big" role="dialog" aria-modal="true" :aria-label="`Map of ${neighbourhood.city}`" @keydown.esc.stop="emit('close')" @keydown="onKey">
      <h2>{{ neighbourhood.city }}</h2>
      <p class="soft">Click a block to go there, or pick a house.</p>
      <div class="row">
        <canvas
          ref="canvas"
          role="img"
          :aria-label="`Map of ${neighbourhood.city}: ${peopleLine.toLowerCase()}. Click a block to go there.`"
          :style="{ width: `${size.w}px`, height: `${size.h}px` }"
          @click="onClick"
        />
        <ul>
          <li v-for="p in housesOnMap" :key="p.house.id">
            <button ref="houseButtons" @click="emit('travel', p.x, p.z)">
              <span class="swatch" :class="{ sample: p.house.demo }" :style="{ background: css(colorFor(p.house.id)) }" aria-hidden="true" />
              {{ line(p.house) }}
            </button>
          </li>
        </ul>
      </div>
      <button class="close" @click="emit('close')">Close</button>
    </section>
  </div>

  <div v-else class="small">
    <div class="holder">
      <canvas
        ref="canvas"
        role="img"
        :aria-label="`Map of ${neighbourhood.city}: ${peopleLine.toLowerCase()}. Click a block to go there.`"
        :style="{ width: `${size.w}px`, height: `${size.h}px` }"
        @mousemove="onMove"
        @mouseleave="hover = null"
        @click="onClick"
      />
      <span v-if="hover" class="tip" :style="{ left: `${hover.x}px`, top: `${hover.y}px` }" aria-hidden="true">{{ hover.name }}</span>
    </div>
    <p class="count">{{ peopleLine }}</p>
  </div>
</template>

<style scoped>
/* Both panels are flat: the site's surface, a hairline edge, a shadow for lift. */
.small, .big { color: var(--text); background: var(--surface); border: 1px solid var(--hairline); box-shadow: var(--shadow); }
.small { display: grid; gap: 6px; padding: 8px; border-radius: 14px; }
.holder { position: relative; }
canvas { display: block; border-radius: 8px; cursor: pointer; }
.count { margin: 0; font-size: 12px; line-height: 1.3; color: var(--muted); text-align: center; }
.tip { position: absolute; transform: translate(-50%, calc(-100% - 8px)); padding: 3px 8px; border-radius: 8px; background: var(--surface); color: var(--text); border: 1px solid var(--hairline); box-shadow: var(--lift); font-size: 12px; font-weight: 500; white-space: nowrap; pointer-events: none; }
.veil { position: absolute; inset: 0; z-index: 40; display: grid; place-items: center; background: var(--scrim); }
.big {
  width: min(880px, calc(100vw - 32px));
  max-height: calc(100dvh - 64px);
  overflow-y: auto;
  padding: 22px 24px 18px;
  border-radius: 22px;
  display: grid;
  gap: 12px;
}
h2 { margin: 0; font-size: 28px; font-weight: 600; letter-spacing: -0.02em; }
.soft { margin: 0; font-size: 15px; color: var(--muted); }
.row { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 20px; }
ul { list-style: none; margin: 0; padding: 0; flex: 1; min-width: 220px; display: grid; }
li button { width: 100%; display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 8px 6px; border: 0; border-bottom: 1px solid var(--hairline); border-radius: 8px; background: none; color: inherit; font: inherit; font-size: 15px; text-align: left; cursor: pointer; }
li button:hover:not(:disabled) { background: var(--fill); }
/* The swatch matches the marker on the map: a sample house has a dashed edge. */
.swatch { width: 10px; height: 10px; flex: none; border-radius: 50%; }
.swatch.sample { outline: 1.5px dashed var(--muted); outline-offset: 1px; }
.close { justify-self: start; border: 0; border-radius: 980px; padding: 8px 18px; min-height: 40px; font-size: 15px; font-weight: 500; background: var(--fill); color: var(--text); cursor: pointer; }
.close:hover:not(:disabled) { background: var(--fill-hover); }
button:focus-visible { outline: 3px solid var(--accent-fill); outline-offset: 2px; }
</style>
