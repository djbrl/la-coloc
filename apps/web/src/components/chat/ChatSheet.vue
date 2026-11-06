<script setup lang="ts">
// The chat sheet: one flat floating card over the city (docked on the right on a wide screen, a sheet along the
// bottom on a phone), so talking never leaves the game. Your own conversations only: direct messages, and your
// house's living room once you have a house (two tabs on one grey rail, a small red dot after a tab's word when
// something is unread). The city's room and its posts are on the city board, in the market square (Jib, 6 11). A
// visitor is asked to log in. Esc (or the close key) closes it; the city keeps going behind it.
//
// An open conversation takes the whole card: its header becomes the way back, who it's with, and their "…" (Add as
// friend, Mute, Block, Report: ChatOptions.vue); the House tab's header has the house chat's "…" (Mute, Report). The
// card is always its full height, so it never jumps when messages load or a line like "Slow down" appears.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { boardSheet, chatPing, chatSheet, conversations, loadConversations, loadSafety, openConversation } from "../../conversations";
import { me } from "../../session";
import Avatar from "../Avatar.vue";
import BadgeChip from "../arena/BadgeChip.vue";
import Icon from "../lobby/house/Icon.vue";
import { type ChatTab, chatTabs, pickTab } from "./chat";
import ChatOptions from "./ChatOptions.vue";
import DirectMessages from "./DirectMessages.vue";
import HouseRoom from "./HouseRoom.vue";
import { chatWords as w } from "./words";

const tabs = computed(() => chatTabs(me.value));
const tab = computed(() => pickTab(chatSheet.tab, tabs.value));
const sheet = ref<HTMLElement | null>(null);
// A conversation is open: the header is about it.
const talking = computed(() => !!me.value && tab.value === "dm" && !!chatSheet.with);
// Who with: what the conversation said once fetched, the login until then.
const other = computed(() => {
  const c = openConversation.value;
  return c && c.with.login === chatSheet.with ? c.with : null;
});
const otherName = computed(() => other.value?.name ?? other.value?.login ?? chatSheet.with ?? "");
// The house shown on the House tab (HouseRoom.vue says), for its "…".
const house = ref<{ id: string; name: string } | null>(null);

async function back() {
  chatSheet.with = null;
  await nextTick();
  sheet.value?.querySelector<HTMLElement>(".lines button")?.focus();
}
// The line under the title says what the chosen tab holds.
const sub = computed(() => (tab.value === "dm" ? w.subDm : w.subHouse));
// Something waits behind a tab: what you haven't read.
const waits = (t: ChatTab) => t === "dm" && conversations.unread > 0;

// Opened: the tab holding the keyboard, so Esc and the arrows work at once (a conversation focuses its own box). The
// city board's window closes: both dock in the same place.
watch(
  () => chatSheet.open,
  async (open) => {
    if (!open) return;
    boardSheet.open = false;
    void loadConversations();
    void loadSafety();
    await nextTick();
    if (!sheet.value?.contains(document.activeElement)) sheet.value?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"], a, button:not(.sign-x)')?.focus();
  },
);

function close() {
  chatSheet.open = false;
}

// Left and right move between the tabs, as in any tab list.
function tabKey(e: KeyboardEvent) {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  const i = tabs.value.indexOf(tab.value);
  const next = tabs.value[(i + (e.key === "ArrowRight" ? 1 : tabs.value.length - 1)) % tabs.value.length];
  chatSheet.tab = next;
  void nextTick(() => sheet.value?.querySelector<HTMLElement>(`[data-tab="${next}"]`)?.focus());
}

// Logged in or out: the conversations follow.
watch(
  () => me.value?.login,
  () => void loadConversations(),
  { immediate: true },
);
const onVisible = () => document.visibilityState === "visible" && void loadConversations();
onMounted(() => document.addEventListener("visibilitychange", onVisible));
onBeforeUnmount(() => document.removeEventListener("visibilitychange", onVisible));
</script>

