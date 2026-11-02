<script setup lang="ts">
// Someone you met in the street: who they are, where they live, what they build (and whether it's online), and
// what you can do about it. Chat first, on everyone but you: a direct conversation in the chat sheet (messageAction in
// chat/chat.ts). Logged out, it takes you to log in. For a made-up person (a seeded flatmate, or a passer-by the lobby
// invents) it's there but off, and one plain line says why. Then at most two more keys (streetActions in
// personActions.ts): see their house, and invite them to yours or ask them to share one. A flatmate of yours gets
// "Team up" instead (TeamUp.vue: join their project, or bring them into yours). A real GitHub account's name is a link
// to their profile, and someone else's card has a key for it too.
import { computed, ref } from "vue";
import { openChat } from "../../conversations";
import { inviteToHouse, notices, rentTogether, withdrawInvite } from "../../notices";
import { me } from "../../session";
import type { Badge, CityHouse } from "../../types";
import BadgeChip from "../arena/BadgeChip.vue";
import { bellWords as bw } from "../bell/words";
import { messageAction } from "../chat/chat";
import Icon from "./house/Icon.vue";
import { type Home, homeLine, roomOf, sentence } from "./cards";
import { houseWords as hw } from "./house/words";
import LobbyCard from "./LobbyCard.vue";
import StatusDot from "./panel/StatusDot.vue";
import { roomLine, roomState } from "./panel/words";
import { streetActions } from "./personActions";
import { teamUp } from "./team";
import TeamUp from "./TeamUp.vue";
import { cardWords as w } from "./words";
import { seeded } from "../seeded";

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
  // The title they wear, won in an arena.
  badge?: Badge | null;
}>();
// `see` opens their house's window (the lobby takes you to its door first, in its city).
const emit = defineEmits<{ see: [houseId: string]; close: [] }>();

// Their room in the city's list: what they build, in their own words, and whether it's online.
const room = computed(() => roomOf(props.house, props.home?.room));
const project = computed(() => room.value?.project ?? props.home?.project ?? null);
const state = computed(() => (room.value ? roomState(room.value, props.house?.status, props.house?.demo) : null));
// Its state in words, first in the line under the name ("Online."), the dot beside the name in colour.
const stateWords = computed(() => (room.value ? roomLine(room.value, props.house?.status, props.house?.demo) : ""));
const where = computed(() => homeLine(props.home));
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
const offer = computed(() => actions.value.offer);
// A flatmate of yours: teaming up on a project (team.ts) takes "See their house"'s place, since their house is yours.
const team = computed(() => {
  const mine = props.myHouse;
  if (!mine || props.home?.houseId !== mine.id) return null;
  const myRoom = me.value?.houses.find((h) => h.id === mine.id)?.room ?? null;
  return teamUp({ login: props.login, example: madeUp.value }, me.value, mine, myRoom, notices.sent);
});
// Chat: the first key on anyone but you (chat/chat.ts).
const message = computed(() => messageAction({ isMe: props.isMe }, me.value));
// The free room to offer, when your house has several: the first until you pick another.
const pickedRoom = ref<string | null>(null);
const offered = computed(() => {
  const o = offer.value;
  if (o?.kind !== "invite") return null;
  return pickedRoom.value && o.rooms.includes(pickedRoom.value) ? pickedRoom.value : o.rooms[0];
});
const first = computed(() => props.name.split(" ")[0]);

// Sending an invitation: a sentence once it's sent, or the API's refusal in its own words.
const busy = ref(false);
const said = ref("");
const error = ref("");
async function send(kind: "invite" | "share" | "withdraw") {
  const o = offer.value;
  if (busy.value || !o) return;
  busy.value = true;
  error.value = "";
  said.value = "";
  const sent =
    kind === "invite" && o.kind === "invite"
      ? await inviteToHouse(props.login, o.houseId, offered.value ?? undefined)
      : kind === "share"
        ? await rentTogether(props.login)
        : (o.kind === "invited" || o.kind === "asked") ? await withdrawInvite(o.inviteId) : null;
  busy.value = false;
  if (!sent) return;
  if (!sent.ok) error.value = sent.message;
  else if (kind !== "withdraw") said.value = kind === "invite" ? bw.sentInvite(first.value) : bw.sentRent(first.value);
}
</script>

