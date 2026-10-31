<script setup lang="ts">
// A house's badge in a list: the same little house the minimap draws, in the house's own colour (the colour of its
// flatmates' rings in the city), dashed for an example house. Decorative: the row says the house's name.
import { computed } from "vue";
import { colorFor } from "../../lobby/models";
import { hexOf } from "./minimap";

const props = withDefaults(defineProps<{ id: string; sample?: boolean; size?: number }>(), { size: 22 });
const fill = computed(() => hexOf(colorFor(props.id)));
</script>

<template>
  <span class="house-badge" aria-hidden="true">
    <svg viewBox="0 0 20 20" :width="size" :height="size">
      <path class="swatch" :class="{ sample }" d="M4 17V9.2H2.5L10 2.5l7.5 6.7H16V17z" :style="{ fill }" />
    </svg>
  </span>
</template>

<style scoped>
.house-badge { flex: none; display: grid; place-items: center; width: 40px; height: 40px; }
/* A solid edge, dashed for an example house, as on the map. */
.swatch { stroke: var(--ink); stroke-width: 1.6; stroke-linejoin: round; }
.swatch.sample { stroke: var(--muted); stroke-dasharray: 2.4 2; }
</style>
