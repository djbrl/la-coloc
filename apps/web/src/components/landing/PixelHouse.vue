<script setup lang="ts">
// A house in twelve-by-twelve pixels: a red roof, a brick wall, four windows. A lit window is a room taken; `free` paints
// one window blue, the room that's still for rent.
const props = defineProps<{ lit: number; free?: boolean; size?: number; name?: string }>();

// The windows in the order they light up: bottom left, top left, top right, bottom right.
const WINDOWS = [
  { x: 3, y: 8 },
  { x: 3, y: 5 },
  { x: 7, y: 5 },
  { x: 7, y: 8 },
];
function fill(i: number) {
  if (i < props.lit) return props.lit === 4 ? "#fff6d6" : "#fbd45c";
  if (props.free && i === props.lit) return "#7f9cf0";
  return "#2a2138";
}
</script>

<template>
  <svg viewBox="0 0 12 12" :width="size ?? 144" :height="size ?? 144" shape-rendering="crispEdges" :role="name ? 'img' : undefined" :aria-label="name" :aria-hidden="name ? undefined : 'true'">
    <path d="M5 0h2v1H5zM4 1h4v1H4zM3 2h6v1H3zM2 3h8v1H2z" fill="#b3202c" />
    <rect x="8" y="0" width="1" height="2" fill="#5a2a2e" />
    <rect x="2" y="4" width="8" height="8" fill="#b3584a" />
    <rect v-for="(w, i) in WINDOWS" :key="i" :x="w.x" :y="w.y" width="2" height="2" :fill="fill(i)" />
  </svg>
</template>
