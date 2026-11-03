<script setup lang="ts">
// Your credit, from the coin on the city's screen: what you have, what earns more, and where it went lately. It says
// plainly that it's the city's fake money. A native <dialog>, like the other steps: it traps focus and closes on Escape.
// When PayDunya is set up on the server, a row of amounts buys more: PayDunya's page takes the payment, and you come back
// here with the credit added (`added`).
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
      <button type="button" class="x" :aria-label="w.close" @click="dialog?.close()"><span aria-hidden="true">X</span></button>
      <div class="body">
        <p class="stat"><Icon name="coin" :size="30" /><strong>{{ fcfa(me?.credit ?? 0) }}</strong></p>
        <p class="tiny">{{ w.fake }}</p>
        <p v-if="added" class="tiny done" role="status">{{ w.topUpAdded }}</p>
        <template v-if="details">
          <div v-if="details.topUp" class="top-up">
            <p class="label"><Icon name="coin" :size="20" />{{ w.topUp }}</p>
            <div class="amounts">
              <button v-for="a in details.topUp.amounts" :key="a" type="button" class="big" :disabled="buying" :aria-label="w.topUpName(fcfa(a))" @click="topUp(a)">+{{ fcfa(a) }}</button>
            </div>
            <p v-if="error" class="error" role="alert">{{ error }}</p>
            <p v-else-if="details.topUp.test" class="tiny">{{ w.topUpTest }}</p>
          </div>
          <ul class="earn">
            <li><Icon name="check" :size="22" /><span>{{ w.review }}</span><b>+{{ fcfa(details.review) }}</b></li>
            <li><Icon name="trophy" :size="22" /><span>{{ w.arena }}</span><b>{{ w.upTo(fcfa(details.arena)) }}</b></li>
          </ul>
          <ul class="moved">
            <li v-for="(r, i) in rows" :key="i"><span>{{ w.reasons[r.reason] }}</span><b :class="{ up: r.amount > 0 }">{{ signed(r.amount) }}</b></li>
          </ul>
        </template>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
dialog { width: min(420px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); animation: menu-pop var(--dur-slow) var(--ease-pop); }
dialog::backdrop { background: var(--scrim); }
@keyframes menu-pop {
  from { opacity: 0; transform: translateY(10px) scale(0.94); }
}
.body { display: grid; gap: 12px; padding: 22px; }
.stat { display: flex; align-items: center; gap: 10px; margin: 0; padding-right: 44px; color: var(--panel-red); }
.stat strong { font: 400 38px/1.05 var(--display); white-space: nowrap; }
.tiny { margin: -6px 0 0; font-size: 14px; color: var(--muted); }
ul { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
li { display: flex; align-items: center; gap: 10px; min-height: 42px; padding: 0 12px; border-radius: var(--r-md); font-size: 15px; }
li span { flex: 1; min-width: 0; }
li b { font: 800 14px/1 var(--num); font-variant-numeric: tabular-nums; white-space: nowrap; }
.earn li { background: var(--tile); }
.moved li { min-height: 30px; }
.moved b.up { color: var(--live); }
.done { color: var(--live); font-weight: 800; }
.top-up { display: grid; gap: 8px; }
.label { display: flex; align-items: center; gap: 8px; margin: 0; font-weight: 800; }
.amounts { display: flex; gap: 8px; }
.amounts .big { flex: 1 1 0; min-width: 0; padding: 6px 8px; font: 800 15px/1 var(--num); font-variant-numeric: tabular-nums; white-space: nowrap; }
.top-up .tiny { margin: 0; }
@media (prefers-reduced-motion: reduce) {
  dialog { animation: none; }
}
</style>
