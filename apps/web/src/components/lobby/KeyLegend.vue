<script setup lang="ts">
// The keys you reach for most, on one line in the bottom-left corner: E use, ] next, Shift dash, M map, and a
// "? keys" button for the full list. The little × folds it to a "?" button. The keys are drawn as small key caps,
// like a game's button hints in a corner. Nothing shows on a touch screen, where there are no keys.
defineProps<{ open: boolean }>();
const emit = defineEmits<{ toggle: []; keys: [] }>();

const quick: { key: string; does: string }[] = [
  { key: "E", does: "use" },
  { key: "]", does: "next" },
  { key: "Shift", does: "dash" },
  { key: "M", does: "map" },
];
</script>

<template>
  <div v-if="open" class="legend" role="region" aria-label="The keys">
    <span v-for="k in quick" :key="k.key" class="item"><kbd>{{ k.key }}</kbd> {{ k.does }}</span>
    <button class="item keys" aria-label="Every key (?)" @click="emit('keys')"><kbd>?</kbd> keys</button>
    <button class="hide" aria-label="Fold the keys away" @click="emit('toggle')">
      <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
    </button>
  </div>
  <button v-else class="peek" aria-label="Show the keys" @click="emit('toggle')">?</button>
</template>

<style scoped>
/* A game's button hints in a corner, drawn like a dev tool's shortcut bar (Linear's ⌘K): a flat strip on the
   surface, the keys as caps (style.css), the words small and quiet beside them. */
.legend, .peek { color: var(--muted); background: var(--surface); box-shadow: var(--lift); }
.legend { display: flex; align-items: center; gap: 14px; min-height: 40px; padding: 4px 6px 4px 10px; border-radius: var(--r-md); font-size: 13px; font-weight: 500; white-space: nowrap; }
.item { display: inline-flex; align-items: center; gap: 6px; }
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