<template>
  <LobbyCard :label="w.personLabel(name)" :title="name" :close-name="w.close" @close="emit('close')">
    <!-- Their name on GitHub: a link for a real account. A made-up person's handle may be a stranger's, so it's plain. -->
    <template #sub>
      <a v-if="actions.github" class="handle" :href="actions.github" target="_blank" rel="noopener" :aria-label="w.githubName(login)">@{{ login }}</a>
      <template v-else>@{{ login }}</template>
    </template>
    <BadgeChip v-if="badge" class="worn" :badge="badge" />
    <p v-if="where || isMe" class="soft small who">
      <template v-if="where">{{ where }}</template>
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
        <p v-else class="soft small desc">{{ stateWords }}{{ room?.projectDescription ? ` ${sentence(seeded(room.projectDescription))}` : "" }}</p>
      </div>
    </div>

    <!-- Words only when they matter: an invitation just sent, a refusal, an example person (said once, in plain words,
         instead of disabled keys whose reason hides in a hover). -->
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-else-if="said" class="soft small" role="status">{{ said }}</p>
    <p v-else-if="madeUp" class="soft small">{{ w.exampleLine }}</p>

    <div class="menu">
      <!-- Chat first: never missing on someone who isn't you. -->
      <RouterLink v-if="message?.kind === 'login'" to="/login" class="big primary" :aria-label="w.messageLoginName(name)">
        <Icon name="chat" :size="20" /> {{ hw.person.chat }}
      </RouterLink>
      <button v-else-if="message" class="big primary" :aria-label="w.messageName(name)" @click="openChat('dm', { with: login })">
        <Icon name="chat" :size="20" /> {{ hw.person.chat }}
      </button>

      <div v-if="offer?.kind === 'invite' && offer.rooms.length > 1 && !offer.example" class="segmented rooms" role="radiogroup" :aria-label="bw.whichRoom">
        <button v-for="r in offer.rooms" :key="r" type="button" role="radio" :aria-checked="offered === r" @click="pickedRoom = r">
          <Icon name="door" :size="16" />{{ r }}
        </button>
      </div>

      <div v-if="team || actions.see || offer" class="moves">
        <TeamUp v-if="team && myHouse" :state="team" :house-id="myHouse.id" :login="login" :first="first" />
        <button v-else-if="actions.see" class="big move" :aria-label="bw.seeHouseName(actions.see.houseName)" @click="emit('see', actions.see!.houseId)">
          <Icon name="house" :size="20" /> {{ bw.seeHouse }}
        </button>
        <button v-if="offer?.kind === 'invite'" class="big move" :disabled="offer.example || busy" :aria-label="bw.inviteHomeName(offer.houseName)" @click="send('invite')">
          <Icon name="key" :size="20" /> {{ bw.inviteHome(offer.houseName) }}
        </button>
        <button v-else-if="offer?.kind === 'share'" class="big move" :disabled="offer.example || busy" @click="send('share')">
          <Icon name="people" :size="20" /> {{ bw.rentTogether }}
        </button>
        <div v-else-if="offer" class="sent">
          <span class="done"><Icon name="tick" :size="18" /> {{ offer.kind === "invited" ? bw.invited : bw.asked }}</span>
          <button class="big quiet" :disabled="busy" :aria-label="bw.withdrawName" @click="send('withdraw')">{{ bw.withdraw }}</button>
        </div>
      </div>

      <!-- Someone else's real GitHub account. An example person has none (the line above says why). -->
      <a v-if="actions.github && !isMe" class="big move" :href="actions.github" target="_blank" rel="noopener" :aria-label="w.githubName(login)">
        <Icon name="external" :size="18" /> {{ w.github }}
      </a>
    </div>
  </LobbyCard>
</template>

<style scoped>
.who { overflow-wrap: anywhere; }
.worn { justify-self: start; }
/* The honest marker: a quiet word, its sentence on hover and for a screen reader. */
.tag { display: inline-block; margin-left: 6px; padding: 0 6px; border-radius: var(--r-xs); background: var(--fill); color: var(--text); font-size: 14px; font-weight: 800; line-height: 20px; }
/* Their project, as one row: what it's called, whether it's online, and what it does. */
.project { display: flex; gap: 12px; align-items: flex-start; }
.ic { flex: none; width: 36px; height: 36px; display: grid; place-items: center; color: var(--panel); }
.what { flex: 1; min-width: 0; display: grid; gap: 2px; }
.name { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 18px; }
.name strong { font-weight: 800; overflow-wrap: anywhere; }
.desc { display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
/* Their name on GitHub, on the band. */
.handle { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
/* The keys after Chat: side by side when both fit, each stepping back from it. */
.moves { display: flex; flex-wrap: wrap; gap: 8px; }
.moves > * { flex: 1 1 150px; min-width: 0; }
.menu .big.move { padding: 6px 10px; font-size: 15px; text-align: center; }
/* Already invited: the tick and the word, then "Take back" as a ghost. */
.sent { display: flex; align-items: center; gap: 8px; }
.done { flex: 1; display: inline-flex; align-items: center; gap: 8px; min-height: 50px; color: var(--live); font-weight: 800; }
.sent .quiet { flex: none; }
/* Several free rooms: pick the one to offer, above the invitation. */
.rooms { flex-wrap: wrap; }
.rooms > button { flex: 1 1 auto; justify-content: center; }
</style>
