<script setup lang="ts">
// Someone you met in the street: who they are, where they live, what they build (and whether it's online), and
// what you can do about it. Like a game's interaction menu: one main action, the rest as icon tiles. The main action
// depends on who they are and who you are (streetActions in personActions.ts): see their house; invite them to your
// house's free room; rent a place together; or log in first. A made-up person (a seeded flatmate, or a passer-by
// the lobby invents) says so in one plain line, and their invitation is shown disabled; they get no Message or GitHub
// key; only a real GitHub account gets a profile link.
// Invitations are structured actions; "Message" opens a direct conversation with them in the chat sheet.
import { computed, onBeforeUnmount, ref } from "vue";
import { openChat } from "../../conversations";
import { inviteToHouse, notices, rentTogether, withdrawInvite } from "../../notices";
import { me } from "../../session";
import type { CityHouse } from "../../types";
import { bellWords as bw } from "../bell/words";
import { messageAction } from "../chat/chat";
import Icon from "./house/Icon.vue";
import { type Home, homeLine, roomOf, sentence } from "./cards";
import { houseWords as hw } from "./house/words";
import LobbyCard from "./LobbyCard.vue";
import StatusDot from "./panel/StatusDot.vue";
import { roomLine, roomState } from "./panel/words";
import { streetActions } from "./personActions";
import { cardWords as w } from "./words";

const props = defineProps<{
  login: string;
  name: string;
  // Where they live, or null when they have no house (or only the workshop's practice room).
  home: Home | null;
  // Their house, as the city lists it (for their project).
  house: CityHouse | null;
  // Your own house, as the city lists it (for its free rooms), if you have one.
  myHouse: CityHouse | null;
  isMe: boolean;
  // A passer-by the lobby made up (passersby.ts), or someone the live line says is an example person.
  example?: boolean;
  // What the live line says about someone walking around: whether they logged in with GitHub.
  github?: boolean;
}>();
// `see` opens their house's window (the lobby takes you to its door first, in its city).
const emit = defineEmits<{ see: [houseId: string]; wave: []; close: [] }>();

// Their room in the city's list: what they build, in their own words, and whether it's online.
const room = computed(() => roomOf(props.house, props.home?.room));
const project = computed(() => room.value?.project ?? props.home?.project ?? null);
const state = computed(() => (room.value ? roomState(room.value, props.house?.status, props.house?.demo) : null));
// Its state in words, first in the line under the name ("Online."), the dot beside the name in colour.
const stateWords = computed(() => (room.value ? roomLine(room.value, props.house?.status, props.house?.demo) : ""));
const where = computed(() => homeLine(props.login, props.home));
const occupant = computed(() => room.value?.occupant ?? null);
const madeUp = computed(() => !!props.example || !!props.house?.demo || occupant.value?.github === false);

const actions = computed(() =>
  streetActions(
    {
      login: props.login,
      isMe: props.isMe,
      example: madeUp.value,
      github: occupant.value?.github ?? props.github,
      home: props.home ? { houseId: props.home.houseId, houseName: props.home.houseName } : null,
    },
    me.value,
    props.myHouse,
    notices.sent,
  ),
);
const main = computed(() => actions.value.main);
// Write to them: a real person, when you're logged in (an example person's key is there, disabled, with why).
const message = computed(() => messageAction({ isMe: props.isMe, example: madeUp.value }, me.value));
// The free room to offer, when your house has several: the first until you pick another.
const pickedRoom = ref<string | null>(null);
const offered = computed(() => {
  const m = main.value;
  if (m?.kind !== "invite") return null;
  return pickedRoom.value && m.rooms.includes(pickedRoom.value) ? pickedRoom.value : m.rooms[0];
});
const first = computed(() => props.name.split(" ")[0]);

// Saying hi: your character waves in the city (LobbyView.vue), and the tile answers in green with a tick for a
// moment, so you see it happened even when the card covers your character.
const waved = ref(false);
let wavedTimer = 0;
function wave() {
  if (waved.value) return;
  emit("wave");
  waved.value = true;
  wavedTimer = window.setTimeout(() => (waved.value = false), 2500);
}
onBeforeUnmount(() => clearTimeout(wavedTimer));

