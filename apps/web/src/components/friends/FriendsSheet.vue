<script setup lang="ts">
// The friends list: a white card under the top bar's keys, over whatever page is open. Requests waiting for you
// first (yes or no), then your friends, the most present first, each with a dot on their face (online green, idle
// yellow, away grey, offline dim) and the city they walk in; then the people you added, which you can take back. A
// row opens the conversation with that friend in the chat sheet. A box at the foot adds someone by GitHub username,
// the way every sheet ends; nobody here by that name, it gives the site's address to send them. With no friends, one
// centred line says how. Esc or X closes it.
import { computed, nextTick, ref, watch } from "vue";
import { chatSheet, openChat } from "../../conversations";
import { acceptFriend, askFriend, declineFriend, friends, friendsSheet, loadFriends, removeFriend, takeBackFriend } from "../../friends";
import type { Friend, Person } from "../../types";
import Avatar from "../Avatar.vue";
import Icon from "../lobby/house/Icon.vue";
import ListRow from "../lobby/panel/ListRow.vue";
import { friendWords as w } from "../list/words";
import { addAnswer, connected, inviteLink, sortFriends, statusLine } from "./friends";

const card = ref<HTMLElement | null>(null);
const login = ref("");
const said = ref("");
const error = ref("");
const busy = ref(false);
// The friend whose remove key was pressed once: a second press removes them.
const sure = ref<string | null>(null);
// The login typed isn't anyone here: who, and whether the link to send them was just copied.
const invite = ref<string | null>(null);
const copied = ref(false);
const link = inviteLink(location.origin);

const list = computed(() => sortFriends(friends.friends));
const online = computed(() => connected(friends.friends));
// No friends and nobody waiting on you: one line says how to add someone (what you sent still shows under it).
const empty = computed(() => !friends.friends.length && !friends.requests.length);
const nameOf = (p: Person) => p.name ?? p.login;

// Typing another login puts the link away.
watch(login, () => {
  if (login.value.trim()) invite.value = null;
});

watch(
  () => friendsSheet.open,
  async (open) => {
    said.value = "";
    error.value = "";
    sure.value = null;
    invite.value = null;
    if (!open) return;
    void loadFriends();
    await nextTick();
    card.value?.querySelector<HTMLElement>("input")?.focus();
  },
);

function close() {
  friendsSheet.open = false;
}

// The chat sheet and this card share a corner: one at a time.
watch(
  () => friendsSheet.open,
  (open) => open && (chatSheet.open = false),
);
watch(
  () => chatSheet.open,
  (open) => open && close(),
);

// One request at a time; the API's refusal shows in its own words.
async function run(job: () => Promise<{ ok: boolean; message?: string }>, done = "") {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  said.value = "";
  const sent = await job();
  busy.value = false;
  if (!sent.ok) error.value = sent.message ?? "";
  else said.value = done;
  return sent.ok;
}

async function add() {
  const who = login.value.trim().replace(/^@/, "");
  if (!who || busy.value) return;
  busy.value = true;
  error.value = "";
  said.value = "";
  invite.value = null;
  const answer = addAnswer(who, await askFriend(who));
  busy.value = false;
  if (answer.kind === "error") {
    error.value = answer.text;
    return;
  }
  login.value = "";
  if (answer.kind === "said") said.value = answer.text;
  else {
    invite.value = answer.login;
    copied.value = false;
  }
}

async function copyLink() {
  await navigator.clipboard?.writeText(link).catch(() => undefined);
  copied.value = true;
}

// The conversation with them, in the chat sheet (which takes this card's place).
function message(f: Friend) {
  openChat("dm", { with: f.login });
}

async function remove(f: Friend) {
  if (sure.value !== f.login) {
    sure.value = f.login;
    return;
  }
  sure.value = null;
  await run(() => removeFriend(f.login));
}
</script>

