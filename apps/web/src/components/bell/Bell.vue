<script setup lang="ts">
// The bell in the top bar: how many notifications are unread (a small orange count), and, pressed, a flat card
// under it with the latest ones as dense rows: who (their face), what (one line, bell.ts), and what you can do
// (move in or say no to an invitation, open a knock or a house, find a plot to rent together). Opening it marks
// them read; the ones that were new keep a dot while it stays open. Esc or a click outside closes it.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { acceptNotice, declineNotice, loadNotices, markNoticesRead, movedIn, notices, plotWanted } from "../../notices";
import { loadMe, me } from "../../session";
import { settings } from "../../settings";
import type { Notice } from "../../types";
import Avatar from "../Avatar.vue";
import Icon from "../lobby/house/Icon.vue";
import { noteWhen } from "../lobby/house/notes";
import ListRow from "../lobby/panel/ListRow.vue";
import { type NoticeAction, noticeRow } from "./bell";
import { bellWords as w } from "./words";

const route = useRoute();
const router = useRouter();
const open = ref(false);
const button = ref<HTMLButtonElement | null>(null);
const card = ref<HTMLElement | null>(null);
// The ones that were unread when the card opened: they keep a dot until it closes.
const fresh = ref(new Set<string>());
// An action under way, and a refusal to show on its row (the API's own sentence).
const busy = ref<string | null>(null);
const refused = ref<Record<string, string>>({});

const rows = computed(() => notices.items.map((n) => ({ n, ...noticeRow(n) })));
const badge = computed(() => (notices.unread > 9 ? "9+" : String(notices.unread)));

// Logged in: fetch now, and again whenever the tab comes back into view (the live line covers the rest).
watch(
  () => me.value?.login,
  () => void loadNotices(),
  { immediate: true },
);
const onVisible = () => document.visibilityState === "visible" && void loadNotices();
onMounted(() => document.addEventListener("visibilitychange", onVisible));
onBeforeUnmount(() => {
  document.removeEventListener("visibilitychange", onVisible);
  document.removeEventListener("pointerdown", outside, true);
});

async function toggle() {
  if (open.value) return close();
  fresh.value = new Set(notices.items.filter((n) => !n.read).map((n) => n.id));
  refused.value = {};
  open.value = true;
  document.addEventListener("pointerdown", outside, true);
  if (notices.unread) void markNoticesRead();
  await nextTick();
  (card.value?.querySelector<HTMLElement>(".act") ?? card.value?.querySelector<HTMLElement>(".x"))?.focus();
}

function close(refocus = true) {
  open.value = false;
  document.removeEventListener("pointerdown", outside, true);
  if (refocus) button.value?.focus();
}

function outside(e: PointerEvent) {
  const t = e.target as Node;
  if (!card.value?.contains(t) && !button.value?.contains(t)) close(false);
}

// A house: inside the city when you play in the lobby (never leaving the game), else its page. The same as the top bar.
const houseLink = (id: string) => (settings.view === "lobby" ? { path: "/", query: { ...(route.path === "/" ? route.query : {}), in: `house:${id}` } } : `/houses/${id}`);
const knockLink = (id: string) => (settings.view === "lobby" ? { path: "/", query: { ...(route.path === "/" ? route.query : {}), in: `application:${id}` } } : `/applications/${id}`);

async function act(n: Notice, action: NoticeAction) {
  if (busy.value) return;
  if (action === "house" && n.house) return go(houseLink(n.house.id));
  if (action === "knock" && n.applicationId) return go(knockLink(n.applicationId));
  if (action === "plot") {
    plotWanted.value++;
    return go(route.path === "/" ? null : "/");
  }
  busy.value = n.id;
  if (action === "decline") {
    const sent = await declineNotice(n.id);
    busy.value = null;
    if (!sent.ok) refused.value = { ...refused.value, [n.id]: sent.message };
    return;
  }
  const sent = await acceptNotice(n.id);
  busy.value = null;
  if (!sent.ok) {
    refused.value = { ...refused.value, [n.id]: sent.message };
    return;
  }
  const { house, room } = sent.data;
  if (house && room) {
    // You live there now. In the city, the lobby hands you the keys and opens the house; anywhere else, its page.
    close(false);
    if (route.path === "/" && settings.view === "lobby") movedIn.value = { houseId: house.id, house: house.name, room };
    else {
      void loadMe();
      router.push(houseLink(house.id));
    }
  }
}

function go(to: Parameters<typeof router.push>[0] | null) {
  close(false);
  if (to) router.push(to);
}

</script>

