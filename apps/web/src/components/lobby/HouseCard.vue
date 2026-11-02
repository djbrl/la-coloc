<script setup lang="ts">
// A house, seen from the street: what it is, who lives in it and what they build, which rooms are free, and
// who's around right now. Like a game's interaction menu: "Go in" is the main action, and the little building shows
// the rooms at a glance (a blue window is free, as in the city).
import { computed } from "vue";
import { me } from "../../session";
import type { CityHouse } from "../../types";
import Avatar from "../Avatar.vue";
import FreeSticker from "./FreeSticker.vue";
import Icon from "./house/Icon.vue";
import HouseStats from "./HouseStats.vue";
import { type CityRoom, knockOn, listNames, nameOf, sentence } from "./cards";
import LobbyCard from "./LobbyCard.vue";
import StatusDot from "./panel/StatusDot.vue";
import { explain, houseState, houseTrouble } from "./panel/words";
import { cardWords as w } from "./words";
import { seeded } from "../seeded";

const props = defineProps<{
  house: CityHouse;
  // Everyone online in this neighbourhood, by login.
  others: Set<string>;
  // Standing at its door already? Then E goes in. (Getting there is walking, or a pick on the big map.)
  near: boolean;
}>();
// `enter` opens the house's inside over the city (you never leave the lobby); `thread` opens your knock on this
// house (its id).
const emit = defineEmits<{ knock: [room: CityRoom]; enter: []; thread: [applicationId: string]; close: [] }>();

const mine = computed(() => me.value?.houses.some((h) => h.id === props.house.id) ?? false);
const free = computed(() => props.house.rooms.filter((r) => !r.occupant));
// Your open knock here: one per house, so the free rooms stop offering another.
const knock = computed(() => (mine.value ? null : knockOn(me.value?.knocks, props.house.id)));
// Knocking needs someone to answer the door: a real house, you logged in, not living there, not knocked yet.
const canKnock = computed(() => !!me.value && !props.house.demo && !mine.value && !knock.value);

// The state is the dot beside the name (with a hidden name for screen readers). Words only when something is wrong
// ("Its server is down for now."): the city is the one you're in, and the rooms are listed below.
const trouble = computed(() => houseTrouble(props.house));
const state = computed(() => houseState(props.house.status, props.house.agentOnline, props.house.demo));
// What the house is: its own words if it has some, else what a house is at all.
const what = computed(() => (props.house.tagline ? sentence(seeded(props.house.tagline)) : explain.house));

// Flatmates who are walking around this neighbourhood right now.
const hereLine = computed(() => {
  const names = props.house.rooms.filter((r) => r.occupant && props.others.has(r.occupant.login)).map((r) => nameOf(r.occupant!));
  if (!names.length) return "";
  return w.hereNow(listNames(names), names.length > 1);
});
</script>

<template>
  <LobbyCard class="house-card" :label="w.houseLabel(house.name, house.city)" :title="house.name" large :close-name="w.close" @close="emit('close')">
    <template #sub>{{ house.city }}<StatusDot :state="state" /></template>

    <!-- Who lives there, its rooms: icons, so it reads whatever language the name is in. The sticker can't be missed. -->
    <div class="facts">
      <HouseStats big :house="house" :sample="house.demo" />
      <FreeSticker v-if="free.length" :n="free.length" />
    </div>

    <!-- The little building: a lit window per room, the free ones blue, as in the city. A free window you may knock on
         is a button. -->
    <ul class="building">
      <li v-for="room in house.rooms" :key="room.name" class="window" :class="{ free: !room.occupant }">
        <template v-if="room.occupant">
          <span class="who" :title="nameOf(room.occupant)"><Avatar :person="room.occupant" :size="56" decorative /></span>
          <span class="project">{{ room.project ?? room.name }}</span>
          <span class="sr-only">{{ nameOf(room.occupant) }}, {{ room.project ? w.builds(room.project) : w.room(room.name) }}</span>
        </template>
        <button v-else-if="canKnock" class="free-go" :aria-label="w.knockName(room.name)" :title="room.ad ? sentence(seeded(room.ad)) : w.openToAll" @click="emit('knock', room)">{{ w.free }}</button>
        <span v-else class="free-word" :title="room.ad ? sentence(seeded(room.ad)) : w.openToAll">{{ knock?.room === room.name ? w.knocked : w.free }}<span class="sr-only">, {{ room.name }}</span></span>
      </li>
    </ul>

    <p v-if="trouble" class="small soft">{{ trouble }}</p>
    <p class="what">{{ what }}</p>
    <p v-if="house.demo && !mine" class="soft small">{{ w.nobodyIn }}</p>
    <p v-if="mine" class="soft small">{{ w.yourHouse }}</p>
    <p v-else-if="hereLine" class="soft small">{{ hereLine }}</p>

    <div class="menu">
      <div class="main">
        <button class="big primary" @click="emit('enter')">
          <Icon name="door" :size="22" /> {{ w.goIn }} <kbd v-if="near" aria-hidden="true">E</kbd>
        </button>
        <button v-if="canKnock && free.length" class="big knock" :aria-label="w.knockName(free[0].name)" @click="emit('knock', free[0])">{{ w.knock }}</button>
      </div>
      <div v-if="knock || (free.length && !me && !house.demo)" class="tiles">
        <button v-if="knock" class="big tile" @click="emit('thread', knock.id)"><Icon name="thread" :size="22" /><span>{{ w.yourKnock }}</span></button>
        <RouterLink v-else-if="free.length && !me && !house.demo" to="/login" class="big tile"><Icon name="login" :size="22" /><span>{{ w.logInToKnock }}</span></RouterLink>
      </div>
    </div>
  </LobbyCard>
</template>

<style scoped>
.house-card { --card-width: 410px; }
.facts { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 54px; }
/* The building: two windows a floor on a black frame. A lit window has its flatmate's face and project in it. */
.building { list-style: none; margin: 0; padding: 6px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; background: var(--ink); }
.window { position: relative; height: 96px; min-width: 0; overflow: hidden; background: var(--lit-window); }
.window.free { background: var(--free-window); }
.who { position: absolute; left: 8px; top: 8px; display: block; }
.project { position: absolute; right: 5px; bottom: 5px; max-width: calc(100% - 10px); padding: 1px 6px; border-radius: 5px; background: #ffffff; color: var(--ink); font-size: 14px; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.free-go, .free-word { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; min-height: 0; padding: 0; border-radius: 0; background: none; color: #ffffff; font: 800 20px/1 var(--font); }
.free-go:hover:not(:disabled) { background: rgba(255, 255, 255, 0.18); }
.free-go:focus-visible { outline-color: #ffffff; outline-offset: -5px; }
.what { font-size: 19px; font-weight: 800; line-height: 1.15; }
.main { display: flex; gap: 8px; }
.main .primary { flex: 1 1 auto; }
.main .knock { flex: 0 1 auto; min-height: 60px; font-size: 18px; }
/* A phone: lower windows, so the main button stays in view. */
@media (max-width: 520px), (max-height: 760px) {
  .window { height: 72px; }
  .who :deep(.avatar) { width: 44px !important; height: 44px !important; }
  .who { left: 6px; top: 6px; }
  .facts { min-height: 46px; }
}
</style>
