<script setup lang="ts">
// Your credit, from the coin on the city's screen: what you have, what earns more, and (folded) where it went lately.
// Its head says plainly that it's the city's fake money. A native <dialog>, like the other steps: it traps focus and
// closes on Escape. When PayDunya is set up on the server, "Top up" unfolds a row of amounts: PayDunya's page takes the
// payment, and you come back here with the credit added (`added`).
import { computed, onMounted, ref } from "vue";
import { type Refusal, refusalText } from "../refusals";
import { me } from "../session";
import { fcfa } from "./lobby/house/server";
import Icon from "./lobby/house/Icon.vue";
import { creditWords as w } from "./words";

defineProps<{ added?: boolean }>();
const emit = defineEmits<{ close: [] }>();

interface CreditDetails {
  credit: number;
  entries: { amount: number; reason: keyof typeof w.reasons; at: string }[];
  welcome: number;
  review: number;
  arena: number;
  topUp: { amounts: number[]; test: boolean } | null;
}

const dialog = ref<HTMLDialogElement | null>(null);
const details = ref<CreditDetails | null>(null);
const LAST = 5;

// The latest movements, and the credit you started with when there's room for it: it has no row of its own.
const rows = computed(() => {
  const d = details.value;
  if (!d) return [];
  const moved = d.entries.map((e) => ({ amount: e.amount, reason: e.reason as keyof typeof w.reasons }));
  return moved.length < LAST ? [...moved, { amount: d.welcome, reason: "welcome" as const }] : moved;
});
const signed = (n: number) => `${n > 0 ? "+" : "−"}${fcfa(Math.abs(n))}`;
// The balance as a big number, its unit beside it in small.
const digits = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
// What most people don't need first stays folded: the history, and the amounts to buy.
const historyOpen = ref(false);
const buyOpen = ref(false);

// Buying credit: the API makes a PayDunya invoice, and the whole page goes to PayDunya to pay it.
const buying = ref(false);
const error = ref("");
async function topUp(amount: number) {
  if (buying.value) return;
  buying.value = true;
  error.value = "";
  try {
    const res = await fetch("/api/credit/top-up", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount }) });
    const data = await res.json().catch(() => null);
    if (res.ok && typeof data?.url === "string") {
      window.location.assign(data.url);
      return;
    }
    error.value = data ? refusalText(data as Refusal) : w.tryAgain;
  } catch {
    error.value = w.tryAgain;
  }
  buying.value = false;
}

function onClick(e: MouseEvent) {
  if (e.target === dialog.value) dialog.value?.close();
}

onMounted(async () => {
  dialog.value?.showModal();
  try {
    const res = await fetch("/api/credit");
    if (!res.ok) return;
    details.value = await res.json();
    if (me.value && details.value) me.value.credit = details.value.credit;
  } catch {
    // Nobody answered: the balance you already know stays on screen.
  }
});
</script>

