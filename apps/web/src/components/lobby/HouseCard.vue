<script setup lang="ts">
// A house, seen from the street: what it is (the line under its name), three numbers (flatmates, rooms, free), who
// lives in it and what they build (one row each, their project's state as a quiet symbol), and who's around right now.
// Like a game's interaction menu: "Go in" is the main action, Knock beside it in grey.
import { computed } from "vue";
import { me } from "../../session";
import type { CityHouse } from "../../types";
import Avatar from "../Avatar.vue";
import Icon from "./house/Icon.vue";
import { houseCounts } from "./houseStats";
import { type CityRoom, knockOn, listNames, nameOf, sentence } from "./cards";
import LobbyCard from "./LobbyCard.vue";
import StatusDot from "./panel/StatusDot.vue";
import { explain, houseState, houseTrouble, roomState } from "./panel/words";
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
const lived = computed(() => props.house.rooms.filter((r) => r.occupant));
const counts = computed(() => houseCounts(props.house));
// A room's project as a quiet symbol: online (a tick), down (a cross), anything else a small grey dot.
function markOf(room: CityRoom) {
  const s = roomState(room, props.house.status, props.house.demo);
  return { kind: s.tone === "live" ? "ok" : s.tone === "danger" ? "fail" : "none", word: s.word };
}
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
  <LobbyCard class="house-card" :label="w.houseLabel(house.name, house.city)" :title="house.name" icon="house" :close-name="w.close" @close="emit('close')">
    <template #sub><StatusDot :state="state" />{{ what }}</template>

    <!-- Numbers rather than sentences: who lives there, its rooms, the free ones. -->
    <div class="stats">
      <p class="stat"><b>{{ counts.people }}</b><span>{{ w.statPeople(counts.people) }}</span></p>
      <p class="stat"><b>{{ counts.rooms }}</b><span>{{ w.statRooms(counts.rooms) }}</span></p>
      <p class="stat"><b>{{ counts.free }}</b><span>{{ w.statFree(counts.free) }}</span></p>
    </div>

    <!-- Who lives there: their project, their name under it, its state as a symbol. -->
    <ul v-if="lived.length" class="people">
      <li v-for="room in lived" :key="room.name" class="person">
        <Avatar :person="room.occupant!" :size="36" decorative />
        <span class="text">
          <span class="project">{{ room.project ?? w.room(room.name) }}</span>
          <span class="who">{{ nameOf(room.occupant!) }}</span>
        </span>
        <span class="status-mark" :class="markOf(room).kind" role="img" :aria-label="markOf(room).word">
          <Icon v-if="markOf(room).kind === 'ok'" name="tick" :size="10" />
          <svg v-else-if="markOf(room).kind === 'fail'" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" /></svg>
        </span>
      </li>
      <!-- Several free rooms: each its own row, to knock on the one you want (one free room is the Knock button). -->
      <template v-if="free.length > 1">
        <li v-for="room in free" :key="room.name" class="person free">
          <span class="door" aria-hidden="true"><Icon name="door" :size="18" /></span>
          <span class="text">
            <span class="project">{{ knock?.room === room.name ? w.knocked : w.free }}</span>
            <span class="who">{{ room.ad ? sentence(seeded(room.ad)) : w.room(room.name) }}</span>
          </span>
          <button v-if="canKnock" type="button" class="knock-row" :aria-label="w.knockName(room.name)" @click="emit('knock', room)">{{ w.knock }}</button>
        </li>
      </template>
    </ul>

    <p v-if="trouble" class="small soft">{{ trouble }}</p>
    <p v-if="house.demo && !mine" class="soft small">{{ w.nobodyIn }}</p>
    <p v-if="mine" class="soft small">{{ w.yourHouse }}</p>
    <p v-else-if="hereLine" class="soft small">{{ hereLine }}</p>

    <div class="menu">
      <div class="main">
        <button v-if="canKnock && free.length" class="big knock" :aria-label="w.knockName(free[0].name)" @click="emit('knock', free[0])">{{ w.knock }}</button>
        <button class="big primary" @click="emit('enter')">
          {{ w.goIn }} <kbd v-if="near" aria-hidden="true">E</kbd>
        </button>
      </div>
      <button v-if="knock" class="big" @click="emit('thread', knock.id)"><Icon name="thread" :size="20" /><span>{{ w.yourKnock }}</span></button>
      <RouterLink v-else-if="free.length && !me && !house.demo" to="/login" class="big"><Icon name="login" :size="20" /><span>{{ w.logInToKnock }}</span></RouterLink>
    </div>
  </LobbyCard>
</template>

<style scoped>
.house-card { --card-width: 420px; }
/* The three numbers, each on a soft tile: the value big, what it counts under it. */
.stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.card .stat { display: grid; gap: 2px; min-width: 0; margin: 0; padding: 12px 14px; border-radius: var(--tile-r); background: var(--tile); }
.stat b { font-size: 20px; font-weight: 800; line-height: 26px; font-variant-numeric: tabular-nums; }
.stat span { font-size: 13px; font-weight: 600; line-height: 18px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Who lives there: one row each, no lines between, air instead. */
.people { list-style: none; margin: 0; padding: 0; display: grid; }
.person { display: flex; align-items: center; gap: 12px; min-width: 0; min-height: 48px; padding: 2px 4px; }
.text { flex: 1 1 auto; min-width: 0; display: grid; gap: 1px; }
.project, .who { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.project { font-size: 15px; font-weight: 800; line-height: 20px; }
.who { font-size: 13px; font-weight: 600; line-height: 18px; color: var(--muted); }
.person .status-mark { width: 16px; height: 16px; }
.person .status-mark svg { width: 10px; height: 10px; }
.door { flex: none; display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; background: var(--free-soft); color: var(--free); }
.knock-row { flex: none; min-height: 40px; padding: 0 14px 3px; border-radius: 10px; background: var(--sunken); box-shadow: inset 0 -3px 0 var(--quiet-lip); font-size: 14px; }
.knock-row:hover:not(:disabled) { background: var(--fill); }
/* Knock in grey, Go in the main button twice as wide. */
.main { display: flex; gap: 10px; }
.main .primary { flex: 2 1 0; min-width: 0; }
.main .knock { flex: 1 1 0; min-width: 0; }
</style>
