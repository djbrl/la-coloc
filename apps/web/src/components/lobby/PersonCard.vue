<script setup lang="ts">
// Someone you met in the street: who they are and where they live (the line under the name), what they build (and
// whether it's online, as a quiet symbol), and what you can do about it. Message is the main button, on everyone but you: a direct conversation in the chat sheet (messageAction in
// chat/chat.ts). Logged out, it takes you to log in. For a made-up person (a seeded flatmate, or a passer-by the lobby
// invents) it's there but off, and one plain line says why. Then at most two more keys (streetActions in
// personActions.ts): see their house beside Message, and invite them to yours or ask them to share one. The friend key
// and their GitHub profile come last, as quiet words. A real GitHub account's name is a link to their profile.
import { computed, ref } from "vue";
import { openChat } from "../../conversations";
import { acceptFriend, askFriend, friends, friendsSheet, takeBackFriend } from "../../friends";
import { friendKey } from "../friends/friends";
import { friendWords as fw } from "../list/words";
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
import { roomLine, roomState } from "./panel/words";
import { streetActions } from "./personActions";
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
// The project's state as a quiet symbol: online (a tick), down (a cross), anything else a small grey dot.
const mark = computed(() => (state.value?.tone === "live" ? "ok" : state.value?.tone === "danger" ? "fail" : "none"));
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

