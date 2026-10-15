<script setup lang="ts">
// A state as a small coloured dot, and nothing else to see: the words are always in the sentence beside it (see
// words.ts). The dot's hidden name repeats the state for a screen reader that lands on it alone.
import type { State } from "./words";

defineProps<{ state: State }>();
</script>

<template>
  <span class="status-dot" :class="state.tone" role="img" :aria-label="state.word" />
</template>

<style scoped>
/* A dashboard's status dot: the colour, with a faint halo of itself. Something in progress (amber) breathes. */
.status-dot { display: inline-block; flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
.live { background: var(--live); box-shadow: 0 0 0 3px var(--live-soft); }
.warn { background: var(--warn); box-shadow: 0 0 0 3px var(--warn-soft); animation: breathe 1.4s var(--ease) infinite; }
.danger { background: var(--danger); box-shadow: 0 0 0 3px var(--danger-soft); }
.free { background: var(--free); box-shadow: 0 0 0 3px var(--free-soft); }
@keyframes breathe {
  50% { box-shadow: 0 0 0 5px var(--warn-soft); }
}
@media (prefers-reduced-motion: reduce) {
  .warn { animation: none; }
}
</style>
