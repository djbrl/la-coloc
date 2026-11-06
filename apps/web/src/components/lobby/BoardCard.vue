<script setup lang="ts">
// The chores board on the market square: which houses in this city have code reviews waiting, and how many are
// late. A review is a chore: a flatmate reviews a housemate's pull request, and it takes a little off their rent.
// Only the counts are public (the pull requests' titles are for the flatmates); each house is one row that takes
// you to it, a quiet "!" when one is late. Under them, the city's own board (the chat sheet's Board tab): posts about
// houses, flatmates, projects, with a small dot when there's one you haven't seen (cityNews.ts).
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
  <LobbyCard class="board" :label="w.boardLabel(city)" :title="w.board" icon="board" :sub="waiting.length ? w.boardWaiting(city) : w.boardNone(city)" :close-name="w.close" @close="emit('close')">

    <ul v-if="waiting.length" class="pins">
      <li v-for="h in waiting" :key="h.id">
        <button class="big pin" @click="emit('open', h.id)">
          <span class="text">
            <strong>{{ h.name }}</strong><span class="soft">: {{ line(h) }}</span>
          </span>
          <span v-if="(h.lateChores ?? 0) > 0" class="status-mark fail" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 6v7M12 17.5v.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" /></svg></span>
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
/* Wide enough for "Le tableau des corvées" on one line. */
.board { --card-width: 420px; }
.pins { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
/* Each house: one row on a soft tile, its name and counts in one line, a quiet "!" when something's late. */
.card .pin.big { width: 100%; justify-content: flex-start; gap: 10px; min-height: 52px; padding: 6px 10px 6px 14px; border-radius: 12px; background: var(--tile); box-shadow: none; text-align: left; font: 600 15px/1.2 var(--font); }
.card .pin.big:hover:not(:disabled) { background: var(--fill); }
.pin .text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pin strong { font-weight: 800; }
.pin > svg { color: var(--muted); }
.city.big { width: 100%; }
/* A post you haven't seen on the city's board: a small red dot after the word. */
.new { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
</style>
