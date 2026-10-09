<script setup lang="ts">
// The keys, listed in the bottom-left corner. "?" or the little button folds it away; nothing shows on a
// touch screen, where there are no keys.
defineProps<{ open: boolean }>();
const emit = defineEmits<{ toggle: [] }>();

const rows: { keys: string[]; does: string }[] = [
  { keys: ["W", "A", "S", "D"], does: "walk" },
  { keys: ["Tab"], does: "next thing" },
  { keys: ["E"], does: "use, open" },
  { keys: ["Q", "R"], does: "turn" },
  { keys: ["1", "2"], does: "react" },
  { keys: ["F"], does: "find a house" },
  { keys: ["T"], does: "travel" },
  { keys: ["Esc"], does: "close" },
  { keys: ["?"], does: "this list" },
];
</script>

<template>
  <div v-if="open" class="legend" role="region" aria-label="The keys">
    <button class="hide" aria-label="Hide the keys (?)" @click="emit('toggle')">
      <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
    </button>
    <ul>
      <li v-for="r in rows" :key="r.does">
        <span class="keys"><kbd v-for="k in r.keys" :key="k">{{ k }}</kbd></span>
        <span class="does">{{ r.does }}</span>
      </li>
    </ul>
  </div>
  <button v-else class="peek" aria-label="Show the keys (?)" @click="emit('toggle')">?</button>
</template>

<style scoped>
.legend, .peek { color: rgba(245, 245, 247, 0.8); background: rgba(28, 24, 44, 0.5); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); }
.legend { position: relative; padding: 10px 36px 10px 12px; border-radius: 14px; font-size: 12px; }
ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 3px; }
li { display: flex; align-items: center; gap: 8px; }
.keys { display: inline-flex; gap: 3px; min-width: 62px; }
.does { white-space: nowrap; }
kbd { font: 600 10px/1 -apple-system, BlinkMacSystemFont, sans-serif; padding: 3px 4px; min-width: 16px; text-align: center; border-radius: 4px; background: rgba(255, 255, 255, 0.14); border: 1px solid rgba(255, 255, 255, 0.18); color: #fff; }
.hide { position: absolute; top: 6px; right: 6px; width: 24px; height: 24px; min-height: 0; padding: 0; border: 0; border-radius: 50%; display: grid; place-items: center; background: none; color: inherit; cursor: pointer; }
.hide:hover:not(:disabled) { background: rgba(255, 255, 255, 0.14); }
.peek { width: 32px; height: 32px; min-height: 0; padding: 0; border: 0; border-radius: 50%; font-size: 14px; font-weight: 600; cursor: pointer; }
.peek:hover:not(:disabled) { background: rgba(28, 24, 44, 0.75); }
button:focus-visible { outline: 3px solid #6eb4ff; outline-offset: 2px; }
/* No keyboard, no keys to list. */
@media (hover: none) {
  .legend, .peek { display: none; }
}
</style>
