<script setup lang="ts">
// The chores board on the market square: which houses in this city have code reviews waiting, and how many are
// late. A review is a chore: a flatmate reviews a housemate's pull request, and it takes a little off their rent.
// Only the counts are public (the pull requests' titles are for the flatmates); each house is one row that takes
// you to it.
import { computed } from "vue";
import type { CityHouse } from "../../types";
import Icon from "./house/Icon.vue";
import LobbyCard from "./LobbyCard.vue";
import { cardWords as w } from "./words";

const props = defineProps<{ city: string; houses: CityHouse[] }>();
const emit = defineEmits<{ open: [houseId: string]; close: [] }>();

// The houses with reviews waiting, the busiest first.
const waiting = computed(() =>
  props.houses
    .filter((h) => (h.openChores ?? 0) > 0)
    .sort((a, b) => (b.openChores ?? 0) - (a.openChores ?? 0) || a.name.localeCompare(b.name)),
);

/** "2 reviews waiting, 1 late." */
function line(h: CityHouse): string {
  const late = h.lateChores ?? 0;
  return w.boardLine(h.openChores ?? 0, late);
}
</script>

<template>
  <LobbyCard :label="w.boardLabel(city)">
    <h2>{{ w.board }}</h2>
    <button class="x" :aria-label="w.close" @click="emit('close')">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" /></svg>
    </button>
    <p v-if="waiting.length" class="soft">{{ w.boardWaiting(city) }}</p>
    <p v-else class="soft">{{ w.boardNone(city) }}</p>

    <ul v-if="waiting.length" class="pins">
      <li v-for="h in waiting" :key="h.id">
        <button class="big pin" @click="emit('open', h.id)">
          <span class="text">
            <strong>{{ h.name }}</strong><span class="soft">: {{ line(h) }}</span>
          </span>
          <span v-if="(h.lateChores ?? 0) > 0" class="late" aria-hidden="true" />
          <Icon name="next" :size="18" />
        </button>
      </li>
    </ul>
  </LobbyCard>
</template>

<style scoped>
.pins { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
/* Each house: one wide row, its name and counts in one sentence, a red pin when something's late. */
.pin.big { width: 100%; justify-content: flex-start; gap: 10px; min-height: 52px; padding: 8px 12px 8px 14px; text-align: left; font-size: 15px; font-weight: 400; background: var(--tile); }
.pin .text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.pin strong { font-weight: 600; }
.pin svg { color: var(--muted); }
.late { flex: none; width: 10px; height: 10px; border-radius: 50%; background: var(--danger); }
</style>
