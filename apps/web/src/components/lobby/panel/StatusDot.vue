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
.status-dot { display: inline-block; flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
.live { background: var(--live); }
.warn { background: var(--warn); }
.danger { background: var(--danger); }
.free { background: var(--accent-fill); }
</style>
