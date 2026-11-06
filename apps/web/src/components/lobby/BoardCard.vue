<script setup lang="ts">
// The chores board on the market square: which houses in this city have code reviews waiting, and how many are
// late. A review is a chore: a flatmate reviews a housemate's pull request, and it takes a little off their rent.
// Only the counts are public (the pull requests' titles are for the flatmates); each house is one row that takes
// you to it. Under them, the city's own board (the chat sheet's Board tab): posts about houses, flatmates, projects,
// with a dot when there's one you haven't seen (cityNews.ts).
import { computed } from "vue";
import { cityNews } from "../../cityNews";
import type { CityHouse } from "../../types";
import Icon from "./house/Icon.vue";
import LobbyCard from "./LobbyCard.vue";
import { cardWords as w } from "./words";

const props = defineProps<{ city: string; houses: CityHouse[] }>();
const emit = defineEmits<{ open: [houseId: string]; cityBoard: []; close: [] }>();
const newPost = computed(() => cityNews.city === props.city && cityNews.board > 0);

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
  <LobbyCard class="board" :label="w.boardLabel(city)" :title="w.board" :close-name="w.close" @close="emit('close')">
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
    <button class="big city" :aria-label="w.cityBoardName(city)" @click="emit('cityBoard')">
      <Icon name="board" :size="20" /> {{ w.cityBoard }}<span v-if="newPost" class="new" aria-hidden="true" />
    </button>
  </LobbyCard>
</template>

<style scoped>
/* "Le tableau des revues" is longer than a small band: two lines, the band keeps its height. */
.board :deep(.sign-band > h2) { white-space: normal; }
.pins { list-style: none; margin: 0; padding: 0; display: grid; }
/* Each house: one wide row, its name and counts in one sentence, a red pin when something's late. */
.pin.big { width: 100%; justify-content: flex-start; gap: 10px; min-height: 50px; padding: 6px 0; border-radius: 0; background: none; box-shadow: none; text-align: left; font: 600 16px/1.2 var(--font); }
.pin .text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.pin strong { font-weight: 800; }
.pin svg { color: var(--muted); }
.city.big { width: 100%; }
/* A post you haven't seen on the city's board: the bell's "new" dot. */
.new { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--sticker); box-shadow: 0 0 0 1px var(--ink); }
.late { flex: none; width: 14px; height: 14px; border-radius: 50%; background: var(--danger); }
</style>
