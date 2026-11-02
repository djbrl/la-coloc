<script setup lang="ts">
// The neighbourhood from above, north up, like a game's minimap: the city in its own day colours (the sand or red
// earth, the asphalt streets, the market with its parasols, the park's trees, the shops in the city's wall colour),
// each house as a little house in its colour, a dot per person in their house's colour, and you as a bright yellow
// arrow pointing the way you face. A red pin marks the tutorial's goal (`goal`). Walking is the game: clicking
// the small map opens the big one, it never moves you. With `large` it fills the middle of the screen (the M key),
// every house named next to it, and the houses listed beside it as a game menu's entries (the panels' rows). Picking
// a house, on the map or in the list, is the one fast travel left: it takes you to its door. Empty ground does nothing.
// The map is always drawn by day, like the 3D city; only its frame and the two counts under it follow the page's day
// and night. The drawing itself lives in minimap.ts; this file wires it to the lobby.
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { styleFor } from "../../lobby/cityStyle";
import { colorFor } from "../../lobby/models";
import type { Neighbourhood } from "../../lobby/neighbourhood";
import { me } from "../../session";
import { settings } from "../../settings";
import type { CityHouse } from "../../types";
import type { Home, MapState } from "./cards";
import Icon from "./house/Icon.vue";
import HouseBadge from "./HouseBadge.vue";
import HouseStats from "./HouseStats.vue";
import { clickOnMap, drawCity, drawHouse, drawName, drawPerson, drawPin, drawYou, hexOf, mapColours, mapFrame, nearest } from "./minimap";
import { minimapWords as mw } from "./minimapWords";
import ListRow from "./panel/ListRow.vue";
import { hudWords as said } from "./words";

const props = defineProps<{
  neighbourhood: Neighbourhood;
  // The houses of this neighbourhood, for their names and free rooms.
  houses: CityHouse[];
  // Who lives where: a person's dot takes their house's colour.
  residents: Map<string, Home>;
  // The latest word from the engine, or null before the first.
  state: MapState | null;
  // People logged in and walking around this city right now, you included if you're logged in: the live presence,
  // as the travel menu counts it, not the flatmates drawn standing by their doors.
  online: number;
  large?: boolean;
  // A house the tutorial wants you to walk to: a red pin over it, with a halo (static with calm motion).
  goal?: string | null;
}>();
// `go`: travel to a house's door (big map only); `open`: the small map was clicked, open the big one.
// `arena`: travel to the Arena's entrance (big map only).
const emit = defineEmits<{ go: [houseId: string]; arena: []; open: []; close: [] }>();

const canvas = ref<HTMLCanvasElement | null>(null);
// The house buttons beside the big map (Vue fills the array from the v-for); the first one takes focus.
const houseButtons = ref<HTMLButtonElement[]>([]);
// The house under the mouse on the small map, named in a small label (the big map names them all).
const hover = ref<{ name: string; x: number; y: number } | null>(null);
// The house under the mouse on the big map: its row lights up, and a click goes there.
const pointed = ref<string | null>(null);
const size = ref(pickSize());

// Marker sizes, small map / big map, in CSS pixels across.
const HOUSE = { small: 13, big: 20 };
// The goal's pin: the radius of its round head, and how tall it stands from its tip (on the house) to its top.
const PIN = { small: { head: 5, tall: 15 }, big: { head: 8, tall: 24 } };
const PERSON = { small: 5, big: 9 };
const YOU = { small: 14, big: 20 };
// On a phone the small map is narrower, and its markers a little smaller with it, so they don't cover the streets.
const shrink = computed(() => (!props.large && size.value.w < 150 ? 0.8 : 1));
// Who has no house here (a visitor): a plain grey dot, the colour of a visitor's avatar in the city.
const VISITOR = "#9a96a0";

/** The panel's size: small in the corner (smaller still on a phone), big in the middle. */
function pickSize(): { w: number; h: number } {
  const phone = window.matchMedia("(max-width: 520px)").matches;
  if (props.large) {
    const w = Math.min(480, window.innerWidth - 64);
    return { w, h: Math.round(w * 0.75) };
  }
  return phone ? { w: 120, h: 90 } : { w: 196, h: 196 };
}

// The city's look (its grounds and wall colour), and whether it has a coast to draw along its south side.
const look = computed(() => styleFor(props.neighbourhood.city));
const colours = computed(() => mapColours(look.value));
const coast = computed(() => look.value.coast && look.value.props.includes("pirogues"));

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

