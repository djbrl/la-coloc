<script setup lang="ts">
// The city board's window: what you get by using the big board on the market square (E, or a click), and the only way
// to the city's conversation (Jib, 6 11). One white card docked on the right (a sheet along the bottom on a phone),
// like the chat sheet. Its tabs, on one grey rail: City (the city's public room, CityRoom.vue) and Board (the posts:
// looking for a house, flatmates, help; CityBoard.vue); a third, Reviews, only while houses here have code reviews
// waiting, each house one row that takes you to it. A tab with something new since you looked (cityNews.ts) has a
// small red dot after its word. Esc (or the close key) closes it; the city keeps going behind it.
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { cityNews, followCityNews } from "../../cityNews";
import { boardSheet, chatSheet } from "../../conversations";
import type { CityHouse } from "../../types";
import { type BoardTab, boardTabs, pickTab, shownNews } from "../chat/chat";
import CityBoard from "../chat/CityBoard.vue";
import CityRoom from "../chat/CityRoom.vue";
import Icon from "./house/Icon.vue";
import ListRow from "./panel/ListRow.vue";
import { boardWords as w } from "./words";

// Every city's houses: the window keeps those of the city it's about (the bell may open another city's posts).
const props = defineProps<{ houses: CityHouse[] }>();
const emit = defineEmits<{ open: [houseId: string] }>();

// The houses with reviews waiting, the busiest first.
const waiting = computed(() =>
  props.houses
    .filter((h) => h.city === chatSheet.city && (h.openChores ?? 0) > 0)
    .sort((a, b) => (b.openChores ?? 0) - (a.openChores ?? 0) || a.name.localeCompare(b.name)),
);
const tabs = computed(() => boardTabs(waiting.value.length));
const tab = computed(() => pickTab(boardSheet.tab, tabs.value));
const sub = computed(() => (tab.value === "city" ? w.subCity(chatSheet.city) : tab.value === "board" ? w.subBoard : w.subReviews));
// What's new in the city's room and posts, shown only for the city the window is about.
const news = computed(() => (cityNews.city === chatSheet.city ? shownNews(cityNews, { open: true, tab: tab.value }) : { chat: 0, board: 0 }));
const waits = (t: BoardTab) => (t === "city" ? news.value.chat > 0 : t === "board" ? news.value.board > 0 : false);

const root = ref<HTMLElement | null>(null);
// The counts stay fresh while the window is open (it's drawn only then).
const stopNews = followCityNews();
onBeforeUnmount(stopNews);
// Opened: the chosen tab holds the keyboard, so Esc and the arrows work at once.
onMounted(async () => {
  await nextTick();
  root.value?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
});

function close() {
  boardSheet.open = false;
}

// Left and right move between the tabs, as in any tab list.
function tabKey(e: KeyboardEvent) {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  const i = tabs.value.indexOf(tab.value);
  const next = tabs.value[(i + (e.key === "ArrowRight" ? 1 : tabs.value.length - 1)) % tabs.value.length];
  boardSheet.tab = next;
  void nextTick(() => root.value?.querySelector<HTMLElement>(`[data-tab="${next}"]`)?.focus());
}
</script>

<template>
  <section ref="root" class="board-window sign" role="dialog" :aria-label="w.title" @keydown.esc.stop="close">
    <div class="sign-frame">
      <header class="sign-band">
        <span class="chip"><Icon name="board" :size="22" /></span>
        <h2>{{ w.title }}</h2>
        <p class="sign-sub">{{ sub }}</p>
        <button type="button" class="sign-x" :aria-label="w.close" @click="close"><span aria-hidden="true">X</span></button>
      </header>
      <div class="sign-body inner">
        <div class="tabs" role="tablist" :aria-label="w.title" @keydown="tabKey">
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
            @click="boardSheet.tab = t"
          >
            <span class="word">{{ w.tabs[t] }}</span>
            <span v-if="waits(t)" class="tab-dot" aria-hidden="true" />
          </button>
        </div>
        <div class="body" role="tabpanel" :aria-label="w.tabs[tab]">
          <CityRoom v-if="tab === 'city'" />
          <CityBoard v-else-if="tab === 'board'" />
          <ul v-else class="lines">
            <ListRow v-for="h in waiting" :key="h.id" :title="h.name" :sub="w.reviewLine(h.openChores ?? 0, h.lateChores ?? 0)" class="entry">
              <template #lead><span class="lead-tile"><Icon name="house" :size="18" /></span></template>
              <template #end>
                <span v-if="(h.lateChores ?? 0) > 0" class="status-mark fail" aria-hidden="true"><Icon name="alert" :size="12" /></span>
                <button type="button" class="open" :aria-label="w.goTo(h.name)" @click="emit('open', h.id)"><Icon name="next" :size="16" /></button>
              </template>
            </ListRow>
          </ul>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* A white card on the right, under the keys, like the chat sheet: the city (and the board) stay in view on its left.
   As tall as what's in it, up to most of the window; the room and the posts scroll inside themselves. */
.board-window {
  position: fixed;
  top: 98px;
  right: 24px;
  z-index: 61;
  display: flex;
  flex-direction: column;
  width: min(420px, calc(100vw - 32px));
  max-height: min(640px, calc(100dvh - 122px));
  animation: board-pop var(--dur-slow) var(--ease-pop);
}
.board-window > .sign-frame { flex: 1 1 auto; min-height: 0; height: auto; }
.inner { display: flex; flex-direction: column; gap: 12px; }
/* The tabs: one control, a grey rail, the chosen tab lifted out in white. */
.tabs { flex: none; display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 4px; padding: 4px; min-width: 0; border-radius: var(--tile-r); background: var(--sunken); }
.tab { min-width: 0; display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 40px; padding: 0 6px; border-radius: 10px; background: transparent; color: var(--muted); box-shadow: none; font: 800 15px/1 var(--font); white-space: nowrap; }
.tab:hover:not(:disabled) { background: transparent; color: var(--text); }
.tab[aria-selected="true"], .tab[aria-selected="true"]:hover:not(:disabled) { background: var(--surface); color: var(--text); box-shadow: 0 2px 0 rgba(23, 21, 26, 0.14); }
.tab:focus-visible { outline-offset: -3px; }
.word { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
/* Something new behind a tab: a small red dot after the word. */
.tab-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
.body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
/* The reviews: one dense row per house, a quiet "!" when one is late; the whole row takes you there. */
.lines { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; list-style: none; margin: 0; padding: 2px; display: grid; gap: 6px; align-content: start; }
.lines :deep(.list-row) { min-height: 50px; padding: 2px 10px; gap: 10px; }
.lines :deep(.list-row .title) { font-size: 15px; }
.lines :deep(.list-row .sub) { font-size: 13px; }
.lead-tile { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 10px; background: var(--tile); color: var(--text); }
.open { width: 32px; padding: 0 !important; justify-content: center; background: none; box-shadow: none; color: var(--muted); }
.entry { position: relative; cursor: pointer; }
.entry .open::after { content: ""; position: absolute; inset: 0; }
@keyframes board-pop {
  from { opacity: 0; transform: translateY(-6px); }
}
/* A phone: a sheet along the bottom edge, most of the screen's height. */
@media (max-width: 520px) {
  .board-window { top: auto; bottom: 0; right: 0; left: 0; width: 100%; max-height: 86dvh; }
}
@media (prefers-reduced-motion: reduce) {
  .board-window { animation: none; }
}
</style>
