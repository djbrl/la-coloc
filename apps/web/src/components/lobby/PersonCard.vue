<script setup lang="ts">
// Someone you met in the street: who they are, where they live, what they build (and whether it's online), and
// what you can do about it. Like a game's interaction menu: one main action, the rest as icon tiles.
import { computed, ref } from "vue";
import { me } from "../../session";
import type { CityHouse } from "../../types";
import Icon from "./house/Icon.vue";
import { type CityRoom, freeRooms, type Home, homeLine, knockOn, roomOf, sentence } from "./cards";
import LobbyCard from "./LobbyCard.vue";
import StatusDot from "./panel/StatusDot.vue";
import { roomLine, roomState } from "./panel/words";
import { cardWords as w } from "./words";

const props = defineProps<{
  login: string;
  name: string;
  // Where they live, or null when they're just visiting.
  home: Home | null;
  // Their house, as the city lists it (for their project and the free rooms).
  house: CityHouse | null;
  isMe: boolean;
}>();
// `thread` opens your knock on their house (its id), when you already have one.
const emit = defineEmits<{ knock: [houseId: string, room: CityRoom]; see: [houseId: string]; thread: [applicationId: string]; wave: []; close: [] }>();

const free = computed(() => (props.house ? freeRooms(props.house) : []));
const liveThere = computed(() => !!props.house && (me.value?.houses.some((h) => h.id === props.house!.id) ?? false));
// Your open knock on their house: then the card takes you to it instead of offering a second one.
const knock = computed(() => (props.isMe || liveThere.value ? null : knockOn(me.value?.knocks, props.house?.id)));
// You can ask to join their house when it has a free room, it's real, you're logged in, and it isn't yours already.
const canAsk = computed(() => !props.isMe && !knock.value && !!props.house && !props.house.demo && free.value.length > 0 && !!me.value && !liveThere.value);
const askLogin = computed(() => !props.isMe && !!props.house && free.value.length > 0 && !props.house.demo && !me.value);

// Their room in the city's list: what they build, in their own words, and whether it's online.
const room = computed(() => roomOf(props.house, props.home?.room));
const project = computed(() => room.value?.project ?? props.home?.project ?? null);
const state = computed(() => (room.value ? roomState(room.value, props.house?.status, props.house?.demo) : null));
// Its state in words, first in the line under the name ("Online."), the dot beside the name in colour.
const stateWords = computed(() => (room.value ? roomLine(room.value, props.house?.status, props.house?.demo) : ""));
const where = computed(() => homeLine(props.login, props.home));

// Several free rooms: pick one first.
const choosing = ref(false);

function ask() {
  if (!props.house) return;
  if (free.value.length === 1) emit("knock", props.house.id, free.value[0]);
  else choosing.value = true;
}
</script>

<template>
  <LobbyCard :label="w.personLabel(name)">
    <h2>{{ name }}</h2>
    <button class="x" :aria-label="w.close" @click="emit('close')">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" /></svg>
    </button>
    <p class="soft small who">
      <template v-if="where">{{ where }}</template>
      <template v-else>{{ w.visiting(login) }}</template>
      <template v-if="isMe">{{ w.thatsYou }}</template>
    </p>

    <!-- What they build: the project's name, its state, and a line from them about it. -->
    <div v-if="home" class="project">
      <span class="ic" aria-hidden="true"><Icon name="box" :size="20" /></span>
      <div class="what">
        <p class="name">
          <strong>{{ project ?? w.room(home.room) }}</strong>
          <StatusDot v-if="state && project" :state="state" />
        </p>
        <p v-if="!project" class="soft small desc">{{ w.nothingOnline }}</p>
        <p v-else class="soft small desc">{{ stateWords }}{{ room?.projectDescription ? ` ${sentence(room.projectDescription)}` : "" }}</p>
      </div>
    </div>

    <template v-if="choosing && house">
      <p class="soft small">{{ w.whichRoom }}</p>
      <ul class="rooms">
        <li v-for="r in free" :key="r.name">
          <button class="big pick" @click="emit('knock', house.id, r)">
            <Icon name="door" :size="20" />
            <span class="pick-text">
              <span>{{ w.room(r.name) }}</span>
              <span class="soft small">{{ r.ad ? sentence(r.ad) : w.openToAll }}</span>
            </span>
          </button>
        </li>
      </ul>
    </template>

    <div class="menu">
      <button v-if="knock" class="big primary" @click="emit('thread', knock.id)"><Icon name="thread" :size="20" /> {{ w.seeKnock }}</button>
      <button v-else-if="canAsk && !choosing" class="big primary" @click="ask"><Icon name="knock" :size="20" /> {{ w.askToJoin }}</button>
      <RouterLink v-else-if="askLogin" to="/login" class="big primary"><Icon name="login" :size="20" /> {{ w.logInToAsk }}</RouterLink>
      <div v-if="(home && !isMe) || (!isMe && me)" class="tiles">
        <button v-if="home && !isMe" class="big tile" @click="emit('see', home.houseId)">
          <Icon name="house" :size="22" /><span>{{ w.house }}<span class="sr-only">{{ w.seeHouse(home.houseName) }}</span></span>
        </button>
        <button v-if="!isMe && me" class="big tile" @click="emit('wave')">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path
              d="M8 13V6.5a1.5 1.5 0 0 1 3 0V11 M11 11V4.5a1.5 1.5 0 0 1 3 0V11 M14 11V5.5a1.5 1.5 0 0 1 3 0V12 M17 9.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-2.8L4.3 15a1.5 1.5 0 0 1 2.5-1.6L8 15"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <span>{{ w.sayHi }}</span>
        </button>
      </div>
    </div>
  </LobbyCard>
</template>

<style scoped>
.who { margin-top: -6px; overflow-wrap: anywhere; }
/* Their project, as a small block: what it's called, whether it's online, and what it does. */
.project { display: flex; gap: 12px; align-items: flex-start; padding: 12px; border-radius: var(--r-md); background: var(--tile); }
.ic { flex: none; width: 36px; height: 36px; display: grid; place-items: center; border-radius: var(--r-sm); background: var(--surface); color: var(--muted); }
.what { flex: 1; min-width: 0; display: grid; gap: 2px; }
.name { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.name strong { overflow-wrap: anywhere; }
.desc { display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.rooms { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.pick { width: 100%; justify-content: flex-start; text-align: left; padding: 8px 14px; }
.pick-text { display: grid; min-width: 0; }
.pick-text .small { font-weight: 400; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