<template>
  <div class="bell">
    <button ref="button" class="ring" :aria-label="w.bellName(notices.unread)" :aria-expanded="open" aria-haspopup="dialog" @click="toggle">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z M10 20.5a2.2 2.2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round" />
      </svg>
      <span v-if="notices.unread" class="badge" aria-hidden="true">{{ badge }}</span>
    </button>

    <Transition name="pop">
      <section v-if="open" ref="card" class="card" role="dialog" :aria-label="w.label" @keydown.esc.stop="close()">
        <button class="x" :aria-label="w.close" @click="close()">
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" /></svg>
        </button>
        <p v-if="!rows.length" class="empty">{{ w.empty }}</p>
        <ul v-else class="list">
          <ListRow v-for="row in rows" :key="row.n.id" :title="row.title" :class="{ fresh: fresh.has(row.n.id) }">
            <template #lead>
              <Avatar v-if="row.n.from" :person="row.n.from" :size="34" decorative />
              <span v-else class="lead-icon"><Icon name="house" :size="18" /></span>
            </template>
            <span class="detail">
              <span class="when">{{ noteWhen(row.n.createdAt) }}</span>
              <template v-if="refused[row.n.id]"> · <span class="refused" role="alert">{{ refused[row.n.id] }}</span></template>
              <template v-else-if="row.sub"> · {{ row.sub }}</template>
            </span>
            <template v-if="row.actions.length" #end>
              <span class="acts">
                <template v-for="a in row.actions" :key="a">
                  <!-- Saying yes, and finding a plot, are words; no and open are icons with their names. -->
                  <button v-if="a === 'accept' || a === 'plot'" type="button" class="act" :class="{ yes: a === 'accept' }" :disabled="busy === row.n.id" @click="act(row.n, a)">
                    {{ a === "accept" ? row.acceptWord : w.findPlot }}
                  </button>
                  <button
                    v-else
                    type="button"
                    class="act icon"
                    :disabled="busy === row.n.id"
                    :aria-label="a === 'decline' ? w.noThanks : w.openName(row.title)"
                    :title="a === 'decline' ? w.noThanks : w.open"
                    @click="act(row.n, a)"
                  >
                    <svg v-if="a === 'decline'" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" /></svg>
                    <Icon v-else name="next" :size="16" />
                  </button>
                </template>
              </span>
            </template>
          </ListRow>
        </ul>
      </section>
    </Transition>
  </div>
</template>

<style scoped>
.bell { position: relative; display: flex; }
/* The top bar's round-cornered icon button, like the settings gear beside it. */
.ring { position: relative; width: 36px; min-height: 36px; padding: 0; display: inline-flex; align-items: center; justify-content: center; border-radius: var(--r-sm); background: none; color: var(--text); box-shadow: inset 0 0 0 1px var(--line); }
.ring:hover:not(:disabled) { background: var(--fill); }
/* The count: a small orange pill on the bell's corner. */
.badge {
  position: absolute;
  top: -4px;
  right: -5px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: var(--r-pill);
  background: var(--accent-fill);
  color: var(--on-accent);
  font: 700 11px/18px var(--font);
  text-align: center;
  box-shadow: 0 0 0 2px var(--surface);
}
/* A flat floating card under the bar, on the right: the panels' rows, nothing else. */
.card {
  position: fixed;
  top: 56px;
  right: max(16px, calc((100vw - var(--wrap)) / 2 - var(--gutter) + 16px));
  z-index: 60;
  width: min(420px, calc(100vw - 32px));
  max-height: min(560px, calc(100dvh - 80px));
  overflow-y: auto;
  padding: 40px 10px 10px;
  border-radius: var(--r-lg);
  background: var(--surface);
  box-shadow: var(--shadow);
}
.x { position: absolute; top: 8px; right: 8px; width: 28px; height: 28px; min-height: 0; padding: 0; display: grid; place-items: center; border-radius: var(--r-xs); background: none; color: var(--muted); box-shadow: none; }
.x:hover:not(:disabled) { background: var(--fill-hover); color: var(--text); }
.empty { margin: 0; padding: 4px 8px 10px; color: var(--muted); font-size: 14px; }
.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.list :deep(.list-row) { min-height: 52px; padding: 8px 10px; gap: 10px; }
.list :deep(.list-row .title) { font-size: 14px; white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
/* New since you last looked: a small orange dot before the face. */
.list :deep(.list-row.fresh) { position: relative; }
.list :deep(.list-row.fresh)::before { content: ""; position: absolute; left: 3px; top: 50%; width: 6px; height: 6px; margin-top: -3px; border-radius: 50%; background: var(--accent-fill); }
.lead-icon { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 50%; background: var(--tile); color: var(--muted); }
.detail { font-size: 12.5px; color: var(--muted); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.when { font-variant-numeric: tabular-nums; }
.refused { color: var(--danger); }
.acts { display: flex; align-items: center; gap: 4px; }
.acts .act { min-height: 32px; padding: 0 10px; border-radius: var(--r-sm); font-size: 13px; font-weight: 600; white-space: nowrap; }
.acts .act.icon { width: 32px; padding: 0; justify-content: center; }
/* The yes is this row's main action: the soft orange, as on the person cards. */
.acts .act.yes { background: var(--accent-soft); color: var(--accent); box-shadow: none; }
.acts .act.yes:hover:not(:disabled) { box-shadow: inset 0 0 0 1.5px var(--accent-fill); }
.pop-enter-active { transition: opacity var(--dur) var(--ease), transform var(--dur-slow) var(--ease-pop); }
.pop-leave-active { transition: opacity var(--dur-fast) var(--ease); }
.pop-enter-from { opacity: 0; transform: translateY(-6px); }
.pop-leave-to { opacity: 0; }
@media (max-width: 520px) {
  .card { top: 52px; right: 16px; }
}
@media (prefers-reduced-motion: reduce) {
  .pop-enter-active, .pop-leave-active { transition: none; }
}
</style>
