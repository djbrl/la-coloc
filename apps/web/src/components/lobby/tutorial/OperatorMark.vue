<script setup lang="ts">
// A mobile money provider's mark, small, beside its name: a rounded square in its brand's colour with a simple glyph,
// drawn here (no logo files: nothing downloaded). Decorative, since the name sits next to it. A provider it doesn't
// know gets a grey square with its initial.
import { computed } from "vue";
import { operatorMark } from "./operators";

const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 18 });
const mark = computed(() => operatorMark(props.name));
</script>

<template>
  <svg class="mark" viewBox="0 0 20 20" :width="size" :height="size" aria-hidden="true" focusable="false">
    <rect width="20" height="20" rx="5" :fill="mark.bg" />
    <path v-if="mark.path" :d="mark.path" fill="none" :stroke="mark.fg" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
    <text v-else x="10" y="14.4" text-anchor="middle" :fill="mark.fg">{{ mark.letter }}</text>
  </svg>
</template>

<style scoped>
.mark { flex: none; display: block; }
.mark text { font: 800 12px/1 var(--display); }
</style>