// Sending an invitation: a sentence once it's sent, or the API's refusal in its own words.
const busy = ref(false);
const said = ref("");
const error = ref("");
async function send(kind: "invite" | "rent" | "withdraw") {
  const m = main.value;
  if (busy.value || !m) return;
  busy.value = true;
  error.value = "";
  said.value = "";
  const sent =
    kind === "invite" && m.kind === "invite"
      ? await inviteToHouse(props.login, m.houseId, offered.value ?? undefined)
      : kind === "rent"
        ? await rentTogether(props.login)
        : (m.kind === "invited" || m.kind === "asked") ? await withdrawInvite(m.inviteId) : null;
  busy.value = false;
  if (!sent) return;
  if (!sent.ok) error.value = sent.message;
  else if (kind !== "withdraw") said.value = kind === "invite" ? bw.sentInvite(first.value) : bw.sentRent(first.value);
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

    <!-- Words only when they matter: an invitation just sent, a refusal, a full house, an example person (said once,
         in plain words, instead of disabled keys whose reason hides in a hover). -->
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-else-if="said" class="soft small" role="status">{{ said }}</p>
    <p v-else-if="main?.kind === 'full'" class="soft small">{{ bw.fullWhy(main.houseName) }}</p>
    <p v-else-if="madeUp" class="soft small">{{ w.exampleLine }}</p>

    <div class="menu">
      <button v-if="main?.kind === 'see'" class="big primary" :aria-label="bw.seeHouseName(main.houseName)" @click="emit('see', main.houseId)">
        <Icon name="house" :size="20" /> {{ bw.seeHouse }}
      </button>
      <div v-if="main?.kind === 'invite' && main.rooms.length > 1 && !main.example" class="segmented rooms" role="radiogroup" :aria-label="bw.whichRoom">
        <button v-for="r in main.rooms" :key="r" type="button" role="radio" :aria-checked="offered === r" @click="pickedRoom = r">
          <Icon name="door" :size="16" />{{ r }}
        </button>
      </div>
      <button v-if="main?.kind === 'invite'" class="big primary" :disabled="main.example || busy" :aria-label="bw.inviteHomeName(main.houseName)" @click="send('invite')">
        <Icon name="key" :size="20" /> {{ bw.inviteHome }}
      </button>
      <button v-else-if="main?.kind === 'full'" class="big primary" disabled :title="bw.fullWhy(main.houseName)">
        <Icon name="key" :size="20" /> {{ bw.full }}
      </button>
      <button v-else-if="main?.kind === 'rent'" class="big primary" :disabled="main.example || busy" @click="send('rent')">
        <Icon name="server" :size="20" /> {{ bw.rentTogether }}
      </button>
      <div v-else-if="main?.kind === 'invited' || main?.kind === 'asked'" class="sent">
        <span class="done"><Icon name="tick" :size="18" /> {{ main.kind === "invited" ? bw.invited : bw.asked }}</span>
        <button class="big quiet" :disabled="busy" :aria-label="bw.withdrawName" @click="send('withdraw')">{{ bw.withdraw }}</button>
      </div>
      <RouterLink v-else-if="main?.kind === 'login'" to="/login" class="big primary"><Icon name="login" :size="20" /> {{ bw.logIn }}</RouterLink>

      <!-- Only what you can do: an example person has no Message or GitHub key (the line above says why). -->
      <div v-if="actions.wave || actions.github || message?.kind === 'open'" class="tiles">
        <button v-if="message?.kind === 'open'" class="big tile" :aria-label="w.messageName(name)" @click="openChat('dm', { with: login })">
          <Icon name="chat" :size="22" /><span>{{ w.message }}</span>
        </button>
        <a v-if="actions.github" class="big tile" :href="actions.github" target="_blank" rel="noopener" :aria-label="w.githubName(login)">
          <Icon name="profile" :size="22" /><span>{{ w.github }}</span>
        </a>
        <button v-if="actions.wave" class="big tile" :class="{ waved }" :aria-label="waved ? hw.person.waved(first) : hw.person.waveName(first)" @click="wave">
          <Icon :name="waved ? 'tick' : 'hand'" :size="22" />
          <span>{{ waved ? w.waved : w.sayHi }}</span>
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
/* A disabled main action (an example person, a full house) stays readable but plainly off. */
.menu .big.primary:disabled { background: var(--fill); color: var(--muted); box-shadow: none; cursor: not-allowed; }
/* Already invited: the tick and the word, then "Take back" as a quiet key. */
.sent { display: flex; align-items: center; gap: 8px; }
.done { flex: 1; display: inline-flex; align-items: center; gap: 8px; min-height: 50px; padding: 0 14px; border-radius: var(--r-md); background: var(--live-soft); color: var(--live); font-weight: 700; }
.sent .quiet { flex: none; }
/* Just waved: the tile turns the "done" green for a moment. */
.menu .tile.waved { background: var(--live-soft); color: var(--live); box-shadow: none; }
/* Several free rooms: pick the one to offer, above the invitation. */
.rooms { flex-wrap: wrap; }
.rooms > button { flex: 1 1 auto; justify-content: center; }
</style>
