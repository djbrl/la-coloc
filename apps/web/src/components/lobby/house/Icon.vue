<script setup lang="ts">
// One icon from icons.ts, drawn in the current text colour. Decorative: the word next to it carries the meaning,
// and any button using it alone names itself with aria-label.
import { type IconName, icons } from "./icons";

withDefaults(defineProps<{ name: IconName; size?: number }>(), { size: 24 });
</script>

<template>
  <svg
    :viewBox="'0 0 24 24'"
    :width="size"
    :height="size"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path :d="icons[name]" />
  </svg>
</template>

<style scoped>
svg { flex: none; display: block; }
</style>
