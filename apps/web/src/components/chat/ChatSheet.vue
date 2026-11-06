<script setup lang="ts">
// The chat sheet: one flat floating card over the city (docked on the right on a wide screen, a sheet along the
// bottom on a phone), so talking never leaves the game. Four tabs on one grey rail: your direct messages, the city's
// room, the city's board, and your house's living room. Visitors get the city's room and board, to read. A tab with
// something unread or new since you looked (cityNews.ts) has a small red dot after its word, never a count on a chip.
// Esc (or the close key) closes it; the city keeps going behind it.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { cityNews, followCityNews } from "../../cityNews";
import { chatSheet, conversations, loadBlocks, loadConversations } from "../../conversations";
import { me } from "../../session";
import CityBoard from "./CityBoard.vue";
import CityRoom from "./CityRoom.vue";
import Icon from "../lobby/house/Icon.vue";
import { type ChatTab, chatTabs, pickTab, shownNews } from "./chat";
import DirectMessages from "./DirectMessages.vue";
import HouseRoom from "./HouseRoom.vue";
import { chatWords as w } from "./words";

const tabs = computed(() => chatTabs(me.value));
const tab = computed(() => pickTab(chatSheet.tab, tabs.value));
const sheet = ref<HTMLElement | null>(null);
const news = computed(() => shownNews(cityNews, chatSheet));
const stopNews = followCityNews();
// The line under the title says what the chosen tab holds: yours, the city's room or board, or the house's.
const sub = computed(() =>
  tab.value === "dm" ? w.subDm : tab.value === "city" ? `${w.cityTitle(chatSheet.city)}.` : tab.value === "board" ? `${w.boardTitle(chatSheet.city)}.` : w.subHouse,
);
// Something waits behind a tab: what you haven't read, or what's new in the city.
const waits = (t: ChatTab) => (t === "dm" ? conversations.unread > 0 : t === "city" ? news.value.chat > 0 : t === "board" ? news.value.board > 0 : false);

// Opened: the tab holding the keyboard, so Esc and the arrows work at once (a conversation focuses its own box).
watch(
  () => chatSheet.open,
  async (open) => {
    if (!open) return;
    void loadConversations();
    void loadBlocks();
    await nextTick();
    if (!sheet.value?.contains(document.activeElement)) sheet.value?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
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

// Logged in or out: the conversations follow, and a visitor's sheet falls back to the city.
watch(
  () => me.value?.login,
  () => void loadConversations(),
  { immediate: true },
);
const onVisible = () => document.visibilityState === "visible" && void loadConversations();
onMounted(() => document.addEventListener("visibilitychange", onVisible));
onBeforeUnmount(() => {
  document.removeEventListener("visibilitychange", onVisible);
  stopNews();
});
</script>

<template>
  <Transition name="pop">
    <section v-if="chatSheet.open" ref="sheet" class="chat-sheet sign" role="dialog" :aria-label="w.label" @keydown.esc.stop="close">
      <div class="sign-frame">
        <header class="sign-band">
          <span class="chip"><Icon name="chat" :size="22" /></span>
          <h2>{{ w.label }}</h2>
          <!-- What the chosen tab holds, and the city the City and Board tabs are about. -->
          <p class="sign-sub">{{ sub }}</p>
          <button type="button" class="sign-x" :aria-label="w.close" @click="close"><span aria-hidden="true">X</span></button>
        </header>
        <div class="sign-body inner">
          <div class="tabs" role="tablist" :aria-label="w.label" @keydown="tabKey">
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
          <div class="body" role="tabpanel" :aria-label="w.tabs[tab]">
            <DirectMessages v-if="tab === 'dm'" />
            <CityRoom v-else-if="tab === 'city'" />
            <CityBoard v-else-if="tab === 'board'" />
            <HouseRoom v-else />
          </div>
        </div>
      </div>
    </section>
  </Transition>
</template>

<style scoped>
/* A white card on the right, under the keys: the city stays in view on its left. As tall as what's in it, up to most
   of the window; a long conversation scrolls inside itself. Above a house's window (60): a chat opened from inside one
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
  max-height: min(640px, calc(100dvh - 122px));
}
.chat-sheet > .sign-frame { flex: 1 1 auto; min-height: 0; height: auto; }
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
.pop-enter-active { transition: opacity var(--dur) var(--ease), transform var(--dur-slow) var(--ease-pop); }
.pop-leave-active { transition: opacity var(--dur-fast) var(--ease); }
.pop-enter-from { opacity: 0; transform: translateY(-6px); }
.pop-leave-to { opacity: 0; }
/* A phone: a sheet along the bottom edge, most of the screen's height. */
@media (max-width: 520px) {
  .chat-sheet { top: auto; bottom: 0; right: 0; left: 0; width: 100%; max-height: 86dvh; }
  .pop-enter-from { transform: translateY(12px); }
}
@media (prefers-reduced-motion: reduce) {
  .pop-enter-active, .pop-leave-active { transition: none; }
}
</style>
