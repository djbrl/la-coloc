<script setup lang="ts">
// The title someone won in an arena, next to their name: a trophy and the title, gold, silver or bronze by place.
// Its full story (which place, which city, which week) is its hover title and its hidden name. `compact`: the trophy
// alone, for a tight spot (a face in a house's crew); the title is then only in the hover and the hidden name.
import { computed } from "vue";
import type { Badge } from "../../types";
import Icon from "../lobby/house/Icon.vue";
import { badgeWords } from "./arena";

const props = defineProps<{ badge: Badge; compact?: boolean }>();
const said = computed(() => badgeWords(props.badge));
</script>

<template>
  <span class="badge-chip" :class="[said.medal, { compact }]" role="img" :aria-label="said.name" :title="said.name">
    <Icon name="trophy" :size="compact ? 11 : 12" />
    <span v-if="!compact" class="t" aria-hidden="true">{{ said.text }}</span>
  </span>
</template>

<style scoped>
.badge-chip {
  --medal: #b7791f;
  --medal-soft: #fdf3dc;
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 14em;
  height: 20px;
  padding: 0 7px 0 5px;
  border-radius: var(--r-pill);
  background: var(--medal-soft);
  color: var(--medal);
  font-size: 11.5px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0;
  vertical-align: middle;
  white-space: nowrap;
}
.badge-chip.silver { --medal: #5f6b7a; --medal-soft: #eceff3; }
.badge-chip.bronze { --medal: #9a5b2e; --medal-soft: #f7e8dc; }
.t { overflow: hidden; text-overflow: ellipsis; }
.compact { width: 20px; padding: 0; justify-content: center; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .badge-chip { --medal: #f2c14e; --medal-soft: #3d3218; }
  :root:not([data-theme="light"]) .badge-chip.silver { --medal: #c9d1db; --medal-soft: #2c3138; }
  :root:not([data-theme="light"]) .badge-chip.bronze { --medal: #e3a275; --medal-soft: #3b2a1e; }
}
:root[data-theme="dark"] .badge-chip { --medal: #f2c14e; --medal-soft: #3d3218; }
:root[data-theme="dark"] .badge-chip.silver { --medal: #c9d1db; --medal-soft: #2c3138; }
:root[data-theme="dark"] .badge-chip.bronze { --medal: #e3a275; --medal-soft: #3b2a1e; }
</style>