<template>
  <Transition name="pop">
    <section v-if="friendsSheet.open" ref="card" class="friends-sheet sign" role="dialog" :aria-label="w.label" @keydown.esc.stop="close">
      <div class="sign-frame">
        <header class="sign-band">
          <span class="chip"><Icon name="people" :size="22" /></span>
          <h2>{{ w.label }}</h2>
          <p v-if="friends.friends.length" class="sign-sub">{{ w.onlineNow(online) }}.</p>
          <button type="button" class="sign-x" :aria-label="w.close" @click="close"><span aria-hidden="true">X</span></button>
        </header>
        <div class="sign-body body">
          <p v-if="empty && friends.loaded" class="empty">{{ w.empty }}</p>

          <!-- Waiting for you: yes or no. -->
          <section v-if="friends.requests.length" class="group">
            <h3 class="label">{{ w.requestsHead(friends.requests.length) }}</h3>
            <ul class="list">
              <ListRow v-for="r in friends.requests" :key="r.id" :title="nameOf(r.from)" :sub="w.wantsToBeFriends">
                <template #lead><Avatar :person="r.from" :size="40" decorative /></template>
                <template #end>
                  <button type="button" class="yes primary" :disabled="busy" :aria-label="w.acceptName(nameOf(r.from))" @click="run(() => acceptFriend(r.id))">{{ w.accept }}</button>
                  <button type="button" class="key" :disabled="busy" :aria-label="w.declineName(nameOf(r.from))" :title="w.declineName(nameOf(r.from))" @click="run(() => declineFriend(r.id))">
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" /></svg>
                  </button>
                </template>
              </ListRow>
            </ul>
          </section>

          <!-- Your friends: the whole row opens the conversation. -->
          <section v-if="list.length" class="group">
            <h3 class="label">{{ w.friendsHead }}</h3>
            <ul class="list">
              <ListRow v-for="f in list" :key="f.login" :title="nameOf(f)" :sub="statusLine(f)" class="friend" :class="f.status">
                <template #lead>
                  <span class="face">
                    <Avatar :person="f" :size="40" decorative />
                    <span class="dot" :class="f.status" aria-hidden="true" />
                  </span>
                </template>
                <template #end>
                  <button
                    type="button"
                    class="key remove"
                    :class="{ sure: sure === f.login }"
                    :disabled="busy"
                    :aria-label="sure === f.login ? w.removeSure : w.removeName(nameOf(f))"
                    :title="sure === f.login ? w.removeSure : w.removeName(nameOf(f))"
                    @click="remove(f)"
                  >
                    <span v-if="sure === f.login" class="word">{{ w.removeSure }}</span>
                    <Icon v-else name="trash" :size="18" />
                  </button>
                  <button type="button" class="key open" :aria-label="w.messageName(nameOf(f))" :title="w.messageName(nameOf(f))" @click="message(f)">
                    <Icon name="chat" :size="18" />
                  </button>
                </template>
              </ListRow>
            </ul>
          </section>

          <!-- Yours, still waiting: take one back. -->
          <section v-if="friends.sent.length" class="group">
            <h3 class="label">{{ w.sentHead }}</h3>
            <ul class="list">
              <ListRow v-for="s in friends.sent" :key="s.id" :title="nameOf(s.to)" :sub="w.waitingYes" class="asked">
                <template #lead><Avatar :person="s.to" :size="40" decorative /></template>
                <template #end>
                  <button type="button" class="key" :disabled="busy" :aria-label="w.takeBackName(nameOf(s.to))" :title="w.takeBackName(nameOf(s.to))" @click="run(() => takeBackFriend(s.id))">
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" /></svg>
                  </button>
                </template>
              </ListRow>
            </ul>
          </section>

          <p v-if="error" class="error small" role="alert">{{ error }}</p>
          <p v-else-if="said" class="soft small" role="status">{{ said }}</p>
          <!-- Nobody here by that login: the site's address, to send them. -->
          <div v-else-if="invite" class="invite" role="status">
            <p class="small">{{ w.notHere(invite) }}</p>
            <div class="invite-row">
              <input :value="link" readonly :aria-label="w.inviteLink" @focus="($event.target as HTMLInputElement).select()" />
              <button type="button" class="key copy" @click="copyLink">
                <Icon :name="copied ? 'tick' : 'copy'" :size="18" /><span class="word">{{ copied ? w.copied : w.copy }}</span>
              </button>
            </div>
          </div>
          <form class="add" @submit.prevent="add">
            <input v-model="login" type="text" :placeholder="w.addPlaceholder" :aria-label="w.addLabel" maxlength="60" autocomplete="off" autocapitalize="off" spellcheck="false" />
            <button type="submit" class="primary" :disabled="busy || !login.trim()">{{ w.add }}</button>
          </form>
        </div>
      </div>
    </section>
  </Transition>
</template>