<template>
  <Transition name="pop">
    <section v-if="chatSheet.open" ref="sheet" class="chat-sheet sign" role="dialog" :aria-label="w.label" @keydown.esc.stop="close">
      <div class="sign-frame">
        <!-- A conversation: the way back, who with, and their options. -->
        <header v-if="talking" class="sign-band convo">
          <button type="button" class="back-key" :aria-label="w.back" :title="w.back" @click="back"><Icon name="back" :size="20" /></button>
          <Avatar v-if="other" :person="other" :size="36" decorative />
          <h2 :title="otherName">{{ otherName }}</h2>
          <BadgeChip v-if="other?.badge" class="worn" compact :badge="other.badge" />
          <ChatOptions v-if="other && !other.example" :person="{ login: other.login, name: other.name }" @changed="chatPing++" />
          <button type="button" class="sign-x" :aria-label="w.close" @click="close"><span aria-hidden="true">X</span></button>
        </header>
        <header v-else class="sign-band" :class="{ 'has-options': me && tab === 'house' && house }">
          <span class="chip"><Icon name="chat" :size="22" /></span>
          <h2>{{ w.label }}</h2>
          <p class="sign-sub">{{ sub }}</p>
          <ChatOptions v-if="me && tab === 'house' && house" class="band-options" :group="{ channel: `house:${house.id}`, name: house.name }" />
          <button type="button" class="sign-x" :aria-label="w.close" @click="close"><span aria-hidden="true">X</span></button>
        </header>
        <div class="sign-body inner">
          <!-- One tab is no choice: the rail shows only with your house's tab beside your messages, and not while a
               conversation is open. -->
          <div v-if="tabs.length > 1 && !talking" class="tabs" role="tablist" :aria-label="w.label" @keydown="tabKey">
            <button
              v-for="t in tabs"
              :key="t"
              type="button"
              role="tab"
              class="tab"
              :data-tab="t"
              :aria-selected="tab === t"
              :tabindex="tab === t ? 0 : -1"
              :title="w.tabs[t]"
              @click="chatSheet.tab = t"
            >
              <span class="word">{{ w.tabs[t] }}</span>
              <span v-if="waits(t)" class="tab-dot" aria-hidden="true" />
            </button>
          </div>
          <div class="body" :role="tabs.length > 1 && !talking ? 'tabpanel' : undefined" :aria-label="tabs.length > 1 && !talking ? w.tabs[tab] : undefined">
            <p v-if="!me" class="visitor">
              <span class="soft">{{ w.logInToChat }}</span>
              <RouterLink class="button primary" to="/login" @click="close">{{ w.logIn }}</RouterLink>
            </p>
            <DirectMessages v-else-if="tab === 'dm'" />
            <HouseRoom v-else @house="(h) => (house = h)" />
          </div>
        </div>
      </div>
    </section>
  </Transition>
</template>

<style scoped>
/* A white card on the right, under the keys: the city stays in view on its left. Its full height from the start, so
   it never grows when messages load or an error line appears; a long conversation scrolls inside itself. Above a
   house's window (60): a chat opened from inside one
   (a flatmate's Chat key) shows over it, instead of waiting hidden behind it until the window closes (Jib, 6 11).
   Opening a window closes the chat (LobbyView). */
.chat-sheet {
  position: fixed;
  top: 98px;
  right: 24px;
  z-index: 62;
  display: flex;
  flex-direction: column;
  width: min(420px, calc(100vw - 32px));
  height: min(640px, calc(100dvh - 122px));
}
.chat-sheet > .sign-frame { flex: 1 1 auto; min-height: 0; height: auto; }
/* A conversation's header: the way back, their face and name, their "…", then the close key. */
.convo { display: flex; align-items: center; gap: 10px; }
.convo > h2 { flex: 0 1 auto; min-width: 0; padding-top: 0; }
.convo > .worn { flex: none; }
.convo > :deep(.options) { margin-left: auto; }
.back-key { flex: none; display: grid; place-items: center; width: 40px; height: 40px; min-height: 0; padding: 0; border-radius: 12px; background: var(--sunken); color: var(--text); box-shadow: none; }
.back-key:hover:not(:disabled) { background: var(--fill); }
/* The House tab's "…", left of the close key. */
.has-options { padding-right: 120px; }
.band-options { position: absolute; top: 20px; right: 68px; }
.inner { display: flex; flex-direction: column; gap: 12px; }
/* The tabs: one control, a grey rail, the chosen tab lifted out in white. */
.tabs { flex: none; display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 4px; padding: 4px; min-width: 0; border-radius: var(--tile-r); background: var(--sunken); }
.tab { min-width: 0; display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 40px; padding: 0 6px; border-radius: 10px; background: transparent; color: var(--muted); box-shadow: none; font: 800 15px/1 var(--font); white-space: nowrap; }
.tab:hover:not(:disabled) { background: transparent; color: var(--text); }
.tab[aria-selected="true"], .tab[aria-selected="true"]:hover:not(:disabled) { background: var(--surface); color: var(--text); box-shadow: 0 2px 0 rgba(23, 21, 26, 0.14); }
.tab:focus-visible { outline-offset: -3px; }
.word { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
/* Something waits there: a small red dot after the word. */
.tab-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
.body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
/* Logged out: one plain line, and the way to log in. */
.visitor { display: grid; gap: 12px; margin: 0; font-weight: 600; }
.pop-enter-active { transition: opacity var(--dur) var(--ease), transform var(--dur-slow) var(--ease-pop); }
.pop-leave-active { transition: opacity var(--dur-fast) var(--ease); }
.pop-enter-from { opacity: 0; transform: translateY(-6px); }
.pop-leave-to { opacity: 0; }
/* A phone: a sheet along the bottom edge, most of the screen's height. */
@media (max-width: 520px) {
  .chat-sheet { top: auto; bottom: 0; right: 0; left: 0; width: 100%; height: 86dvh; }
  .pop-enter-from { transform: translateY(12px); }
}
@media (prefers-reduced-motion: reduce) {
  .pop-enter-active, .pop-leave-active { transition: none; }
}
</style>
