<script setup lang="ts">
// Placeholder drawing of a house, one window per room. Jib's illustrated houses replace it; keep the
// same props (rooms and status) so the city page doesn't change.
import { computed } from "vue";
import type { CityHouse } from "../types";

const props = defineProps<{ house: Pick<CityHouse, "rooms" | "status"> }>();

const cols = computed(() => (props.house.rooms.length > 4 ? 3 : 2));
const windows = computed(() =>
  props.house.rooms.map((r, i) => ({
    x: 16 + (i % cols.value) * (cols.value === 3 ? 28 : 40),
    y: 52 + Math.floor(i / cols.value) * 26,
    state: !r.occupant ? "free" : props.house.status === "making" ? "signed" : r.status === "down" || r.status === "failed" ? "down" : "lit",
  })),
);
const height = computed(() => 52 + Math.ceil(props.house.rooms.length / cols.value) * 26 + 6);
</script>

<template>
  <svg :viewBox="`0 0 112 ${height}`" class="house" role="img" :aria-label="`${house.rooms.length} rooms`">
    <polygon points="4,40 56,6 108,40" class="roof" />
    <rect x="10" y="38" width="92" :height="height - 38" rx="3" class="wall" :class="{ making: house.status === 'making' }" />
    <rect v-for="(w, i) in windows" :key="i" :x="w.x" :y="w.y" :width="cols === 3 ? 22 : 30" height="18" rx="3" class="win" :class="w.state" />
  </svg>
</template>

<style scoped>
.house { width: 100%; max-width: 140px; display: block; margin: 0 auto; }
.roof { fill: var(--roof); }
.wall { fill: var(--wall-drawn); }
.wall.making { fill: none; stroke: var(--warn); stroke-width: 2; stroke-dasharray: 5 4; }
.win.lit { fill: var(--live); }
.win.down { fill: var(--danger); }
.win.free { fill: none; stroke: var(--accent); stroke-width: 2; stroke-dasharray: 4 3; }
.win.signed { fill: var(--warn-soft); stroke: var(--warn); stroke-width: 1.5; }
</style>
