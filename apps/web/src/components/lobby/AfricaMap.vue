<script setup lang="ts">
// The travel menu's map: Africa's outline (africa.ts), a dot for each city with houses, its name beside it, and the
// city you're in lit in the accent. Each dot is a real button (a hidden name, out of the Tab order: the list next
// to the map is the way in for keyboards and screen readers, with the same cities and more said about each).
// The dots are HTML laid over the drawing by percentages, so they stay round and thumb-sized at any width.
import { computed } from "vue";
import { CITY_SPOTS, MADAGASCAR, MAINLAND, MAP_SIZE, outlinePath, project } from "./africa";

const props = defineProps<{
  // The cities to show (only those we can place get a dot).
  cities: string[];
  here: string;
  // A city lit from the list (under the pointer or the focus).
  lit?: string | null;
}>();
const emit = defineEmits<{ travel: [city: string]; hover: [city: string | null] }>();

const land = [outlinePath(MAINLAND), outlinePath(MADAGASCAR)];

// Where each name goes, so neighbours (Lomé and Cotonou, a few kilometres apart) don't write over each other.
const SIDE: Record<string, "left" | "right" | "below" | "above"> = { Abidjan: "left", Lomé: "below", Cotonou: "above" };

const dots = computed(() =>
  props.cities
    .filter((c) => CITY_SPOTS[c])
    .map((c) => {
      const { x, y } = project(CITY_SPOTS[c].at);
      return { city: c, x, y, left: (x / MAP_SIZE.w) * 100, top: (y / MAP_SIZE.h) * 100, side: SIDE[c] ?? "right" };
    }),
);
</script>

<template>
  <div class="africa" :style="{ aspectRatio: `${MAP_SIZE.w} / ${MAP_SIZE.h}` }">
    <svg :viewBox="`0 0 ${MAP_SIZE.w} ${MAP_SIZE.h}`" aria-hidden="true" focusable="false">
      <path v-for="(d, i) in land" :key="i" class="land" :d="d" />
      <text
        v-for="d in dots"
        :key="d.city"
        class="name"
        :class="{ here: d.city === here, lit: d.city === lit }"
        :x="d.side === 'left' ? d.x - 30 : d.side === 'right' ? d.x + 30 : d.x"
        :y="d.side === 'below' ? d.y + 44 : d.side === 'above' ? d.y - 26 : d.y + 9"
        :text-anchor="d.side === 'left' ? 'end' : d.side === 'right' ? 'start' : 'middle'"
      >
        {{ d.city }}
      </text>
    </svg>
    <button
      v-for="d in dots"
      :key="d.city"
      type="button"
      class="dot"
      :class="{ here: d.city === here, lit: d.city === lit }"
      :style="{ left: `${d.left}%`, top: `${d.top}%` }"
      :aria-label="d.city === here ? `${d.city}, where you are` : `Travel to ${d.city}`"
      tabindex="-1"
      @click="emit('travel', d.city)"
      @pointerenter="emit('hover', d.city)"
      @pointerleave="emit('hover', null)"
    >
      <span aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.africa { position: relative; width: 100%; }
svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
/* The land: a soft tile on the menu's surface, with a hairline coast. */
.land { fill: var(--tile); stroke: var(--border); stroke-width: 3; stroke-linejoin: round; }
.name { font: 600 26px var(--font); fill: var(--muted); paint-order: stroke; stroke: var(--surface); stroke-width: 6px; stroke-linejoin: round; }
.name.here, .name.lit { fill: var(--text); font-weight: 700; }
/* A thumb-sized button around a small dot; the city you're in in the accent, with a ring. */
.dot { position: absolute; width: 32px; height: 32px; min-height: 0; padding: 0; translate: -50% -50%; display: grid; place-items: center; border: 0; border-radius: 50%; background: none; cursor: pointer; }
.dot span { width: 12px; height: 12px; border-radius: 50%; background: var(--text); box-shadow: 0 0 0 2px var(--surface); transition: transform 0.15s var(--ease); }
.dot.here span { background: var(--accent-fill); box-shadow: 0 0 0 2px var(--surface), 0 0 0 5px var(--accent-soft); }
.dot:hover span, .dot.lit span { transform: scale(1.4); }
.dot:hover:not(:disabled) { background: none; }
@media (prefers-reduced-motion: reduce) {
  .dot span { transition: none; }
}
</style>