// The goal house, if it's in this neighbourhood: where its pin goes.
const goalOnMap = computed(() => (props.goal ? (housesOnMap.value.find((p) => p.house.id === props.goal) ?? null) : null));

// The halo is a page element over the canvas (it animates in CSS; the canvas only redraws when something moved).
const goalHalo = computed(() => {
  const g = goalOnMap.value;
  if (!g) return null;
  const { toX, toY } = frame();
  return { left: `${toX(g.x)}px`, top: `${toY(g.z)}px`, width: `${(props.large ? HOUSE.big : HOUSE.small) * shrink.value * 2.4}px` };
});

// What the canvas says to a screen reader: the city and its people, then the goal when there is one.
const mapLabel = computed(() => {
  const base = said.mapLine(props.neighbourhood.city, peopleLine.value.toLowerCase());
  return goalOnMap.value ? `${base} ${said.yourGoal(goalOnMap.value.house.name)}` : base;
});


// Two different counts: the flatmates of this neighbourhood's houses (the dots by the doors stand in for them), and
// who is actually online and walking around, you included. Under the small map they're two small chips (a house and
// a walker, each with its number); the canvas says them as a sentence to a screen reader.
const living = computed(() => props.houses.reduce((n, h) => n + h.rooms.filter((r) => r.occupant).length, 0));
const peopleLine = computed(() => {
  const out = props.online === 0 ? said.nobodyOut : props.online === 1 && me.value ? said.onlyYouOut : said.out(props.online);
  return said.liveHere(living.value, out);
});
const walkingName = computed(() => (props.online === 1 && me.value ? mw.onlyYouOut : mw.outWalking(props.online)));

// ---- World to canvas and back: the town and a strip of what's around it (the beach and the sea on a coast) ----

function frame() {
  const b = props.neighbourhood.bounds;
  const { w, h } = size.value;
  const view = { minX: b.minX - 2, maxX: b.maxX + 2, minZ: b.minZ - 2, maxZ: b.maxZ + (coast.value ? 10 : 2) };
  return mapFrame(view, w, h, props.large ? 6 : 2);
}

// ---- Drawing: the city once into a layer of its own, the people over it at the screen's frame rate ----

// The city, its houses and (big map) their names: drawn again only when the city, its houses, or the size
// change, then copied under the moving markers each frame.
let base: HTMLCanvasElement | null = null;

