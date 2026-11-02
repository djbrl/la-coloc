<script setup lang="ts">
// Your credit, from the coin on the city's screen: what you have, what earns more, and where it went lately. It says
// plainly that it's the city's fake money. A native <dialog>, like the other steps: it traps focus and closes on Escape.
import { computed, onMounted, ref } from "vue";
import { me } from "../session";
import { fcfa } from "./lobby/house/server";
import Icon from "./lobby/house/Icon.vue";
import { creditWords as w } from "./words";

const emit = defineEmits<{ close: [] }>();

interface CreditDetails {
  credit: number;
  entries: { amount: number; reason: keyof typeof w.reasons; at: string }[];
  welcome: number;
  review: number;
  arena: number;
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
        <template v-if="details">
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
@media (prefers-reduced-motion: reduce) {
  dialog { animation: none; }
}
</style>
