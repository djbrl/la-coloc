<script setup lang="ts">
// The bell in the top bar: how many notifications are unread (a small yellow count), and, pressed, a flat card
// under it with the latest ones as dense rows: who (their face), what (one line, bell.ts), and what you can do
// (move in or say no to an invitation, open a knock or a house, find a plot to rent together, top up for rent you
// were short of). Opening it marks them read; the ones that were new keep a dot while it stays open. Esc or a click
// outside closes it.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { acceptNotice, creditWanted, declineNotice, loadNotices, markNoticesRead, movedIn, notices, plotWanted } from "../../notices";
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
  if (action === "credit") {
    // Your credit's card lives in the city: open it there (from another page, the address asks it to open itself).
    // The list view has no card: the house's bill tab says what's owed, and pays it.
    if (settings.view !== "lobby") return go(n.house ? houseLink(n.house.id) : null);
    if (route.path === "/") creditWanted.value++;
    return go(route.path === "/" ? null : { path: "/", query: { credit: "open" } });
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
  // Only a house invitation moves you in. Teaming up keeps you in your own room: the row says it's done.
  if (house && room && n.kind === "house_invite") {
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
    <button ref="button" class="ring" data-tour="bell" :aria-label="w.bellName(notices.unread)" :aria-expanded="open" aria-haspopup="dialog" @click="toggle">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M12 2a6 6 0 0 0-6 6c0 6-3 8-3 9h18c0-1-3-3-3-9a6 6 0 0 0-6-6zM9.5 19a2.5 2.5 0 0 0 5 0z" />
      </svg>
      <span v-if="notices.unread" class="badge" aria-hidden="true">{{ badge }}</span>
    </button>

    <Transition name="pop">
      <section v-if="open" ref="card" class="card sign blue" role="dialog" :aria-label="w.label" @keydown.esc.stop="close()">
        <div class="sign-frame">
          <header class="sign-band">
            <h2>{{ w.label }}</h2>
            <button class="sign-x" :aria-label="w.close" @click="close()"><span aria-hidden="true">X</span></button>
          </header>
          <div class="sign-body body">
            <p v-if="!rows.length" class="empty">{{ w.empty }}</p>
            <ul v-else class="list">
              <ListRow v-for="row in rows" :key="row.n.id" :title="row.title" :class="{ fresh: fresh.has(row.n.id) }">
                <template #lead>
                  <Avatar v-if="row.n.from" :person="row.n.from" :size="46" decorative />
                  <span v-else class="lead-icon"><Icon :name="row.n.kind === 'rent_paid' || row.n.kind === 'rent_due' ? 'coin' : 'house'" :size="22" /></span>
                </template>
                <span class="detail">
                  <span class="when">{{ noteWhen(row.n.createdAt) }}</span>
                  <template v-if="refused[row.n.id]"> · <span class="refused" role="alert">{{ refused[row.n.id] }}</span></template>
                  <template v-else-if="row.sub"> · {{ row.sub }}</template>
                </span>
                <template v-if="row.actions.length" #end>
                  <span class="acts">
                    <template v-for="a in row.actions" :key="a">
                      <!-- Saying yes, finding a plot and topping up are words; no and open are icons with their names. -->
                      <button v-if="a === 'accept' || a === 'plot' || a === 'credit'" type="button" class="act" :class="{ yes: a === 'accept' }" :disabled="busy === row.n.id" @click="act(row.n, a)">
                        {{ a === "accept" ? row.acceptWord : a === "credit" ? w.topUp : w.findPlot }}
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
                        <svg v-if="a === 'decline'" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" /></svg>
                        <Icon v-else name="next" :size="18" />
                      </button>
                    </template>
                  </span>
                </template>
              </ListRow>
            </ul>
          </div>
        </div>
      </section>
    </Transition>
  </div>
</template>

<style scoped>
.bell { position: relative; display: flex; }
/* The key itself is drawn by the bar (App.vue), like the chat's and the gear. The count, in yellow: something waits. */
.badge { position: absolute; top: 5px; right: 5px; min-width: 22px; height: 22px; padding: 0 5px; border-radius: 11px; background: var(--sticker); color: var(--ink); font: 800 14px/22px var(--font); text-align: center; }
/* The notifications, a sign under the keys on the right. */
.card {
  position: fixed;
  top: 98px;
  right: 24px;
  z-index: 60;
  width: min(420px, calc(100vw - 32px));
  max-height: min(640px, calc(100dvh - 120px));
  display: flex;
  flex-direction: column;
  color: var(--text);
}
.body { overflow-y: auto; overscroll-behavior: contain; }
.empty { margin: 0; color: var(--muted); font-size: 15px; }
.list { list-style: none; margin: 0; padding: 0; display: grid; }
.list :deep(.list-row) { flex-wrap: wrap; gap: 8px 10px; padding: 10px 0; }
.list :deep(.list-row .text) { flex: 1 1 200px; }
.list :deep(.list-row .title) { font-size: 16px; line-height: 1.15; white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
/* The actions take the row's full width under the words, as in a stack of cards. */
.list :deep(.list-row .end) { flex: 1 1 100%; }
/* New since you last looked: a small yellow dot before the face. */
.list :deep(.list-row.fresh) { position: relative; }
.list :deep(.list-row.fresh)::before { content: ""; position: absolute; left: -9px; top: 26px; width: 8px; height: 8px; border-radius: 50%; background: var(--sticker); box-shadow: 0 0 0 1px var(--ink); }
.lead-icon { width: 46px; height: 46px; display: grid; place-items: center; border-radius: var(--r-md); background: var(--tile); color: var(--panel); }
.detail { font-size: 15px; color: var(--muted); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.when { font-variant-numeric: tabular-nums; }
.refused { color: var(--danger); }
.acts { flex: 1; display: flex; align-items: center; gap: 6px; }
.acts .act { flex: 1; justify-content: center; white-space: nowrap; }
.acts .act.icon { flex: none; width: 46px; padding: 0; }
/* The yes is this row's main action, the sign's red. */
.acts .act.yes, .acts .act.yes:hover:not(:disabled) { background: var(--accent-fill); color: var(--on-accent); box-shadow: none; }
.acts .act:not(.yes) { background: transparent; box-shadow: var(--quiet-edge); }
.pop-enter-active { transition: opacity var(--dur) var(--ease), transform var(--dur-slow) var(--ease-pop); }
.pop-leave-active { transition: opacity var(--dur-fast) var(--ease); }
.pop-enter-from { opacity: 0; transform: translateY(-6px); }
.pop-leave-to { opacity: 0; }
@media (max-width: 520px) {
  .card { top: 66px; right: 16px; max-height: calc(100dvh - 82px); }
}
@media (prefers-reduced-motion: reduce) {
  .pop-enter-active, .pop-leave-active { transition: none; }
}
</style>
