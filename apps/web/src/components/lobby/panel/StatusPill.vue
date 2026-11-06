<script setup lang="ts">
// A state as a dot and one or two words; the dot carries the tone. See words.ts for the states.
import type { State } from "./words";

defineProps<{ state: State }>();
</script>

<template>
  <span class="status-pill" :class="state.tone"><span class="d" aria-hidden="true" />{{ state.word }}</span>
</template>

<style scoped>
/* A state in words, with its dot before them: no chip behind it. Colour stays on the dot (green fine, yellow on its way,
   red down, blue free), so nothing on the card becomes a coloured block. */
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  color: var(--muted);
  font-size: 13px;
  font-weight: 800;
  white-space: nowrap;
  flex: none;
}
.d { width: 9px; height: 9px; border-radius: 50%; background: var(--muted); }
.live .d { background: var(--live); }
.warn .d { background: var(--sticker); box-shadow: inset 0 0 0 1.5px var(--warn); }
.danger .d { background: var(--danger); }
.free .d { background: var(--free-window); }
</style>
