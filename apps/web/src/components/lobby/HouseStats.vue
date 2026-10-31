<script setup lang="ts">
// A house at a glance, as three icon chips: who lives there, how many rooms, how many are free (in the blue of a
// free window). Each chip says its sentence to a screen reader; the numbers are in the monospace, calm like a
// dashboard. Used wherever houses are listed, so a house reads as a place even when its name is in a language
// you don't know. An example house adds a quiet "example" tag, with its sentence as a hidden name.
import { computed } from "vue";
import type { CityHouse } from "../../types";
import Icon from "./house/Icon.vue";
import { houseCounts, houseStatsWords as w } from "./houseStats";

// `big`: the house's own card, with the sticker beside it, so the free rooms aren't counted twice.
const props = defineProps<{ house: Pick<CityHouse, "rooms">; sample?: boolean; big?: boolean }>();
const n = computed(() => houseCounts(props.house));
</script>

<template>
  <span class="house-stats" :class="{ large: big }">
    <span class="stat" :class="{ zero: !n.people }" role="img" :aria-label="w.people(n.people)"><Icon name="people" :size="big ? 22 : 16" />{{ n.people }}</span>
    <span class="stat" role="img" :aria-label="w.rooms(n.rooms)"><Icon name="window" :size="big ? 22 : 16" />{{ n.rooms }}</span>
    <span v-if="!big" class="stat free" :class="{ zero: !n.free }" role="img" :aria-label="w.free(n.free)"><Icon name="door" :size="16" />{{ n.free }}</span>
    <span v-if="sample" class="tag" role="img" :aria-label="w.sample">{{ w.sampleTag }}</span>
  </span>
</template>

<style scoped>
.house-stats { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 2px 12px; color: var(--text); }
.stat { display: inline-flex; align-items: center; gap: 4px; font-size: 14px; font-weight: 800; line-height: 1.2; font-variant-numeric: tabular-nums; }
.stat.free:not(.zero) { color: var(--free); }
.stat.zero { opacity: 0.55; }
.tag { padding: 0 6px; border-radius: var(--r-xs); background: var(--fill); font-size: 14px; font-weight: 800; line-height: 20px; }
.large { gap: 2px 18px; }
.large .stat { gap: 6px; font-size: 20px; }
</style>
