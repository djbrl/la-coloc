<script setup lang="ts">
// The four arrows as they sit on a keyboard, an upside-down T: up on top, then left, down and right under it. Drawn
// that way, they read as "these move you" before any word does. A cap turns to ink once its way has been walked
// (`lit`), proof the keys are yours. The coach's walk (Coach.vue) and the city's walking card (TourCard.vue) show it.
import { ARROWS } from "../../../lobby/keys";

defineProps<{ lit: readonly string[] }>();
</script>

<template>
  <span class="arrows" aria-hidden="true">
    <kbd v-for="(cap, way) in ARROWS" :key="way" :class="[way, { on: lit.includes(cap) }]">{{ cap }}</kbd>
  </span>
</template>

<style scoped>
.arrows { display: grid; grid-template-columns: repeat(3, 32px); grid-template-rows: repeat(2, 32px); gap: 4px; }
.up { grid-area: 1 / 2; }
.left { grid-area: 2 / 1; }
.down { grid-area: 2 / 2; }
.right { grid-area: 2 / 3; }
kbd { min-width: 32px; height: 32px; padding: 0 0 3px; border-radius: 8px; background: var(--surface); color: var(--text); box-shadow: inset 0 -3px 0 var(--quiet-lip); font-size: 15px; transition: background-color var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease); }
kbd.on { background: var(--text); color: var(--surface); box-shadow: inset 0 -3px 0 #000000; }
@media (prefers-reduced-motion: reduce) {
  kbd { transition: none; }
}
</style>
