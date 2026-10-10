<script setup lang="ts">
// One house of the city as one row, like a game's server list: its drawing, its name, where it is and what it's
// about, its state (a coloured dot), its rooms in a few words, a few of its people, and one way in. The whole row is the way in: the button's
// target stretches over it, so a click anywhere on the row opens the house, and Tab stops once per row.
import { computed } from "vue";
import type { CityHouse } from "../../types";
import Avatar from "../Avatar.vue";
import HouseDrawing from "../HouseDrawing.vue";
import Icon from "../lobby/house/Icon.vue";
import ListRow from "../lobby/panel/ListRow.vue";
import StatusDot from "../lobby/panel/StatusDot.vue";
import { houseState } from "../lobby/panel/words";
import { faces, flag, roomsSaid, rowLine } from "./city";

const props = defineProps<{ house: CityHouse; mine?: boolean }>();

const crew = computed(() => faces(props.house));
const state = computed(() => houseState(props.house.status, props.house.agentOnline, props.house.demo));
const names = computed(() => props.house.rooms.filter((r) => r.occupant).map((r) => r.occupant!.name ?? r.occupant!.login));
</script>

<template>
  <ListRow class="city-row" :title="house.name" :mine="mine">
    <template #lead><HouseDrawing :house="house" class="drawing" aria-hidden="true" /></template>
    <!-- On a phone there's no room for the right side: the rooms take the tagline's place under the name. -->
    <span class="sub" :title="rowLine(house)">
      <span v-if="flag(house.country)" class="flag" aria-hidden="true">{{ flag(house.country) }}</span>{{ house.city }} ·
      <span class="wide">{{ rowLine(house) }}</span><span class="narrow" aria-hidden="true">{{ roomsSaid(house) }}</span>
    </span>
    <!-- What the right side shows, said once for a screen reader whatever the width (the right side hides on a phone). -->
    <span class="sr-only">{{ state.word }}. {{ roomsSaid(house) }}.<template v-if="names.length"> Living here: {{ names.join(", ") }}.</template></span>
    <template #meta>
      <span class="meta-parts" aria-hidden="true">
        <StatusDot :state="state" />
        <span class="rooms">{{ roomsSaid(house) }}</span>
        <span v-if="crew.people.length" class="faces">
          <Avatar v-for="p in crew.people" :key="p.login" :person="p" :size="24" decorative />
          <span v-if="crew.more" class="extra">+{{ crew.more }}</span>
        </span>
      </span>
    </template>
    <template #end>
      <RouterLink :to="`/houses/${house.id}`" class="button go" :aria-label="`Go into ${house.name}${mine ? ', your house' : ''}`">
        <Icon name="door" :size="16" /><span class="go-word">Go in</span>
      </RouterLink>
    </template>
  </ListRow>
</template>

<style scoped>
/* The row holds the stretched target of its button. */
.city-row { position: relative; min-height: 64px; }
.drawing { width: 40px; }
.flag { margin-right: 5px; }
.rooms { white-space: nowrap; }
.meta-parts { display: flex; align-items: center; gap: 10px; }
.narrow { display: none; }
/* Side by side with a little air: overlapped, initials ran into each other ("AN AW MA"). */
.faces { display: flex; align-items: center; gap: 3px; }
/* Not ".more": the site has a link style by that name. */
.extra { display: grid; place-items: center; min-width: 24px; height: 24px; padding: 0 4px; border-radius: 12px; background: var(--fill); color: var(--muted); font-size: 11px; font-weight: 700; }
.go { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; white-space: nowrap; }
/* The button's target covers the whole row: the row is the menu entry. */
.go::after { content: ""; position: absolute; inset: 0; border-radius: 14px; }
.go:focus-visible { outline: none; }
@media (max-width: 640px) {
  .faces { display: none; }
}
@media (max-width: 480px) {
  .wide { display: none; }
  .narrow { display: inline; }
  /* The whole row is the way in; the button keeps its icon and its name for a screen reader. */
  .go { width: 40px; padding: 0; justify-content: center; }
  .go-word { display: none; }
}
</style>
