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
/* A title won in an arena: flat, in its medal's colours. */
.badge-chip {
  --medal: #7a4e00;
  --medal-soft: #ffe9a8;
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 14em;
  height: 22px;
  padding: 0 7px 0 5px;
  border-radius: var(--r-xs);
  background: var(--medal-soft);
  color: var(--medal);
  font-size: 14px;
  font-weight: 800;
  line-height: 1;
  vertical-align: middle;
  white-space: nowrap;
}
.badge-chip.silver { --medal: #3f4956; --medal-soft: #e1e5ea; }
.badge-chip.bronze { --medal: #71401c; --medal-soft: #f3dcc9; }
.t { overflow: hidden; text-overflow: ellipsis; }
.compact { width: 22px; padding: 0; justify-content: center; }
</style>