<style scoped>
/* A white card on the right, under the keys, as tall as what's in it: a normal list never scrolls. */
.friends-sheet {
  position: fixed;
  top: 98px;
  right: 24px;
  z-index: 56;
  width: min(420px, calc(100vw - 32px));
  max-height: min(680px, calc(100dvh - 120px));
  display: flex;
  flex-direction: column;
  color: var(--text);
}
.body { display: flex; flex-direction: column; gap: 14px; overflow-y: auto; overscroll-behavior: contain; }
.group { display: grid; gap: 2px; }
.add { flex: none; display: flex; gap: 8px; }
.add input { flex: 1; min-width: 0; }
.add .primary { flex: none; width: 120px; }
/* No friends yet: one small centred line, the box under it does the rest. */
.empty { margin: 0; padding: 18px 12px 6px; text-align: center; font: 600 14px/20px var(--font); color: var(--muted); text-wrap: balance; }
/* The link to send someone who isn't here: the address, read-only, and its copy key. */
.invite { display: grid; gap: 8px; }
.invite p { margin: 0; color: var(--muted); }
.invite-row { display: flex; gap: 8px; }
.invite-row input { flex: 1; min-width: 0; font: 500 14px/1 var(--code); color: var(--text); }
.key.copy { width: auto; height: auto; align-self: stretch; padding: 0 14px 3px !important; font-size: 14px; font-weight: 800; }
.list { list-style: none; margin: 0; padding: 0 4px; display: grid; }
.list :deep(.list-row) { min-height: 56px; gap: 12px; }
.list :deep(.list-row .title) { font-size: 15px; }
.list :deep(.list-row .sub) { font-size: 13px; font-weight: 600; }
.list :deep(.list-row .end) { gap: 6px; }
/* A row's keys: small grey keys with their lip, an icon each. The yes is a word, the row's main button. */
.key { display: inline-flex; align-items: center; justify-content: center; gap: 6px; width: 40px; min-width: 40px; height: 40px; min-height: 0 !important; padding: 0 0 3px !important; border-radius: 10px; background: var(--sunken); box-shadow: inset 0 -3px 0 var(--quiet-lip); color: var(--text); }
.key:hover:not(:disabled) { background: var(--fill); }
.yes { min-height: 40px !important; padding: 0 14px 3px !important; border-radius: 10px !important; font-size: 14px !important; --lip: 3px; }
.key.sure { width: auto; padding: 0 10px 3px !important; background: var(--accent-soft); color: var(--accent); box-shadow: none; font-size: 14px; font-weight: 800; }
/* The remove key waits behind the row: it shows under the pointer or the keyboard, never in the way of reading. */
.friend .remove:not(.sure) { opacity: 0; }
.friend:hover .remove, .friend:focus-within .remove { opacity: 1; }
/* The face, with the status dot on its corner. */
.face { position: relative; display: block; width: 40px; height: 40px; }
.dot { position: absolute; right: -3px; bottom: -3px; width: 12px; height: 12px; border-radius: 50%; box-shadow: 0 0 0 2px var(--surface); }
.dot.online { background: var(--live); }
.dot.idle { background: var(--sticker); }
.dot.away { background: var(--muted); }
.dot.offline { background: var(--line); }
/* Offline friends and requests you sent step back. */
.friend.offline :deep(.avatar), .asked :deep(.avatar) { opacity: 0.5; }
.friend.offline :deep(.title), .asked :deep(.title) { color: var(--muted); }
/* The whole row opens the conversation, not only its key; the remove key stays on top. */
.friend { position: relative; cursor: pointer; }
.friend .open::after { content: ""; position: absolute; inset: 0; }
.friend .remove { position: relative; z-index: 1; }
.pop-enter-active { transition: opacity var(--dur) var(--ease), transform var(--dur-slow) var(--ease-pop); }
.pop-leave-active { transition: opacity var(--dur-fast) var(--ease); }
.pop-enter-from { opacity: 0; transform: translateY(-6px); }
.pop-leave-to { opacity: 0; }
/* A phone: a sheet along the bottom edge. */
@media (max-width: 520px) {
  .friends-sheet { top: auto; bottom: 0; right: 0; left: 0; width: 100%; max-height: 86dvh; }
  .pop-enter-from { transform: translateY(12px); }
  .friend .remove:not(.sure) { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .pop-enter-active, .pop-leave-active { transition: none; }
}
</style>
