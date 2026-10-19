<script setup lang="ts">
// The keys you reach for most, on one line in the bottom-left corner: E use, ] next, Shift dash, M map, and a "?"
// button for the full list. Each key cap has a small icon beside it rather than a word (a hand, a chevron, a bolt, a
// map); the word stays as its hidden name, and in the hover title. The little × folds it to a "?" button. Like a
// game's button hints in a corner. Nothing shows on a touch screen, where there are no keys.
import { computed } from "vue";
import { caps } from "../../lobby/keys";
import Icon from "./house/Icon.vue";
import type { IconName } from "./house/icons";
import { hudWords as w } from "./words";

defineProps<{ open: boolean }>();
const emit = defineEmits<{ toggle: []; keys: [] }>();

// Computed, so the words (and the name French gives Shift) follow the language chosen now (words.ts).
const quick = computed((): { key: string; does: string; icon: IconName }[] => [
  { key: caps.e, does: w.use, icon: "hand" },
  { key: "]", does: w.next, icon: "next" },
  { key: w.shiftKey, does: w.dash, icon: "bolt" },
  { key: "M", does: w.map, icon: "map" },
]);
</script>

<template>
  <div v-if="open" class="legend" role="region" :aria-label="w.theKeys">
    <span v-for="k in quick" :key="k.key" class="item" :title="k.does"><kbd>{{ k.key }}</kbd><Icon :name="k.icon" :size="15" /><span class="sr-only">{{ k.does }}</span></span>
    <button class="item keys" :aria-label="w.everyKey" :title="w.everyKey" @click="emit('keys')"><kbd>?</kbd><Icon name="keyboard" :size="15" /></button>
    <button class="hide" :aria-label="w.foldKeys" @click="emit('toggle')">
      <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
    </button>
  </div>
  <button v-else class="peek" :aria-label="w.showKeys" @click="emit('toggle')">?</button>
</template>

<style scoped>
/* A game's button hints in a corner, drawn like a dev tool's shortcut bar (Linear's ⌘K): a flat strip on the
   surface, the keys as caps (style.css), the words small and quiet beside them. */
.legend, .peek { color: var(--muted); background: var(--surface); box-shadow: var(--lift); }
.legend { display: flex; align-items: center; gap: 14px; min-height: 40px; padding: 4px 6px 4px 10px; border-radius: var(--r-md); font-size: 13px; font-weight: 500; white-space: nowrap; }
.item { display: inline-flex; align-items: center; gap: 5px; }
.keys { min-height: 28px; padding: 0 10px 0 4px; margin-left: -4px; border: 0; border-radius: var(--r-sm); background: var(--fill); color: var(--text); font: inherit; font-weight: 600; cursor: pointer; }
.keys:hover:not(:disabled) { background: var(--fill-hover); color: var(--text); }
.hide { width: 28px; height: 28px; min-height: 0; margin-left: -6px; padding: 0; border: 0; border-radius: var(--r-sm); display: grid; place-items: center; background: none; color: inherit; cursor: pointer; }
.hide:hover:not(:disabled) { background: var(--fill); color: var(--text); }
.peek { width: 40px; height: 40px; min-height: 0; padding: 0; border: 0; border-radius: var(--r-md); font: 500 16px/1 var(--mono); color: var(--text); cursor: pointer; }
.peek:hover:not(:disabled) { background: var(--fill); }
button:focus-visible { outline: 3px solid var(--accent-fill); outline-offset: 2px; }
/* No keyboard, no keys to list. */
@media (hover: none) {
  .legend, .peek { display: none; }
}
</style>
