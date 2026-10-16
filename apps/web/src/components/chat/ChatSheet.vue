<script setup lang="ts">
// The chat sheet: one flat floating card over the city (docked on the right on a wide screen, a sheet along the
// bottom on a phone), so talking never leaves the game. Four tabs, as icon keys: your direct messages, the city's
// room, the city's board, and your house's living room. Visitors get the city's room and board, to read.
// Esc (or the close key) closes it; the city keeps going behind it.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { chatSheet, conversations, loadBlocks, loadConversations } from "../../conversations";
import { me } from "../../session";
import Icon from "../lobby/house/Icon.vue";
import type { IconName } from "../lobby/house/icons";
import CityBoard from "./CityBoard.vue";
import CityRoom from "./CityRoom.vue";
import { badge, type ChatTab, chatTabs, pickTab } from "./chat";
import DirectMessages from "./DirectMessages.vue";
import HouseRoom from "./HouseRoom.vue";
import { chatWords as w } from "./words";

const tabs = computed(() => chatTabs(me.value));
const tab = computed(() => pickTab(chatSheet.tab, tabs.value));
const icons: Record<ChatTab, IconName> = { dm: "chat", city: "globe", board: "board", house: "house" };
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
    <section v-if="chatSheet.open" ref="sheet" class="chat-sheet" role="dialog" :aria-label="w.label" @keydown.esc.stop="close">
      <div class="top">
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
            <Icon :name="icons[t]" :size="18" />
            <!-- The chosen tab says its name; the others are icons, named for screen readers. -->
            <span :class="tab === t ? 'word' : 'sr-only'">{{ w.tabs[t] }}</span>
            <span v-if="t === 'dm' && conversations.unread" class="tab-count" aria-hidden="true">{{ badge(conversations.unread) }}</span>
          </button>
        </div>
        <span v-if="tab === 'city' || tab === 'board'" class="where">{{ chatSheet.city }}</span>
        <button type="button" class="x" :aria-label="w.close" @click="close">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" /></svg>
        </button>
      </div>
      <div class="body" role="tabpanel" :aria-label="w.tabs[tab]">
        <DirectMessages v-if="tab === 'dm'" />
        <CityRoom v-else-if="tab === 'city'" />
        <CityBoard v-else-if="tab === 'board'" />
        <HouseRoom v-else />
      </div>
    </section>
  </Transition>
</template>

<style scoped>
/* A flat card on the right, under the top bar: the city stays in view on its left. */
.chat-sheet {
  position: fixed;
  top: 60px;
  right: 16px;
  z-index: 55;
  width: min(420px, calc(100vw - 32px));
  height: min(640px, calc(100dvh - 80px));
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 14px 14px;
  border-radius: var(--r-xl);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
}
.top { flex: none; display: flex; align-items: center; gap: 8px; }
/* The tabs: icon keys on a sunken track; the chosen one lifted, with its name. */
.tabs { display: flex; gap: 2px; padding: 3px; border-radius: var(--r-md); background: var(--fill); min-width: 0; }
.tab { position: relative; display: inline-flex; align-items: center; gap: 6px; min-height: 34px; min-width: 38px; padding: 0 10px; justify-content: center; border-radius: var(--r-sm); background: none; color: var(--muted); font-size: 14px; font-weight: 700; box-shadow: none; white-space: nowrap; }
.tab:hover:not(:disabled) { background: none; color: var(--text); }
.tab[aria-selected="true"] { background: var(--surface); color: var(--text); box-shadow: 0 0 0 1px var(--hairline), 0 1px 0 var(--line-strong); }
.tab:focus-visible { outline: 3px solid var(--accent-fill); outline-offset: 1px; }
.tab-count { position: absolute; top: -4px; right: -4px; min-width: 16px; height: 16px; padding: 0 4px; border-radius: var(--r-pill); background: var(--accent-fill); color: var(--on-accent); font: 700 10px/16px var(--font); text-align: center; box-shadow: 0 0 0 2px var(--fill); }
/* The city the City and Board tabs are about, in the display face. */
.where { flex: 1; min-width: 0; font: 800 17px/1.1 var(--display); letter-spacing: -0.02em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right; }
.x { flex: none; margin-left: auto; width: 32px; height: 32px; min-height: 0; padding: 0; display: grid; place-items: center; border-radius: var(--r-sm); background: none; color: var(--muted); box-shadow: inset 0 0 0 1px var(--line); }
.where + .x { margin-left: 0; }
.x:hover:not(:disabled) { background: var(--fill-hover); color: var(--text); }
.body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.pop-enter-active { transition: opacity var(--dur) var(--ease), transform var(--dur-slow) var(--ease-pop); }
.pop-leave-active { transition: opacity var(--dur-fast) var(--ease); }
.pop-enter-from { opacity: 0; transform: translateY(-6px); }
.pop-leave-to { opacity: 0; }
/* A phone: a sheet along the bottom edge, most of the screen's height. */
@media (max-width: 520px) {
  .chat-sheet { top: auto; bottom: 0; right: 0; left: 0; width: 100%; height: 86dvh; border-radius: var(--r-xl) var(--r-xl) 0 0; padding: 12px 16px max(14px, env(safe-area-inset-bottom)); }
  .pop-enter-from { transform: translateY(12px); }
}
@media (prefers-reduced-motion: reduce) {
  .pop-enter-active, .pop-leave-active { transition: none; }
}
</style>
