<script setup lang="ts">
// The neighbourhood from above, north up, on a small glass panel: blocks, streets, a dot per house in its colour,
// the lamps, everyone walking around, and you with a tick for the way you face and a faint wedge for the way the
// camera looks. Click anywhere to travel there. With `large` it fills the middle of the screen (the M key), with
// the houses listed beside it as buttons that travel to their door. Drawn on a canvas, only when something moved.
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { colorFor } from "../../lobby/models";
import type { Neighbourhood } from "../../lobby/neighbourhood";
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
// The house under the mouse, named in a small label.
const hover = ref<{ name: string; x: number; y: number } | null>(null);
const size = ref(pickSize());

const NOBODY = "#d8d8de"; // the colour of someone without a house, like their ring in the city

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
  const dot = (x: number, z: number, r: number, fill: string) => {
    ctx.beginPath();
    ctx.arc(toX(x), toY(z), r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  };

  // Blocks: pale, the market warm, the park green. Streets are the faint gaps between them.
  for (const b of n.blocks) {
    ctx.fillStyle = b.kind === "market" ? "rgba(255, 190, 110, 0.3)" : b.kind === "park" ? "rgba(120, 205, 135, 0.3)" : "rgba(255, 255, 255, 0.12)";
    ctx.fillRect(toX(b.x - b.width / 2), toY(b.z - b.depth / 2), b.width * scale, b.depth * scale);
  }
  ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
  for (const s of n.streets) ctx.fillRect(toX(s.x - s.width / 2), toY(s.z - s.depth / 2), s.width * scale, s.depth * scale);

  for (const l of n.lamps) dot(l.x, l.z, big ? 1.5 : 0.9, "rgba(255, 192, 120, 0.75)");

  // Houses, in their colour; sample houses paler.
  for (const p of housesOnMap.value) {
    ctx.globalAlpha = p.house.demo ? 0.45 : 1;
    dot(p.x, p.z, big ? 6 : 3.2, css(colorFor(p.house.id)));
  }
  ctx.globalAlpha = 1;

  const s = props.state;
  if (!s) return;

  for (const p of s.people) {
    const home = props.residents.get(p.login);
    dot(p.x, p.z, big ? 3.5 : 2, home ? css(colorFor(home.houseId)) : NOBODY);
  }

  // The camera sits at you + (42, 42) turned by `angle`, and looks back at you: the wedge opens the way it looks.
  const you = { x: toX(s.you.x), y: toY(s.you.z) };
  const look = Math.atan2(-(-Math.sin(s.angle) + Math.cos(s.angle)), -(Math.cos(s.angle) + Math.sin(s.angle)));
  const spread = Math.PI / 4.5;
  ctx.beginPath();
  ctx.moveTo(you.x, you.y);
  ctx.arc(you.x, you.y, 12 * scale, look - spread, look + spread); // twelve units ahead of you
  ctx.closePath();
  ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
  ctx.fill();

  // You: a bigger white marker, with a tick for the way you face (a model turned by ry faces (sin ry, cos ry)).
  const r = big ? 6.5 : 4;
  ctx.beginPath();
  ctx.moveTo(you.x, you.y);
  ctx.lineTo(you.x + Math.sin(s.you.ry) * (r + (big ? 7 : 4)), you.y + Math.cos(s.you.ry) * (r + (big ? 7 : 4)));
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = big ? 2.5 : 2;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(you.x, you.y, r, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.strokeStyle = "rgba(28, 24, 44, 0.8)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// ---- The mouse: a name on hover, travel on click ----

function onMove(e: MouseEvent) {
  const { toX, toY } = frame();
  const reach = props.large ? 10 : 7;
  let best: { name: string; x: number; y: number } | null = null;
  let bestD = reach;
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

// Redraw when the engine speaks or the city changes, never every frame.
watch(() => [props.state, props.neighbourhood, props.houses, props.residents, size.value], draw, { flush: "post" });

// Enter presses the focused button, and must not also reach the lobby, which would read it as E.
function onKey(e: KeyboardEvent) {
  if (e.key === "Enter") e.stopPropagation();
}
</script>

<template>
  <!-- Big: a veil dims the city, and a click on it (not on the panel) closes. -->
  <div v-if="large" class="veil" @click.self="emit('close')">
    <section class="big" role="dialog" aria-modal="true" :aria-label="`Map of ${neighbourhood.city}`" @keydown.esc.stop="emit('close')" @keydown="onKey">
      <h2>{{ neighbourhood.city }}</h2>
      <p class="soft">Click the map to travel there, or pick a house.</p>
      <div class="row">
        <div class="holder">
          <canvas
            ref="canvas"
            role="img"
            :aria-label="`Map of ${neighbourhood.city}. Click to travel there.`"
            :style="{ width: `${size.w}px`, height: `${size.h}px` }"
            @mousemove="onMove"
            @mouseleave="hover = null"
            @click="onClick"
          />
          <span v-if="hover" class="tip" :style="{ left: `${hover.x}px`, top: `${hover.y}px` }" aria-hidden="true">{{ hover.name }}</span>
          <span class="north" aria-hidden="true">N</span>
        </div>
        <ul>
          <li v-for="p in housesOnMap" :key="p.house.id">
            <button ref="houseButtons" @click="emit('travel', p.x, p.z)">
              <span class="swatch" :style="{ background: css(colorFor(p.house.id)), opacity: p.house.demo ? 0.5 : 1 }" aria-hidden="true" />
              {{ line(p.house) }}
            </button>
          </li>
        </ul>
      </div>
      <button class="close" @click="emit('close')">Close</button>
    </section>
  </div>

  <div v-else class="small">
    <canvas
      ref="canvas"
      role="img"
      :aria-label="`Map of ${neighbourhood.city}. Click to travel there.`"
      :style="{ width: `${size.w}px`, height: `${size.h}px` }"
      @mousemove="onMove"
      @mouseleave="hover = null"
      @click="onClick"
    />
    <span v-if="hover" class="tip" :style="{ left: `${hover.x}px`, top: `${hover.y}px` }" aria-hidden="true">{{ hover.name }}</span>
    <span class="north" aria-hidden="true">N</span>
  </div>
</template>

<style scoped>
.small, .big { color: #f5f5f7; background: rgba(28, 24, 44, 0.6); backdrop-filter: saturate(180%) blur(20px); -webkit-backdrop-filter: saturate(180%) blur(20px); }
.small { position: relative; padding: 6px; border-radius: 14px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25); }
.holder { position: relative; }
canvas { display: block; border-radius: 10px; cursor: pointer; }
.tip { position: absolute; transform: translate(-50%, calc(-100% - 8px)); padding: 3px 8px; border-radius: 8px; background: rgba(255, 255, 255, 0.95); color: #1d1d1f; font-size: 12px; font-weight: 500; white-space: nowrap; pointer-events: none; }
.north { position: absolute; top: 8px; left: 10px; font-size: 10px; font-weight: 600; color: rgba(245, 245, 247, 0.55); pointer-events: none; }
.big .north { top: 6px; left: 8px; font-size: 12px; }
.veil { position: absolute; inset: 0; z-index: 40; display: grid; place-items: center; background: rgba(0, 0, 0, 0.35); }
.big {
  width: min(880px, calc(100vw - 32px));
  max-height: calc(100dvh - 64px);
  overflow-y: auto;
  padding: 22px 24px 18px;
  border-radius: 22px;
  background: rgba(28, 24, 44, 0.85);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.3);
  display: grid;
  gap: 12px;
}
h2 { margin: 0; font-size: 28px; font-weight: 600; letter-spacing: -0.02em; color: #fff; }
.soft { margin: 0; font-size: 15px; color: rgba(245, 245, 247, 0.72); }
.row { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 20px; }
ul { list-style: none; margin: 0; padding: 0; flex: 1; min-width: 220px; display: grid; }
li button { width: 100%; display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 8px 6px; border: 0; border-bottom: 1px solid rgba(255, 255, 255, 0.12); border-radius: 8px; background: none; color: inherit; font: inherit; font-size: 15px; text-align: left; cursor: pointer; }
li button:hover:not(:disabled) { background: rgba(255, 255, 255, 0.08); color: #fff; }
.swatch { width: 10px; height: 10px; flex: none; border-radius: 50%; }
.close { justify-self: start; border: 0; border-radius: 980px; padding: 8px 18px; min-height: 40px; font-size: 15px; font-weight: 500; background: #fff; color: #1d1d1f; cursor: pointer; }
.close:hover:not(:disabled) { background: #e8e8ed; }
button:focus-visible { outline: 3px solid #6eb4ff; outline-offset: 2px; }
</style>
