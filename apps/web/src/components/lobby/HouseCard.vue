<script setup lang="ts">
// A house, seen from the street: what it is, who lives in it and what they build, which rooms are free, and
// who's around right now. Like a game's interaction menu: "Go in" is the main action, and the panes show the rooms at
// a glance: a flatmate at home, or a dark room with its sign.
import { computed } from "vue";
import { me } from "../../session";
import type { CityHouse } from "../../types";
import FreeSticker from "./FreeSticker.vue";
import Icon from "./house/Icon.vue";
import { roomPicture } from "./house/roomPicture";
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

    <!-- The panes: a lit room per flatmate, a dark one with its sign when it's free. A free pane you may knock on is a
         button. A room being built flickers. -->
    <ul class="panes">
      <li v-for="room in house.rooms" :key="room.name" class="pane" :class="{ free: !room.occupant, building: room.building }">
        <template v-if="room.occupant">
          <img class="pic" :src="roomPicture(room.occupant.login)" alt="" loading="lazy" />
          <span class="tag">
            <span class="who" :title="nameOf(room.occupant)">{{ nameOf(room.occupant) }}</span>
            <span class="project">{{ room.project ?? room.name }}</span>
          </span>
          <span class="sr-only">{{ room.project ? w.builds(room.project) : w.room(room.name) }}</span>
        </template>
        <button v-else-if="canKnock" class="free-go" :aria-label="w.knockName(room.name)" :title="room.ad ? sentence(seeded(room.ad)) : w.openToAll" @click="emit('knock', room)">
          <span class="loue"><b>{{ w.forRent }}</b></span>
        </button>
        <span v-else class="free-go" :title="room.ad ? sentence(seeded(room.ad)) : w.openToAll">
          <span v-if="knock?.room === room.name" class="knocked">{{ w.knocked }}</span>
          <span v-else class="loue"><b>{{ w.forRent }}</b></span>
          <span class="sr-only">, {{ room.name }}</span>
        </span>
      </li>
    </ul>

    <p v-if="trouble" class="small soft">{{ trouble }}</p>
    <p class="what">{{ what }}</p>
    <p v-if="house.demo && !mine" class="soft small">{{ w.nobodyIn }}</p>
    <p v-if="mine" class="soft small">{{ w.yourHouse }}</p>
    <p v-else-if="hereLine" class="soft small">{{ hereLine }}</p>

    <div class="menu sill">
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
/* The panes: two a floor on the dark frame. A lit room with a paper tag under it, or a dark room with its sign. */
.panes { list-style: none; margin: 0; padding: 5px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px; border-radius: 3px; background: var(--frame); }
.pane { display: flex; flex-direction: column; min-width: 0; height: 112px; overflow: hidden; background: #ffd9a6; }
.pic { flex: 1 1 0; min-height: 0; width: 100%; object-fit: cover; object-position: 50% 62%; }
.tag { flex: none; display: grid; padding: 5px 8px 6px; background: var(--surface); color: var(--text); }
.who, .project { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.who { font-size: 14px; font-weight: 600; line-height: 1.2; }
.project { font-size: 13px; line-height: 1.2; color: var(--muted); }
.pane.free { background: var(--dark-room); }
.free-go { display: grid; place-items: center; width: 100%; height: 100%; min-height: 0; padding: 0; border-radius: 0; background: none; box-shadow: none; }
button.free-go:hover:not(:disabled) { background: rgba(255, 255, 255, 0.1); }
.free-go:focus-visible { outline: 3px solid #ffd21f; outline-offset: -5px; }
.knocked { color: #fff1dc; font-weight: 600; }
/* The bulb in a room being built isn't sure of itself. Never more than three flashes in a second. */
.pane.building .pic { animation: unsure 5s linear infinite; }
@keyframes unsure {
  0%, 62% { filter: none; }
  63% { filter: brightness(0.62); }
  65% { filter: none; }
  67% { filter: brightness(0.7); }
  69%, 100% { filter: none; }
}
.what { font-size: 16px; font-weight: 500; line-height: 1.25; }
.main { display: flex; gap: 8px; }
.main .primary { flex: 1 1 auto; }
.main .knock { flex: 0 1 auto; min-height: 60px; font-size: 18px; }
/* A phone: lower panes, so the main button stays in view. */
@media (max-width: 520px), (max-height: 760px) {
  .pane { height: 92px; }
  .facts { min-height: 46px; }
}
@media (prefers-reduced-motion: reduce) {
  .pane.building .pic { animation: none; }
}
</style>
