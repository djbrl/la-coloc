<script setup lang="ts">
// A house's page in the list view: the no-3D twin of going inside a house in the lobby. The top of it IS the
// lobby's house panel (HouseInside: the name and state, the crew, the tabs, the rooms, the one next step), set on
// the page in a floating card instead of a sheet over the city, so both views read the same way. The places it
// asks to open (a room, a knock) become pages here. Under it, the parts the panel leaves out to fit its sheet
// (components/list/HouseMore.vue): the door, the rooms at work, the builds, and a few facts.
import { ref, watch } from "vue";
import { useRouter } from "vue-router";
import HouseInside from "../components/lobby/HouseInside.vue";
import type { Place } from "../components/lobby/place";
import HouseMore from "../components/list/HouseMore.vue";
import ListCard from "../components/list/ListCard.vue";
import { listWords as w } from "../components/list/words";
import type { HouseView } from "../types";

const props = defineProps<{ id: string }>();
const router = useRouter();

// The cards under the panel read the same house view the panel fetches and follows on its stream: the panel hands
// each new version up (`view`), so there's one fetch and one stream for the page.
const house = ref<HouseView | null>(null);
watch(
  () => props.id,
  () => (house.value = null),
);

// The panel names itself ("Inside Sacré-Cœur") once it has loaded: that's the page's heading.
const label = ref("");
watch(
  () => props.id,
  () => (label.value = ""),
);

// In the lobby these places open on top of the sheet; here each is its own page, so Back works as anywhere.
function open(place: Place) {
  const to =
    place.kind === "house"
      ? `/houses/${encodeURIComponent(place.id)}`
      : place.kind === "room"
        ? `/houses/${encodeURIComponent(place.houseId)}/rooms/${encodeURIComponent(place.room)}`
        : `/applications/${encodeURIComponent(place.id)}`;
  router.push(to);
}
</script>

<template>
  <div class="house-page">
    <div class="top">
      <RouterLink to="/" class="button chunk" :aria-label="w.backToCity">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></svg>
        {{ w.cityLink }}
      </RouterLink>
    </div>

    <h1 class="sr-only">{{ label || w.aHouse }}</h1>

    <ListCard>
      <HouseInside :id="id" class="panel" @open="open" @label="(l) => (label = l)" @view="(h) => (house = h)" />
    </ListCard>

    <HouseMore v-if="house" :house="house" />
  </div>
</template>

<style scoped>
/* A centred column of floating cards that grows like any page; the window scrolls, not the cards. */
.house-page {
  max-width: calc(760px + 2 * var(--gutter));
  margin: 0 auto;
  padding: 20px var(--gutter) 80px;
  display: grid;
  gap: 20px;
  align-content: start;
}
.top { display: flex; }
.chunk { display: inline-flex; align-items: center; gap: 6px; min-height: 46px; padding: 0 16px 0 12px; font-size: 15px; font-weight: 600; }
/* On a page the channel grows with its messages up to a height, then they scroll inside it and the send box stays in view. */
.panel :deep(.chat-host) { max-height: min(64vh, 560px); flex: none; }
@media (max-width: 480px) {
  .house-page { padding-top: 12px; gap: 14px; }
}
</style>
