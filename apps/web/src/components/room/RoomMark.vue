<script setup lang="ts">
// A line's one symbol (style.css's .status-mark): done is a tick, failed a cross, waiting for you a white dot on ink,
// and anything else a small grey dot. Never a coloured row: the symbol is all the colour a line gets. `label` names it
// for a screen reader when the words beside it don't already say it.
defineProps<{ kind: "ok" | "fail" | "todo" | "none"; label?: string }>();
</script>

<template>
  <span class="status-mark" :class="kind" :role="label ? 'img' : undefined" :aria-label="label" :aria-hidden="label ? undefined : 'true'">
    <svg v-if="kind === 'ok'" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
    <svg v-else-if="kind === 'fail'" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" /></svg>
  </span>
</template>

<style scoped>
/* A touch bigger than the base's 20, as the room's lines draw it. */
.status-mark { width: 22px; height: 22px; }
</style>
