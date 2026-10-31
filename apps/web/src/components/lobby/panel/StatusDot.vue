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
/* One flat dot: green when fine, yellow in progress (it breathes), red when down, blue when free. */
.status-dot { display: inline-block; flex: none; width: 14px; height: 14px; border-radius: 50%; background: var(--muted); }
.live { background: var(--live); }
.warn { background: var(--sticker); animation: breathe 1.4s var(--ease) infinite; }
.danger { background: var(--danger); }
.free { background: var(--free-window); }
@keyframes breathe {
  50% { opacity: 0.55; }
}
@media (prefers-reduced-motion: reduce) {
  .warn { animation: none; }
}
</style>
