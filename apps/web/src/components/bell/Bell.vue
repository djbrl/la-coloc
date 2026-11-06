<script setup lang="ts">
// The bell in the top bar: a small dot when something is unread (how many is in its hidden name), and, pressed, a
// white card under it with the latest ones in two groups, what waits for you, then the rest. Each line is a quiet
// symbol (done, went wrong, waiting for you), what happened (one line, bell.ts), its time, and what you can do
// (move in or say no to an invitation, open a knock or a house, find a plot to rent together, open the post or the
// chat where someone replied to you or mentioned you, top up for rent you were short of). Opening it marks
// them read; the ones that were new stay with what waits for you while it's open. Esc or a click outside closes it.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { chatSheet, openChat } from "../../conversations";
import { acceptNotice, arenaWanted, creditWanted, declineNotice, loadNotices, markNoticesRead, movedIn, notices, plotWanted } from "../../notices";
import { loadMe, me } from "../../session";
import { settings } from "../../settings";
import type { Notice } from "../../types";
import Icon from "../lobby/house/Icon.vue";
import { noteWhen } from "../lobby/house/notes";
import { type NoticeAction, noticeMark, noticeRow } from "./bell";
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

// Each line with its symbol. What waits for you comes first: an answer to give, rent to top up, a knock to vote on, and
// anything new since you last looked that has a way to act on it (a mention to open).
const rows = computed(() =>
  notices.items.map((n) => {
    const row = noticeRow(n);
    const mark = noticeMark(n, row);
    const todo = mark === "todo" || (fresh.value.has(n.id) && row.actions.length > 0);
    return { n, ...row, mark: todo ? ("todo" as const) : mark, todo };
  }),
);
const groups = computed(() =>
  [
    { key: "todo", head: w.toDoHead, rows: rows.value.filter((r) => r.todo) },
    { key: "earlier", head: w.earlierHead, rows: rows.value.filter((r) => !r.todo) },
  ].filter((g) => g.rows.length),
);
const toDo = computed(() => rows.value.filter((r) => r.todo).length);

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
  (card.value?.querySelector<HTMLElement>(".act") ?? card.value?.querySelector<HTMLElement>(".sign-x"))?.focus();
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
  if (action === "chat" && n.chat) return openWhere(n.chat);
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
  // Only a house invitation moves you in. Any other yes stays where it is: the row says it's done.
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

// Where a reply or a mention was said: the post, or the city's room, in the chat sheet (over whatever page you're on);
// the Arena's room is in the lobby's Arena.
function openWhere(c: NonNullable<Notice["chat"]>) {
  if (c.place === "arena") {
    arenaWanted.value++;
    return go(route.path === "/" ? null : "/");
  }
  close(false);
  chatSheet.city = c.city;
  if (c.place === "post" && c.post) openChat("board", { post: c.post.id });
  else openChat("city");
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
      <span v-if="notices.unread" class="dot" aria-hidden="true" />
    </button>

    <Transition name="pop">
      <section v-if="open" ref="card" class="card sign" role="dialog" :aria-label="w.label" @keydown.esc.stop="close()">
        <div class="sign-frame">
          <header class="sign-band">
            <span class="chip"><Icon name="bell" :size="22" /></span>
            <h2>{{ w.label }}</h2>
            <p v-if="toDo" class="sign-sub">{{ w.toDo(toDo) }}</p>
            <button class="sign-x" :aria-label="w.close" @click="close()"><span aria-hidden="true">X</span></button>
          </header>
          <div class="sign-body body">
            <p v-if="!rows.length" class="empty">{{ w.empty }}</p>
            <section v-for="g in groups" :key="g.key" class="group">
              <h3 class="label">{{ g.head }}</h3>
              <ul class="list">
                <li v-for="row in g.rows" :key="row.n.id" class="line">
                  <span class="status-mark" :class="row.mark" role="img" :aria-label="w.markName[row.mark]">
                    <Icon v-if="row.mark === 'ok'" name="tick" :size="12" />
                    <svg v-else-if="row.mark === 'fail'" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" /></svg>
                  </span>
                  <div class="text">
                    <p class="title">{{ row.title }}</p>
                    <p v-if="refused[row.n.id]" class="sub refused" role="alert">{{ refused[row.n.id] }}</p>
                    <p v-else-if="row.sub" class="sub">{{ row.sub }}</p>
                    <div v-if="row.actions.length" class="acts">
                      <template v-for="a in row.actions" :key="a">
                        <!-- Saying yes is the line's main button; no, open, a plot and topping up are grey. -->
                        <button
                          type="button"
                          class="act"
                          :class="{ primary: a === 'accept' }"
                          :disabled="busy === row.n.id"
                          :aria-label="a === 'house' || a === 'knock' || a === 'chat' ? w.openName(row.title) : undefined"
                          @click="act(row.n, a)"
                        >
                          {{ a === "accept" ? row.acceptWord : a === "decline" ? w.noThanks : a === "credit" ? w.topUp : a === "plot" ? w.findPlot : w.open }}
                        </button>
                      </template>
                    </div>
                  </div>
                  <span class="when">{{ noteWhen(row.n.createdAt) }}</span>
                </li>
              </ul>
            </section>
          </div>
        </div>
      </section>
    </Transition>
  </div>
</template>

<style scoped>
.bell { position: relative; display: flex; }
/* The key itself is drawn by the bar (App.vue), like the chat's and the gear. Something unread: a small white dot in
   the key's corner, white because the key is the sign's red. */
.dot { position: absolute; top: 9px; right: 9px; width: 10px; height: 10px; border-radius: 50%; background: var(--on-panel); box-shadow: 0 0 0 2px var(--panel-red); }
/* The notifications, a white card under the keys on the right. */
.card {
  position: fixed;
  top: 98px;
  right: 24px;
  z-index: 60;
  width: min(440px, calc(100vw - 32px));
  max-height: min(640px, calc(100dvh - 120px));
  display: flex;
  flex-direction: column;
  color: var(--text);
}
.body { display: grid; align-content: start; gap: 14px; overflow-y: auto; overscroll-behavior: contain; }
.empty { margin: 0; color: var(--muted); font-size: 15px; font-weight: 600; }
.group { display: grid; gap: 2px; }
.group .label { padding: 0 4px 2px; }
.list { list-style: none; margin: 0; padding: 0; display: grid; }
/* A line: its symbol, what happened and what to do about it, its time on the right. No lines between, air instead. */
.line { display: flex; align-items: flex-start; gap: 12px; padding: 10px 4px; }
.line .status-mark { width: 22px; height: 22px; }
.text { flex: 1 1 auto; min-width: 0; display: grid; gap: 1px; }
.title { margin: 0; font-size: 15px; font-weight: 800; line-height: 20px; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.sub { margin: 0; font-size: 13px; font-weight: 600; line-height: 18px; color: var(--muted); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.refused { color: var(--danger); }
.when { flex: none; font-size: 13px; font-weight: 600; line-height: 20px; color: var(--muted); font-variant-numeric: tabular-nums; }
/* The line's buttons: small (40) with their lip, the yes in red, the others grey. */
.acts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.act { min-height: 40px; padding: 0 14px 3px; border-radius: 10px; background: var(--sunken); box-shadow: inset 0 -3px 0 var(--quiet-lip); font-size: 14px; white-space: nowrap; --lip: 3px; }
.act:hover:not(:disabled) { background: var(--fill); }
.act.primary { background: var(--accent-fill); box-shadow: inset 0 -3px 0 var(--accent-lip); }
.act.primary:hover:not(:disabled) { background: var(--accent-fill-hover); }
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
