<script setup lang="ts">
// A house at a glance, as three icon-and-number pairs: who lives there, how many rooms, how many are free. Each says
// its sentence to a screen reader; the icons are muted and the numbers ink, a zero muted too (numbers rather than
// sentences, carte blanche). Used wherever houses are listed, so a house reads as a place even when its name is in a language
// you don't know. An example house adds a quiet "example" word, with its sentence as a hidden name.
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
    <span class="stat" :class="{ zero: !n.people }" role="img" :aria-label="w.people(n.people)"><Icon name="people" :size="big ? 22 : 15" />{{ n.people }}</span>
    <span class="stat" role="img" :aria-label="w.rooms(n.rooms)"><Icon name="window" :size="big ? 22 : 15" />{{ n.rooms }}</span>
    <span v-if="!big" class="stat free" :class="{ zero: !n.free }" role="img" :aria-label="w.free(n.free)"><Icon name="door" :size="15" />{{ n.free }}</span>
    <span v-if="sample" class="tag" role="img" :aria-label="w.sample">{{ w.sampleTag }}</span>
  </span>
</template>

<style scoped>
.house-stats { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 2px 12px; color: var(--text); }
.stat { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 800; line-height: 18px; font-variant-numeric: tabular-nums; }
.stat svg { color: var(--muted); }
.stat.zero { color: var(--muted); }
/* An example house: a quiet word, no tag around it. */
.tag { font-size: 12px; font-weight: 600; line-height: 18px; color: var(--muted); }
.large { gap: 2px 18px; }
.large .stat { gap: 6px; font-size: 20px; line-height: 26px; }
</style>
