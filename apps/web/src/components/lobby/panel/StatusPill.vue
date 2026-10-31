<script setup lang="ts">
// A state as a small pill: a dot and one or two words, coloured by tone. See words.ts for the states.
import type { State } from "./words";

defineProps<{ state: State }>();
</script>

<template>
  <span class="status-pill" :class="state.tone"><span class="d" aria-hidden="true" />{{ state.word }}</span>
</template>

<style scoped>
/* Fine is a green dot and its word; only what needs attention earns the yellow chip. */
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 8px;
  border-radius: var(--r-xs);
  background: var(--fill);
  color: var(--text);
  font-size: 14px;
  font-weight: 800;
  white-space: nowrap;
  flex: none;
}
.d { width: 10px; height: 10px; border-radius: 50%; background: currentColor; }
.live { padding: 0; background: none; color: var(--live); }
.warn, .free { background: var(--sticker); color: var(--ink); }
.warn .d, .free .d { background: var(--ink); }
.danger { background: var(--sticker); color: var(--ink); }
.danger .d { background: var(--panel-red); }
</style>
