<script setup lang="ts">
// The keys you reach for most, on one line in the bottom-left corner: E use, ] next, Shift dash, M map, and a
// "? keys" button for the full list. The little × folds it to a "?" button. The keys are drawn as small key caps,
// like a game's button hints in a corner. Nothing shows on a touch screen, where there are no keys.
import { computed } from "vue";
import { hudWords as w } from "./words";

defineProps<{ open: boolean }>();
const emit = defineEmits<{ toggle: []; keys: [] }>();

// Computed, so the words (and the name French gives Shift) follow the language chosen now (words.ts).
const quick = computed((): { key: string; does: string }[] => [
  { key: "E", does: w.use },
  { key: "]", does: w.next },
  { key: w.shiftKey, does: w.dash },
  { key: "M", does: w.map },
]);
</script>

<template>
  <div v-if="open" class="legend" role="region" :aria-label="w.theKeys">
    <span v-for="k in quick" :key="k.key" class="item"><kbd>{{ k.key }}</kbd> {{ k.does }}</span>
    <button class="item keys" :aria-label="w.everyKey" @click="emit('keys')"><kbd>?</kbd> {{ w.keys }}</button>
    <button class="hide" :aria-label="w.foldKeys" @click="emit('toggle')">
      <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
    </button>
  </div>
  <button v-else class="peek" :aria-label="w.showKeys" @click="emit('toggle')">?</button>
</template>

<style scoped>
/* A flat pill on the site's surface, lifted like the rest of the HUD; the words quiet, the keys as small raised caps. */
.legend, .peek { color: var(--muted); background: var(--surface); box-shadow: var(--lift); }
.legend { display: flex; align-items: center; gap: 14px; min-height: 40px; padding: 4px 6px 4px 10px; border-radius: 980px; font-size: 13px; font-weight: 500; white-space: nowrap; }
.item { display: inline-flex; align-items: center; gap: 6px; }
.keys { min-height: 28px; padding: 0 10px 0 4px; margin-left: -4px; border: 0; border-radius: 980px; background: var(--fill); color: var(--text); font: inherit; font-weight: 600; cursor: pointer; }
.keys:hover:not(:disabled) { background: var(--fill-hover); color: var(--text); }
kbd { display: inline-grid; place-items: center; min-width: 22px; height: 22px; padding: 0 5px; border-radius: 6px; border: 1px solid var(--border); border-bottom-width: 2px; background: var(--surface); color: var(--text); font: 700 11px/1 var(--font); }
.hide { width: 28px; height: 28px; min-height: 0; margin-left: -6px; padding: 0; border: 0; border-radius: 50%; display: grid; place-items: center; background: none; color: inherit; cursor: pointer; }
.hide:hover:not(:disabled) { background: var(--fill); color: var(--text); }
.peek { width: 40px; height: 40px; min-height: 0; padding: 0; border: 0; border-radius: 50%; font-size: 16px; font-weight: 700; color: var(--text); cursor: pointer; }
.peek:hover:not(:disabled) { background: var(--fill); }
button:focus-visible { outline: 3px solid var(--accent-fill); outline-offset: 2px; }
/* No keyboard, no keys to list. */
@media (hover: none) {
  .legend, .peek { display: none; }
}
</style>
