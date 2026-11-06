<script setup lang="ts">
// The travel menu's map (Jib, 6 11: "I do want the Africa map, it was a strong visual; keep it and make it better"),
// in carte blanche: Africa's outline (africa.ts) cut out of white paper and lifted off a dotted sea by the game's flat
// shadow, and on it a pin for each city with houses, its name on a small white flag, like the names over the city. The
// city you're in is the red flag with a pin; a city lit from the list (under the pointer or the focus) turns to ink,
// and a dashed route runs to it from where you are, the trip you'd take.
//
// Each flag is a real button (a hidden name, out of the Tab order: the list next to the map is the way in for
// keyboards and screen readers, with the same cities and more said about each). Flags are HTML laid over the drawing
// by percentages, so they stay crisp and thumb-sized at any width.
import { computed } from "vue";
import { CITY_SPOTS, MADAGASCAR, MAINLAND, MAP_SIZE, outlinePath, project } from "./africa";
import { hudWords as w } from "./words";

const props = defineProps<{
  // The cities to show (only those we can place get a flag).
  cities: string[];
  here: string;
  // A city lit from the list (under the pointer or the focus).
  lit?: string | null;
}>();
const emit = defineEmits<{ travel: [city: string]; hover: [city: string | null] }>();

const land = [outlinePath(MAINLAND), outlinePath(MADAGASCAR)];
// The paper's lift, in map units: the shadow sits this far under the land.
const LIFT = 12;

// Which side of its pin a name goes, so neighbours (Abidjan, Lomé and Cotonou, a few hundred kilometres apart) don't
// write over each other.
const SIDE: Record<string, "left" | "right" | "below" | "above"> = { Abidjan: "left", Lomé: "below", Cotonou: "above", Dakar: "above" };

const pins = computed(() =>
  props.cities
    .filter((c) => CITY_SPOTS[c])
    .map((c) => {
      const { x, y } = project(CITY_SPOTS[c].at);
      return { city: c, x, y, left: (x / MAP_SIZE.w) * 100, top: (y / MAP_SIZE.h) * 100, side: SIDE[c] ?? "right" };
    }),
);

// The trip: a gentle arc from where you are to the lit city, bowed to one side like a flight on a map.
const route = computed(() => {
  if (!props.lit || props.lit === props.here) return null;
  const from = pins.value.find((p) => p.city === props.here);
  const to = pins.value.find((p) => p.city === props.lit);
  if (!from || !to) return null;
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const bow = 0.22;
  return `M${from.x} ${from.y} Q${mx - dy * bow} ${my + dx * bow} ${to.x} ${to.y}`;
});
</script>

<template>
  <div class="africa">
    <div class="paper" :style="{ aspectRatio: `${MAP_SIZE.w} / ${MAP_SIZE.h}` }">
    <svg :viewBox="`0 0 ${MAP_SIZE.w} ${MAP_SIZE.h}`" aria-hidden="true" focusable="false">
      <!-- The paper's shadow, then the paper. -->
      <path v-for="(d, i) in land" :key="`s${i}`" class="lift" :d="d" :transform="`translate(0 ${LIFT})`" />
      <path v-for="(d, i) in land" :key="i" class="land" :d="d" />
      <path v-if="route" :key="route" class="route" :d="route" />
    </svg>
    <button
      v-for="p in pins"
      :key="p.city"
      type="button"
      class="pin"
      :class="[p.side, { here: p.city === here, lit: p.city === lit }]"
      :style="{ left: `${p.left}%`, top: `${p.top}%` }"
      :aria-label="p.city === here ? w.whereYouAre(p.city) : w.travelTo(p.city)"
      tabindex="-1"
      @click="emit('travel', p.city)"
      @pointerenter="emit('hover', p.city)"
      @pointerleave="emit('hover', null)"
    >
      <span class="dot" aria-hidden="true" />
      <span class="flag" aria-hidden="true">
        <svg v-if="p.city === here" viewBox="0 0 24 24" width="13" height="13"><path d="M12 21s-6-5.6-6-10.5a6 6 0 0 1 12 0C18 15.4 12 21 12 21z" fill="currentColor" /><circle cx="12" cy="10.5" r="2.2" fill="var(--accent)" /></svg>
        {{ p.city }}
      </span>
    </button>
    </div>
  </div>
</template>

<style scoped>
/* The sea: a soft tile with a faint grid of dots, like a game's map paper. */
.africa {
  position: relative;
  width: 100%;
  padding: 18px 30px 26px;
  border-radius: var(--tile-r);
  background:
    radial-gradient(circle, rgba(23, 21, 26, 0.1) 1.2px, transparent 1.6px) 0 0 / 14px 14px,
    var(--sunken);
}
/* As wide as the tile allows, but never taller than the screen leaves room for (Africa is about as tall as wide). */
.paper { position: relative; width: min(100%, calc((100dvh - 280px) * 0.97)); margin: 0 auto; }
.paper > svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
/* The land: white paper, a faint edge, the game's flat shadow under it. */
.lift { fill: rgba(20, 12, 18, 0.16); }
.land { fill: var(--surface); stroke: var(--line); stroke-width: 2; stroke-linejoin: round; }
/* The trip: red dashes that run towards the city you'd go to. */
.route { fill: none; stroke: var(--accent); stroke-width: 5; stroke-linecap: round; stroke-dasharray: 2 16; animation: run 0.9s linear infinite; }
@keyframes run {
  to { stroke-dashoffset: -18; }
}
/* A pin: the press area is its dot and its flag together. Placed by its dot's centre, on the drawing's own box. */
.pin {
  position: absolute;
  width: 0;
  height: 0;
  min-height: 0;
  padding: 0;
  border: 0;
  background: none;
  box-shadow: none;
  cursor: pointer;
}
.dot { position: absolute; left: -6px; top: -6px; width: 12px; height: 12px; border-radius: 50%; background: var(--text); box-shadow: 0 0 0 2.5px var(--surface); transition: transform var(--dur-fast) var(--ease); }
.flag {
  position: absolute;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 2px 0 rgba(20, 12, 18, 0.28);
  font: 800 13px/1.15 var(--font);
  white-space: nowrap;
  transition: background-color var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease);
}
.right .flag { left: 12px; top: 0; translate: 0 -50%; }
.left .flag { right: 12px; top: 0; translate: 0 -50%; }
.below .flag { left: 0; top: 12px; translate: -50% 0; }
.above .flag { left: 0; bottom: 12px; translate: -50% 0; }
/* Where you are: the red flag with its pin, a soft ring round the dot. */
.here .dot { background: var(--accent); box-shadow: 0 0 0 2.5px var(--surface), 0 0 0 7px rgba(179, 32, 44, 0.22); }
.flag svg { flex: none; }
.here .flag { background: var(--accent); color: var(--on-accent); box-shadow: 0 2px 0 var(--accent-lip); }
/* Lit from the list, or under the pointer: ink, a little bigger. */
.pin:hover .flag, .lit .flag { background: var(--text); color: var(--surface); box-shadow: 0 2px 0 #000000; }
.pin:hover .dot, .lit .dot { transform: scale(1.35); }
.here:hover .flag, .here.lit .flag { background: var(--accent-fill-hover); }
.pin:hover:not(:disabled) { background: none; }
@media (prefers-reduced-motion: reduce) {
  .route { animation: none; }
  .dot, .flag { transition: none; }
}
</style>
