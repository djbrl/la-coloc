<script setup lang="ts">
// A state as a small pill: a dot and one or two words, coloured by tone. See words.ts for the states.
import type { State } from "./words";

defineProps<{ state: State }>();
</script>

<template>
  <span class="status-pill" :class="state.tone"><span class="d" aria-hidden="true" />{{ state.word }}</span>
</template>

<style scoped>
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 10px;
  border-radius: 12px;
  background: var(--fill);
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  flex: none;
}
.d { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.live { background: var(--live-soft); color: var(--live); }
.warn { background: var(--warn-soft); color: var(--warn); }
.danger { background: var(--danger-soft); color: var(--danger); }
.free { background: var(--accent-soft); color: var(--accent); }
</style>
