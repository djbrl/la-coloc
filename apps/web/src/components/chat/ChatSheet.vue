<script setup lang="ts">
// The chat sheet: one flat floating card over the city (docked on the right on a wide screen, a sheet along the
// bottom on a phone), so talking never leaves the game. Four tabs, as icon keys: your direct messages, the city's
// room, the city's board, and your house's living room. Visitors get the city's room and board, to read.
// Esc (or the close key) closes it; the city keeps going behind it.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { chatSheet, conversations, loadBlocks, loadConversations } from "../../conversations";
import { me } from "../../session";
import CityBoard from "./CityBoard.vue";
import CityRoom from "./CityRoom.vue";
import { badge, type ChatTab, chatTabs, pickTab } from "./chat";
import DirectMessages from "./DirectMessages.vue";
import HouseRoom from "./HouseRoom.vue";
import { chatWords as w } from "./words";

const tabs = computed(() => chatTabs(me.value));
const tab = computed(() => pickTab(chatSheet.tab, tabs.value));
const sheet = ref<HTMLElement | null>(null);

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
onBeforeUnmount(() => document.removeEventListener("visibilitychange", onVisible));
</script>

<template>
  <Transition name="pop">
    <section v-if="chatSheet.open" ref="sheet" class="chat-sheet sign black" role="dialog" :aria-label="w.label" @keydown.esc.stop="close">
      <div class="sign-frame">
        <header class="sign-band">
          <h2>{{ w.label }}</h2>
          <!-- The city the City and Board tabs are about. -->
          <p v-if="tab === 'city' || tab === 'board'" class="sign-sub">{{ chatSheet.city }}</p>
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
              {{ w.tabs[t] }}
              <span v-if="t === 'dm' && conversations.unread" class="tab-count" aria-hidden="true">{{ badge(conversations.unread) }}</span>
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
/* A black sign on the right, under the keys: the city stays in view on its left. Above a house's window (60): a chat
   opened from inside one (a flatmate's Chat key) shows over it, instead of waiting hidden behind it until the window
   closes (Jib, 6 11). Opening a window closes the chat (LobbyView). */
.chat-sheet {
  position: fixed;
  top: 98px;
  right: 24px;
  z-index: 62;
  width: min(420px, calc(100vw - 32px));
  height: min(640px, calc(100dvh - 122px));
}
.inner { display: flex; flex-direction: column; gap: 10px; }
/* The tabs: words on the white, the chosen one on ink. */
.tabs { flex: none; display: flex; gap: 4px; min-width: 0; }
.tab { flex: 1 1 auto; position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 46px; padding: 0 6px; border-radius: var(--r-sm); background: none; color: var(--text); font: 800 15px/1 var(--font); white-space: nowrap; }
.tab:hover:not(:disabled) { background: var(--tile); }
.tab[aria-selected="true"], .tab[aria-selected="true"]:hover:not(:disabled) { background: var(--text); color: var(--surface); }
.tab:focus-visible { outline-offset: 1px; }
.tab-count { min-width: 20px; height: 20px; padding: 0 5px; border-radius: 10px; background: var(--sticker); color: var(--ink); font: 800 13px/20px var(--font); text-align: center; }
.body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
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