<template>
  <dialog ref="dialog" class="step-sign" :aria-label="w.title" @close="emit('close')" @click="onClick">
    <div class="inner">
      <header class="sign-band">
        <span class="chip"><Icon name="coin" :size="22" /></span>
        <h2>{{ w.title }}</h2>
        <p class="sign-sub">{{ w.fake }}</p>
        <button type="button" class="sign-x" :aria-label="w.close" @click="dialog?.close()"><span aria-hidden="true">X</span></button>
      </header>
      <div class="body">
        <p class="stat"><strong class="num">{{ digits(me?.credit ?? 0) }}</strong><span class="unit">{{ w.unit }}</span></p>
        <p v-if="added" class="tiny done" role="status">{{ w.topUpAdded }}</p>
        <template v-if="details">
          <section class="earn">
            <h3 class="label">{{ w.earnHead }}</h3>
            <ul>
              <li><Icon name="check" :size="20" /><span>{{ w.review }}</span><b>+{{ fcfa(details.review) }}</b></li>
              <li><Icon name="trophy" :size="20" /><span>{{ w.arena }}</span><b>{{ w.upTo(fcfa(details.arena)) }}</b></li>
            </ul>
          </section>
          <!-- Where it went: folded, its count beside its name. -->
          <div class="fold">
            <button type="button" class="fold-head" :aria-expanded="historyOpen" @click="historyOpen = !historyOpen">
              <span class="fold-name">{{ w.history }}</span>
              <span class="fold-meta">{{ w.moves(rows.length) }}</span>
              <svg :class="{ up: historyOpen }" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </button>
            <ul v-if="historyOpen" class="moved">
              <li v-for="(r, i) in rows" :key="i">
                <span class="status-mark" :class="r.amount > 0 ? 'ok' : 'none'" aria-hidden="true"><Icon v-if="r.amount > 0" name="tick" :size="12" /></span>
                <span>{{ w.reasons[r.reason] }}</span><b>{{ signed(r.amount) }}</b>
              </li>
            </ul>
          </div>
          <div v-if="details.topUp" class="top-up">
            <button v-if="!buyOpen" type="button" class="second wide" :aria-expanded="false" @click="buyOpen = true">{{ w.topUp }}</button>
            <template v-else>
              <div class="amounts">
                <button v-for="a in details.topUp.amounts" :key="a" type="button" class="second" :disabled="buying" :aria-label="w.topUpName(fcfa(a))" @click="topUp(a)">+{{ fcfa(a) }}</button>
              </div>
              <p v-if="error" class="error" role="alert">{{ error }}</p>
              <p v-else-if="details.topUp.test" class="tiny">{{ w.topUpTest }}</p>
            </template>
          </div>
        </template>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
dialog { width: min(440px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); overflow-y: auto; animation: menu-pop var(--dur-slow) var(--ease-pop); }
dialog::backdrop { background: var(--scrim); }
@keyframes menu-pop {
  from { opacity: 0; transform: translateY(10px) scale(0.94); }
}
.body { display: grid; gap: 16px; padding: 4px 20px 20px; }
/* The balance: a big number on a soft tile, its unit beside it. */
.stat { display: flex; align-items: baseline; gap: 8px; margin: 0; padding: 14px 16px; border-radius: var(--tile-r); background: var(--tile); }
.stat strong { font: 800 34px/40px var(--display); white-space: nowrap; }
.unit { font-size: 15px; font-weight: 800; color: var(--muted); }
.tiny { margin: 0; font-size: 13px; font-weight: 600; color: var(--muted); }
.done { color: var(--live); font-weight: 800; }
ul { display: grid; margin: 0; padding: 0; list-style: none; }
li { display: flex; align-items: center; gap: 12px; min-height: 44px; font-size: 15px; font-weight: 800; }
li > span:not(.status-mark) { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
li b { font: 800 14px/1 var(--num); font-variant-numeric: tabular-nums; white-space: nowrap; }
/* Ways to earn: the icon in the red, what you'd get in the green. */
.earn { display: grid; gap: 2px; }
.earn svg { flex: none; color: var(--accent); }
.earn b { color: var(--live); }
/* The folded history: a row you open, on a soft tile. */
.fold { border-radius: var(--tile-r); background: var(--tile); }
.fold-head { width: 100%; min-height: 48px; display: flex; align-items: center; gap: 10px; padding: 0 14px; border-radius: var(--tile-r); background: transparent; box-shadow: none; color: var(--text); font: 800 15px/1.2 var(--font); text-align: left; }
.fold-head:hover:not(:disabled) { background: transparent; }
.fold-name { flex: 1 1 auto; }
.fold-meta { font-size: 13px; font-weight: 600; color: var(--muted); }
.fold-head svg { flex: none; color: var(--muted); transition: rotate var(--dur-fast) var(--ease); }
.fold-head svg.up { rotate: 180deg; }
.moved { padding: 0 14px 10px; }
.moved li { min-height: 34px; gap: 10px; font-size: 14px; font-weight: 600; }
.top-up { display: grid; gap: 8px; }
.wide { width: 100%; }
.amounts { display: flex; gap: 8px; }
.amounts button { flex: 1 1 0; min-width: 0; padding: 0 8px var(--lip); font: 800 15px/1 var(--num); font-variant-numeric: tabular-nums; white-space: nowrap; }
.error { margin: 0; font-size: 14px; color: var(--danger); }
@media (prefers-reduced-motion: reduce) {
  dialog { animation: none; }
}
</style>