function fit(c: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
  const { w, h } = size.value;
  const dpr = window.devicePixelRatio || 1;
  if (c.width !== w * dpr || c.height !== h * dpr) {
    c.width = w * dpr;
    c.height = h * dpr;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
}

function paintBase() {
  base ??= document.createElement("canvas");
  const ctx = base.getContext("2d");
  if (!ctx) return;
  fit(base, ctx);
  const { w, h } = size.value;
  const f = frame();
  const { toX, toY } = f;
  const big = props.large;

  drawCity(ctx, props.neighbourhood, colours.value, f, w, h, coast.value);

  // Houses: a little house in the house's colour. Sample houses get a dashed edge instead of a solid one.
  const across = (big ? HOUSE.big : HOUSE.small) * shrink.value;
  for (const p of housesOnMap.value) drawHouse(ctx, toX(p.x), toY(p.z), across, hexOf(colorFor(p.house.id)), p.house.demo);

  // The big map names every house next to it.
  if (big) {
    const font = getComputedStyle(document.documentElement).getPropertyValue("--font").trim();
    for (const p of housesOnMap.value) drawName(ctx, p.house.name, toX(p.x), toY(p.z), across / 2 + 5, w, font);
  }
  pinColour = getComputedStyle(document.documentElement).getPropertyValue("--accent-fill").trim();
}
let pinColour = "";

// The engine reports where everyone is five times a second. Between two reports the markers glide from where they
// were drawn to where they now are, over one report's time, so they move at the screen's frame rate instead of
// jumping five times a second. Someone who moved further than a street in one report (a fast travel, a new city)
// is put there at once.
const GLIDE_MS = 200;
const JUMP = 8;
interface Spot { x: number; z: number }
interface Drawn { you: Spot & { ry: number }; people: Map<string, Spot> }
let drawn: Drawn | null = null;
let from: Drawn | null = null;
let glideStart = 0;
let raf = 0;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
// The shortest way round from one heading to another.
const turn = (a: number, b: number, t: number) => a + (((((b - a) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) * t;
const far = (a: Spot, b: Spot) => Math.abs(a.x - b.x) > JUMP || Math.abs(a.z - b.z) > JUMP;

function glideTo() {
  const s = props.state;
  if (!s) return;
  from = drawn ?? { you: { ...s.you }, people: new Map(s.people.map((p) => [p.login, { x: p.x, z: p.z }])) };
  glideStart = performance.now();
  if (!raf) raf = requestAnimationFrame(tick);
}

function tick(now: number) {
  raf = 0;
  const s = props.state;
  if (!s || !from) return;
  const t = Math.min(1, (now - glideStart) / GLIDE_MS);
  const you = far(from.you, s.you) ? { ...s.you } : { x: lerp(from.you.x, s.you.x, t), z: lerp(from.you.z, s.you.z, t), ry: turn(from.you.ry, s.you.ry, t) };
  const people = new Map<string, Spot>();
  for (const p of s.people) {
    const was = from.people.get(p.login);
    people.set(p.login, !was || far(was, p) ? { x: p.x, z: p.z } : { x: lerp(was.x, p.x, t), z: lerp(was.z, p.z, t) });
  }
  drawn = { you, people };
  paintFrame();
  if (t < 1) raf = requestAnimationFrame(tick);
}

function paintFrame() {
  const c = canvas.value;
  const ctx = c?.getContext("2d");
  if (!c || !ctx) return;
  fit(c, ctx);
  const { w, h } = size.value;
  if (base) ctx.drawImage(base, 0, 0, w, h);
  const { toX, toY } = frame();
  const big = props.large;

  if (drawn) {
    // People: a small dot in their house's colour; grey when they're just visiting.
    for (const [login, p] of drawn.people) {
      const home = props.residents.get(login);
      drawPerson(ctx, toX(p.x), toY(p.z), (big ? PERSON.big : PERSON.small) * shrink.value, home ? hexOf(colorFor(home.houseId)) : VISITOR);
    }
    // You, last but the pin: the arrow the way you face.
    drawYou(ctx, toX(drawn.you.x), toY(drawn.you.z), drawn.you.ry, (big ? YOU.big : YOU.small) * shrink.value);
  }

  // The goal, last so nothing covers it.
  const goal = goalOnMap.value;
  if (goal) {
    const { head, tall } = big ? PIN.big : PIN.small;
    drawPin(ctx, toX(goal.x), toY(goal.z), head, tall, pinColour);
  }
}

function draw() {
  paintBase();
  paintFrame();
}

// ---- The mouse: a house's name on hover (small map), its row lit (big map); a click on the big map's house goes ----

/** The house drawn under the pointer, if any (within a marker's reach). */
function houseAt(e: MouseEvent) {
  const { toX, toY } = frame();
  const points = housesOnMap.value.map((p) => ({ id: p.house.id, name: p.house.name, x: toX(p.x), y: toY(p.z) }));
  return nearest(points, e.offsetX, e.offsetY, props.large ? HOUSE.big * 0.8 : 8);
}

function onMove(e: MouseEvent) {
  const at = houseAt(e);
  if (props.large) pointed.value = at?.id ?? null;
  else hover.value = at;
}

function onClick(e: MouseEvent) {
  const click = clickOnMap(!!props.large, props.large ? houseAt(e) : null);
  if (click?.kind === "open") emit("open");
  else if (click?.kind === "go") emit("go", click.houseId);
}

const resize = () => (size.value = pickSize());

onMounted(() => {
  window.addEventListener("resize", resize);
  draw();
  glideTo();
  // The big map takes focus on its first house, a moment later: the M that opened it must not land here.
  if (props.large) setTimeout(() => houseButtons.value[0]?.focus({ preventScroll: true }), 0);
});
onBeforeUnmount(() => {
  window.removeEventListener("resize", resize);
  cancelAnimationFrame(raf);
});

// The city's layer is drawn again only when the city, its houses, or the size change.
// A new word from the engine starts a glide; nothing is drawn while nobody moves.
watch(() => [props.neighbourhood, props.houses, size.value], draw, { flush: "post" });
watch(() => [props.residents, props.goal], paintFrame, { flush: "post" });
watch(() => props.state, glideTo, { flush: "post" });

// Enter presses the focused button, and must not also reach the lobby, which would read it as E.
function onKey(e: KeyboardEvent) {
  if (e.key === "Enter") e.stopPropagation();
}
</script>

<template>
  <!-- Big: a scrim dims the city, and a click on it (not on the panel) closes. -->
  <div v-if="large" class="veil" @click.self="emit('close')">
    <section class="big sign" role="dialog" aria-modal="true" :aria-label="said.mapOf(neighbourhood.city)" @keydown.esc.stop="emit('close')" @keydown="onKey">
      <div class="sign-frame">
      <header class="sign-band large">
        <h2>{{ neighbourhood.city }}</h2>
        <p class="sign-sub">{{ said.mapHint }}</p>
        <button class="sign-x" :aria-label="said.closeMap" @click="emit('close')"><span aria-hidden="true">X</span></button>
      </header>
      <div class="sign-body">
      <div class="row">
        <div class="holder">
          <canvas
            ref="canvas"
            role="img"
            :aria-label="mapLabel"
            :class="{ pointing: !!pointed }"
            :style="{ width: `${size.w}px`, height: `${size.h}px` }"
            @mousemove="onMove"
            @mouseleave="pointed = null"
            @click="onClick"
          />
          <span v-if="goalHalo" class="halo" :class="{ calm: settings.reduceMotion }" :style="goalHalo" aria-hidden="true" />
          <span class="compass" :title="mw.northName" aria-hidden="true">{{ mw.north }}</span>
        </div>
        <!-- Each house is a menu entry: the whole row travels to its door; its one button is what the keyboard reaches.
             The house under the mouse on the map lights its row. -->
        <ul class="houses" :style="{ maxHeight: `${size.h}px` }">
          <!-- The Arena first, a stadium in its colours like on the map. -->
          <ListRow v-if="neighbourhood.arena" class="entry" :title="said.arena">
            <template #lead>
              <svg class="stadium" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                <ellipse cx="12" cy="12" rx="10.5" ry="8.5" :fill="colours.stands" stroke="#fff" stroke-width="1.5" />
                <ellipse cx="12" cy="12" rx="6.5" ry="4.8" :fill="colours.pitch" />
                <rect x="10" y="10.2" width="4" height="3.6" :fill="colours.ring" stroke="#fff" stroke-width="0.8" />
              </svg>
            </template>
            <template #end>
              <button class="go" :aria-label="said.goToArena" @click="emit('arena')"><Icon name="next" :size="18" /></button>
            </template>
          </ListRow>
          <ListRow v-for="p in housesOnMap" :key="p.house.id" class="entry" :title="p.house.name" :lit="pointed === p.house.id">
            <!-- The same little house as on the map, in its colour; dashed for a sample. -->
            <template #lead><HouseBadge :id="p.house.id" :sample="p.house.demo" /></template>
            <HouseStats :house="p.house" :sample="p.house.demo" />
            <template #end>
              <button ref="houseButtons" class="go" :aria-label="said.goToDoor(p.house.name)" @click="emit('go', p.house.id)"><Icon name="next" :size="18" /></button>
            </template>
          </ListRow>
        </ul>
      </div>
      </div>
      </div>
    </section>
  </div>

  <div v-else class="small">
    <div class="holder">
      <canvas
        ref="canvas"
        role="img"
        :aria-label="mapLabel"
        :style="{ width: `${size.w}px`, height: `${size.h}px` }"
        @mousemove="onMove"
        @mouseleave="hover = null"
        @click="onClick"
      />
      <span v-if="goalHalo" class="halo" :class="{ calm: settings.reduceMotion }" :style="goalHalo" aria-hidden="true" />
      <span v-if="hover" class="tip" :style="{ left: `${hover.x}px`, top: `${hover.y}px` }" aria-hidden="true">{{ hover.name }}</span>
      <span class="compass" :title="mw.northName" aria-hidden="true">{{ mw.north }}</span>
    </div>
    <!-- Two counts as icons and numbers: who lives here, who's out walking. Each has its sentence as a hidden name. -->
    <div class="chips">
      <span class="chip" role="img" :aria-label="mw.liveHere(living)">
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M2.5 7.2 8 2.5l5.5 4.7V13.5h-11z M6.3 13.5V10h3.4v3.5" /></svg>
        <span aria-hidden="true">{{ living }}</span>
      </span>
      <span class="chip" role="img" :aria-label="walkingName">
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><circle cx="9" cy="2.8" r="1.4" /><path d="M8.6 5.6 7 9.4l2.6 1.8.9 3.3M7.6 7.4 5 8.6l-.8 2M7 9.4 5.6 14.4M8.6 5.6l2.2 2.6 2.1.6" /></svg>
        <span aria-hidden="true">{{ online }}</span>
      </span>
    </div>
  </div>
</template>

<style scoped>
/* The frame: the sign's off-white board with a red line inside its edge and a hard shadow. Flat: no glass, no blur.
   */
.small {
  display: grid;
  gap: 5px;
  padding: 7px;
  background: var(--board);
  color: var(--text);
  box-shadow: inset 0 0 0 1.5px var(--line), var(--lift);
}
.holder { position: relative; flex: none; }
/* The small map opens the big one; on the big map only a house can be picked. */
/* The map at dusk, like the city it shows. */
canvas { display: block; flex: none; cursor: pointer; filter: brightness(0.74) saturate(0.85); }
.big canvas { cursor: default; }
.big canvas.pointing { cursor: pointer; }
/* The compass: a small round badge on the map's top right corner, an N under a little pointer. */
.compass {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  border-radius: var(--r-pill);
  background: var(--surface);
  color: var(--accent);
  box-shadow: 0 0 0 2px var(--ink);
  font: 800 10px/1 var(--font);
  pointer-events: none;
}
.compass::before {
  content: "";
  position: absolute;
  top: -4px;
  left: 50%;
  transform: translateX(-50%);
  border: 3.5px solid transparent;
  border-top: 0;
  border-bottom: 4px solid var(--neon);
}
.big .compass { top: 8px; right: 8px; width: 24px; height: 24px; font-size: 14px; }
/* The goal's halo: a soft red ring around its house, under the pin, swelling and fading like a sonar ping.
   Still and faint with calm motion. It never takes a click: the canvas below does. */
.halo {
  position: absolute;
  aspect-ratio: 1;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  background: color-mix(in srgb, var(--accent-fill) 30%, transparent);
  box-shadow: 0 0 0 2px var(--accent-fill);
  pointer-events: none;
  animation: ping 1.6s var(--ease) infinite;
}
.halo.calm { animation: none; opacity: 0.6; }
@keyframes ping {
  from { opacity: 0.9; transform: translate(-50%, -50%) scale(0.6); }
  to { opacity: 0; transform: translate(-50%, -50%) scale(1.6); }
}
/* The two counts: an icon and a number each. */
.chips { display: flex; justify-content: center; gap: 14px; }
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text);
  font: 800 14px/1.2 var(--font);
}
.chip svg { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.tip { position: absolute; transform: translate(-50%, calc(-100% - 10px)); padding: 4px 9px; border-radius: var(--r-sm); background: var(--surface); color: var(--text); box-shadow: var(--lift); font-size: 14px; font-weight: 600; white-space: nowrap; pointer-events: none; }
.veil { position: absolute; inset: 0; z-index: 40; display: grid; place-items: center; padding: 16px; background: var(--scrim); }
.big {
  position: relative;
  width: min(880px, 100%);
  max-height: calc(100dvh - 32px);
  display: flex;
  flex-direction: column;
  animation: menu-pop var(--dur-slow) var(--ease-pop);
}
.big .sign-body { overflow-y: auto; overscroll-behavior: contain; }
@keyframes menu-pop {
  from { opacity: 0; transform: translateY(10px) scale(0.96); }
}
.row { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 16px; }
/* The houses: the panels' rows, the list scrolling inside itself when it's longer than the map is tall. */
.houses { list-style: none; margin: 0; padding: 0 8px; flex: 1; min-width: 240px; display: grid; align-content: start; overflow-y: auto; overscroll-behavior: contain; line-height: 1.3; }
.entry { position: relative; cursor: pointer; }
/* The row's one button covers the whole row, so a click anywhere on it travels. */
.houses .go { width: 46px; min-height: 46px; padding: 0; display: grid; place-items: center; border-radius: var(--r-sm); background: none; color: var(--text); }
.houses .go::after { content: ""; position: absolute; inset: 0; border-radius: var(--r-md); }
.entry:hover .go { color: var(--text); }
.houses .go:hover:not(:disabled) { background: none; }
.houses .go:focus-visible { outline: none; color: var(--accent); }
button:focus-visible { outline: 3px solid var(--ring); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  .big, .halo { animation: none; }
  .halo { opacity: 0.6; }
}
</style>
