<script setup lang="ts">
// The keys you reach for most, on one line along the bottom: W A S D, then E use, ] next, Shift dash, M map, and a "?"
// button for the full list. Each key cap has a small icon beside it rather than a word (a hand, a chevron, a bolt, a
// map); the word stays as its hidden name, and in the hover title. The little X folds it to a "?" button. Like a
// game's button hints. Nothing shows on a touch screen, where there are no keys.
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
    <!-- Walking, then what's in reach (the yellow key), then the rest. -->
    <span class="walk" aria-hidden="true"><kbd v-for="k in [caps.w, caps.a, caps.s, caps.d]" :key="k">{{ k }}</kbd></span>
    <span v-for="k in quick" :key="k.key" class="item" :class="{ use: k.key === caps.e }" :title="k.does"><kbd>{{ k.key }}</kbd><Icon :name="k.icon" :size="22" /><span class="sr-only">{{ k.does }}</span></span>
    <button class="item keys" :aria-label="w.everyKey" :title="w.everyKey" @click="emit('keys')"><kbd>?</kbd><Icon name="keyboard" :size="22" /></button>
    <button class="hide" :aria-label="w.foldKeys" @click="emit('toggle')"><span aria-hidden="true">X</span></button>
  </div>
  <button v-else class="peek" :aria-label="w.showKeys" @click="emit('toggle')">?</button>
</template>

<style scoped>
/* A game's button hints along the bottom: white key caps, 48px, with a lip; the key for what's in reach in yellow. */
.legend { display: flex; align-items: center; gap: 8px; font-size: 17px; font-weight: 800; white-space: nowrap; }
.walk { display: flex; gap: 5px; margin-right: 8px; }
kbd { min-width: 46px; height: 46px; padding: 0 8px; border-radius: var(--r-md); background: var(--surface); color: var(--ink); box-shadow: var(--lift); font: 800 19px/1 var(--font); }
.item { display: inline-flex; align-items: center; height: 46px; padding: 0 12px 0 0; border-radius: var(--r-md); background: var(--surface); color: var(--ink); box-shadow: var(--lift); font: 800 16px/1 var(--font); }
.item kbd { background: none; box-shadow: none; }
.use kbd { border-radius: var(--r-md) 0 0 var(--r-md); background: var(--sticker); margin-right: 8px; }
.keys { min-height: 46px; cursor: pointer; }
.keys:hover:not(:disabled) { background: var(--tile); }
.hide, .peek { display: grid; place-items: center; width: 46px; height: 46px; min-height: 0; padding: 0; border-radius: var(--r-md); background: var(--surface); color: var(--ink); box-shadow: var(--lift); font: 400 18px/1 var(--display); cursor: pointer; }
.hide { width: 36px; }
.hide:hover:not(:disabled), .peek:hover:not(:disabled) { background: var(--tile); }
/* Not enough width for everything: the walking keys go first, then the icons. */
@media (max-width: 1320px) {
  .walk { display: none; }
}
@media (max-width: 1040px) {
  .item svg { display: none; }
  .item { padding: 0; }
  .use kbd { border-radius: var(--r-md); margin-right: 0; }
}
/* No keyboard, no keys to list. */
@media (hover: none) {
  .legend, .peek { display: none; }
}
</style>
