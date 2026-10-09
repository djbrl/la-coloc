<script setup lang="ts">
// The keys you reach for most, on one line in the bottom-left corner: E use, Tab next, Shift dash, M map, and a
// "? keys" button for the full list. The little × folds it to a "?" button. Nothing shows on a touch screen,
// where there are no keys.
defineProps<{ open: boolean }>();
const emit = defineEmits<{ toggle: []; keys: [] }>();

const quick: { key: string; does: string }[] = [
  { key: "E", does: "use" },
  { key: "Tab", does: "next" },
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
.legend, .peek { color: rgba(245, 245, 247, 0.8); background: rgba(28, 24, 44, 0.5); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); }
.legend { display: flex; align-items: center; gap: 4px; padding: 6px 6px 6px 12px; border-radius: 980px; font-size: 12px; white-space: nowrap; }
/* A thin dot between the items. */
.item + .item::before { content: "·"; margin: 0 8px 0 4px; opacity: 0.5; }
.keys { min-height: 0; padding: 0; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; }
.keys:hover:not(:disabled) { background: none; color: #fff; }
kbd { font: 600 10px/1 -apple-system, BlinkMacSystemFont, sans-serif; padding: 3px 4px; min-width: 16px; text-align: center; border-radius: 4px; background: rgba(255, 255, 255, 0.14); border: 1px solid rgba(255, 255, 255, 0.18); color: #fff; }
.hide { width: 24px; height: 24px; min-height: 0; margin-left: 4px; padding: 0; border: 0; border-radius: 50%; display: grid; place-items: center; background: none; color: inherit; cursor: pointer; }
.hide:hover:not(:disabled) { background: rgba(255, 255, 255, 0.14); }
.peek { width: 32px; height: 32px; min-height: 0; padding: 0; border: 0; border-radius: 50%; font-size: 14px; font-weight: 600; cursor: pointer; }
.peek:hover:not(:disabled) { background: rgba(28, 24, 44, 0.75); }
button:focus-visible { outline: 3px solid #6eb4ff; outline-offset: 2px; }
/* No keyboard, no keys to list. */
@media (hover: none) {
  .legend, .peek { display: none; }
}
</style>
