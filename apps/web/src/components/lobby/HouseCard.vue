<script setup lang="ts">
// A house, seen from the street: what it is, who lives in it and what they build, which rooms are free, and
// who's around right now. Like a game's interaction menu: "Go in" is the main action, the rest are icon tiles.
import { computed } from "vue";
import { me } from "../../session";
import type { CityHouse } from "../../types";
import Avatar from "../Avatar.vue";
import Icon from "./house/Icon.vue";
import { type CityRoom, knockOn, listNames, nameOf, roomsLine, sentence } from "./cards";
import LobbyCard from "./LobbyCard.vue";
import StatusDot from "./panel/StatusDot.vue";
import { explain, houseLine, houseState } from "./panel/words";

const props = defineProps<{
  house: CityHouse;
  // Everyone online in this neighbourhood, by login.
  others: Set<string>;
  // Standing at its door already? Then there's nowhere to walk, and E goes in.
  near: boolean;
}>();
// `enter` opens the house's inside over the city (you never leave the lobby); `walk` sets off for its door;
// `thread` opens your knock on this house (its id).
const emit = defineEmits<{ knock: [room: CityRoom]; enter: []; walk: []; thread: [applicationId: string]; close: [] }>();

const mine = computed(() => me.value?.houses.some((h) => h.id === props.house.id) ?? false);
const free = computed(() => props.house.rooms.filter((r) => !r.occupant));
// Your open knock here: one per house, so the free rooms stop offering another.
const knock = computed(() => (mine.value ? null : knockOn(me.value?.knocks, props.house.id)));
// Knocking needs someone to answer the door: a real house, you logged in, not living there, not knocked yet.
const canKnock = computed(() => !!me.value && !props.house.demo && !mine.value && !knock.value);

// One sentence: where it is, whether its server runs (the dot beside it in colour), and its rooms.
// "Dakar. Its server is running. 4 rooms, 1 free."
const where = computed(() => `${houseLine(props.house)} ${roomsLine(props.house)}.`.replace(/^./, (c) => c.toUpperCase()));
const state = computed(() => houseState(props.house.status, props.house.agentOnline, props.house.demo));
// What the house is: its own words if it has some, else what a house is at all.
const what = computed(() => (props.house.tagline ? sentence(props.house.tagline) : explain.house));

// Flatmates who are walking around this neighbourhood right now.
const hereLine = computed(() => {
  const names = props.house.rooms.filter((r) => r.occupant && props.others.has(r.occupant.login)).map((r) => nameOf(r.occupant!));
  if (!names.length) return "";
  return `${listNames(names)} ${names.length === 1 ? "is" : "are"} here right now.`;
});
</script>

<template>
  <LobbyCard :label="`${house.name}, a house in ${house.city}`">
    <h2>{{ house.name }}</h2>
    <button class="x" aria-label="Close (Esc)" @click="emit('close')">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" /></svg>
    </button>
    <p class="where small"><StatusDot :state="state" /><span class="soft">{{ where }}</span></p>
    <p class="what">{{ what }}</p>
    <p v-if="house.demo && !mine" class="soft small">Nobody's in to answer the door.</p>
    <p v-if="mine" class="soft small">This is your house.</p>
    <p v-else-if="hereLine" class="soft small">{{ hereLine }}</p>

    <ul class="rooms">
      <li v-for="room in house.rooms" :key="room.name">
        <template v-if="room.occupant">
          <Avatar :person="room.occupant" :size="30" decorative />
          <span class="grow">
            <strong>{{ nameOf(room.occupant) }}</strong>
            <span class="soft small line">{{ room.project ? `Builds ${room.project}` : `Room ${room.name}` }}</span>
          </span>
        </template>
        <template v-else>
          <span class="door" aria-hidden="true" />
          <span class="grow">
            <strong>Free</strong><span class="soft">, {{ room.name }}</span>
            <span class="soft small line">{{ room.ad ? sentence(room.ad) : "Open to anyone who ships." }}</span>
          </span>
          <button v-if="canKnock" class="big knock" :aria-label="`Knock on room ${room.name}`" @click="emit('knock', room)">Knock</button>
          <span v-else-if="knock?.room === room.name" class="yours small">Knocked</span>
        </template>
      </li>
    </ul>

    <div class="menu">
      <button class="big primary" @click="emit('enter')">
        <Icon name="door" :size="20" /> Go in <kbd v-if="near" aria-hidden="true">E</kbd>
      </button>
      <div v-if="knock || !near || (free.length && !me && !house.demo)" class="tiles">
        <button v-if="knock" class="big tile" @click="emit('thread', knock.id)"><Icon name="thread" :size="22" /><span>Your knock</span></button>
        <RouterLink v-else-if="free.length && !me && !house.demo" to="/login" class="big tile"><Icon name="login" :size="22" /><span>Log in to knock</span></RouterLink>
        <button v-if="!near" class="big tile" @click="emit('walk')"><Icon name="next" :size="22" /><span>Walk there</span></button>
      </div>
    </div>
  </LobbyCard>
</template>

<style scoped>
.where { display: flex; align-items: baseline; gap: 8px; margin-top: -6px; min-width: 0; }
.where .status-dot { translate: 0 -1px; }
.rooms { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.rooms li { display: flex; align-items: center; gap: 10px; min-height: 46px; padding: 6px 10px; border-radius: 14px; background: var(--tile); font-size: 15px; }
.grow { flex: 1; min-width: 0; }
.grow .line { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* A free room's door: the same blue as a free window in the city, flat. */
.door { width: 30px; height: 30px; flex: none; border-radius: 8px; border: 2px solid var(--accent-fill); background: var(--accent-soft); }
.rooms .knock.big { flex: none; min-height: 36px; padding: 0 14px; border-radius: 10px; font-size: 14px; background: var(--accent-soft); color: var(--accent); }
.rooms .knock.big:hover:not(:disabled) { background: var(--accent-soft); box-shadow: inset 0 0 0 1.5px var(--accent-fill); }
.yours { flex: none; color: var(--warn); font-weight: 600; }
</style>