// The friend key beside Chat (friends/friends.ts): add them, say yes to their request, take yours back, or open the
// friends list when you're friends already.
const friend = computed(() => friendKey({ login: props.login, isMe: props.isMe, example: madeUp.value }, me.value, friends));
// The friend key's word: what pressing it does, or that you're friends already.
const friendWord = computed(() => {
  const k = friend.value;
  if (!k) return "";
  return k.kind === "friends" ? fw.youreFriends : k.kind === "asked" ? fw.asked : k.kind === "accept" ? fw.acceptWord : fw.addWord;
});
const friendName = computed(() => {
  const k = friend.value;
  if (!k) return "";
  return k.kind === "friends" ? fw.isFriend(props.name) : k.kind === "asked" ? fw.askedName(props.name) : k.kind === "accept" ? fw.acceptName(props.name) : fw.addName(props.name);
});
async function friendAct() {
  const k = friend.value;
  if (busy.value || !k) return;
  if (k.kind === "friends") {
    friendsSheet.open = true;
    return;
  }
  busy.value = true;
  error.value = "";
  said.value = "";
  const sent = k.kind === "add" ? await askFriend(props.login) : k.kind === "accept" ? await acceptFriend(k.id) : await takeBackFriend(k.id);
  busy.value = false;
  if (!sent.ok) error.value = sent.message;
  else if (k.kind === "add") said.value = fw.sentTo(props.login);
}

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
  <LobbyCard :label="w.personLabel(name)" :title="name" icon="people" :close-name="w.close" @close="emit('close')">
    <!-- Their name on GitHub (a link for a real account; a made-up person's handle may be a stranger's, so it's plain),
         then where they live. -->
    <template #sub>
      <a v-if="actions.github" class="handle" :href="actions.github" target="_blank" rel="noopener" :aria-label="w.githubName(login)">@{{ login }}</a>
      <template v-else>@{{ login }}</template>
      <template v-if="where"> · {{ where }}</template>
      <template v-if="isMe">{{ w.thatsYou }}</template>
    </template>
    <!-- The title they wear, and an example person said once, in plain words, instead of disabled keys whose reason
         hides in a hover. -->
    <div v-if="badge || (madeUp && !error && !said)" class="marks">
      <BadgeChip v-if="badge" class="worn" :badge="badge" />
      <span v-if="madeUp && !error && !said" class="soft small">{{ w.exampleLine }}</span>
    </div>

    <!-- What they build: the project's name and its state, and a line from them about it, on a soft tile. -->
    <div v-if="home" class="project">
      <span class="ic" aria-hidden="true"><Icon name="box" :size="20" /></span>
      <div class="what">
        <p class="name">
          <strong>{{ project ?? w.room(home.room) }}</strong>
          <span v-if="state && project" class="status-mark" :class="mark" role="img" :aria-label="state.word">
            <Icon v-if="mark === 'ok'" name="tick" :size="10" />
            <svg v-else-if="mark === 'fail'" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" /></svg>
          </span>
        </p>
        <p v-if="!project" class="soft desc">{{ w.nothingOnline }}</p>
        <p v-else class="soft desc">{{ stateWords }}{{ room?.projectDescription ? ` ${sentence(seeded(room.projectDescription))}` : "" }}</p>
      </div>
    </div>

    <!-- Words only when they matter: an invitation just sent, a refusal. -->
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-else-if="said" class="soft small" role="status">{{ said }}</p>

    <div class="menu">
      <!-- Their house beside Message, the main button: never missing on someone who isn't you. -->
      <div v-if="message || actions.see" class="pair">
        <button v-if="actions.see" class="big move" :aria-label="bw.seeHouseName(actions.see.houseName)" @click="emit('see', actions.see!.houseId)">
          {{ bw.seeHouse }}
        </button>
        <template v-if="message">
          <RouterLink v-if="message.kind === 'login'" to="/login" class="big primary talk" :aria-label="w.messageLoginName(name)">
            <Icon name="chat" :size="20" /> {{ w.write }}
          </RouterLink>
          <button v-else class="big primary talk" :aria-label="w.messageName(name)" @click="openChat('dm', { with: login })">
            <Icon name="chat" :size="20" /> {{ w.write }}
          </button>
        </template>
      </div>

      <div v-if="offer?.kind === 'invite' && offer.rooms.length > 1 && !offer.example" class="segmented rooms" role="radiogroup" :aria-label="bw.whichRoom">
        <button v-for="r in offer.rooms" :key="r" type="button" role="radio" :aria-checked="offered === r" @click="pickedRoom = r">
          <Icon name="door" :size="16" />{{ r }}
        </button>
      </div>

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

      <!-- Last, as quiet words: the friend key, and someone else's real GitHub account. -->
      <div v-if="friend || (actions.github && !isMe)" class="quiet-row">
        <button v-if="friend" type="button" class="word-key" :class="friend.kind" :disabled="busy" :aria-label="friendName" :title="friendName" @click="friendAct">
          <Icon :name="friend.kind === 'asked' ? 'tick' : friend.kind === 'friends' ? 'people' : 'addFriend'" :size="18" />{{ friendWord }}
        </button>
        <a v-if="actions.github && !isMe" class="word-key" :href="actions.github" target="_blank" rel="noopener" :aria-label="w.githubName(login)">
          <Icon name="external" :size="16" />{{ w.github }}
        </a>
      </div>
    </div>
  </LobbyCard>
</template>

<style scoped>
.worn { flex: none; }
.marks { display: flex; align-items: center; gap: 8px; min-width: 0; }
/* Their project, as one row on a soft tile: an icon, its name and state, and what it does on one line. */
.project { display: flex; gap: 12px; align-items: center; padding: 10px 12px; border-radius: var(--tile-r); background: var(--tile); }
.ic { flex: none; width: 40px; height: 40px; display: grid; place-items: center; border-radius: 12px; background: var(--sunken); color: var(--text); }
.what { flex: 1; min-width: 0; display: grid; gap: 1px; }
.card .name { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 15px; line-height: 20px; }
.name strong { min-width: 0; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.name .status-mark { width: 16px; height: 16px; }
.name .status-mark svg { width: 10px; height: 10px; }
.card .desc, .desc { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Their name on GitHub, in the head's line. */
.handle { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
/* Their house and Message side by side, Message the wider. */
.pair { display: flex; gap: 10px; }
.pair > * { flex: 1 1 0; min-width: 0; }
.pair > .talk { flex-grow: 1.1; }
.menu .big.move { padding: 0 12px var(--lip); font-size: 15px; text-align: center; }
/* Already invited: the tick and the word, then "Take back" in grey. */
.sent { display: flex; align-items: center; gap: 8px; }
.done { flex: 1; display: inline-flex; align-items: center; gap: 8px; min-height: 48px; color: var(--live); font-weight: 800; }
.sent .quiet { flex: none; }
/* Several free rooms: pick the one to offer, above the invitation. */
.rooms { flex-wrap: wrap; }
.rooms > button { flex: 1 1 auto; justify-content: center; }
/* The quiet words at the foot: an icon and a word, muted, no button around them. */
.quiet-row { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 18px; }
.word-key { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 40px; padding: 0 6px; border-radius: 10px; background: none; box-shadow: none; color: var(--muted); font: 800 14px/1.2 var(--display); text-decoration: none; }
.word-key:hover:not(:disabled) { background: var(--tile); color: var(--text); text-decoration: none; }
.word-key.friends, .word-key.asked { color: var(--live); }
.word-key.accept { color: var(--accent); }
</style>
