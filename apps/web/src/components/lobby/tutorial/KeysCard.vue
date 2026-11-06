<script setup lang="ts">
// Chapter 3's moment: the room is yours. A card in the middle of the screen (carte blanche: no drawing, no ×).
//
// In the quest the first rent comes first, so nobody forgets that a house is a real server people pay for. Its card
// says what the room gives you before you pay (two numbers, then six things on a small grid), your share and what it's
// made of, how you'd pay (each provider with its mark), and one press. It's a simulation and it says so: nothing is
// sent anywhere. Then a plain confirmation: the payment went through, the room is yours, "Move in". The keys jingle
// as it lands, and Enter presses it. Moving in through an invitation (no rent) gets only the room and "Move in".
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { play } from "../../../lobby/sound";
import { fcfa } from "../house/server";
import Icon from "../house/Icon.vue";
import type { IconName } from "../house/icons";
import OperatorMark from "./OperatorMark.vue";
import { tutorialWords as w } from "./words";

const props = defineProps<{
  room: string;
  house: string;
  // The room's limits, as the API gives them (the API's own default until it has said).
  memoryMb?: number;
  cpus?: number;
  // The first rent to pay before the keys: your share, the server's whole cost, how many share it, and how people pay there.
  rent?: { share: number; total: number; shares?: number; operators: string[] } | null;
  // What a review takes off the rent, already written as money ("500 FCFA").
  credit?: string;
}>();
const emit = defineEmits<{ next: [] }>();

// The room's numbers, written the French way (0,5) or the English way (0.5) as the page's language says.
const decimal = (n: number) => n.toLocaleString(document.documentElement.lang || undefined);

// What the room gives you, shown before you pay: the two numbers first, then what comes with every room (a shell, the
// Inside tab's files, the logs, an address, a server that never sleeps).
const gets = computed<{ icon: IconName; text: string }[]>(() => [
  { icon: "gauge", text: w.getMemory(props.memoryMb ?? 256) },
  { icon: "bolt", text: w.getCpu(decimal(props.cpus ?? 0.5)) },
  { icon: "box", text: w.getProject },
  { icon: "key", text: w.getSsh },
  { icon: "folder", text: w.getFiles },
  { icon: "logs", text: w.getLogs },
  { icon: "globe", text: w.getAddress },
  { icon: "power", text: w.getAlwaysOn },
]);

const go = ref<HTMLButtonElement | null>(null);
const focusGo = () => setTimeout(() => go.value?.focus({ preventScroll: true }), 0);
onMounted(focusGo);

// The rent: unpaid, being "sent" for a moment, then the keys.
const stage = ref<"rent" | "paying" | "keys">(props.rent ? "rent" : "keys");
const operator = ref(props.rent?.operators[0] ?? "");
const PAYING_MS = 1100;
function pay() {
  stage.value = "paying";
  window.setTimeout(() => {
    stage.value = "keys";
    play("keys");
  }, PAYING_MS);
}
watch(stage, async (now) => {
  if (now !== "keys") return;
  await nextTick();
  focusGo();
});

// Enter and Space press the focused button; they must not reach the engine, where Enter means "use what's in reach".
function onKey(e: KeyboardEvent) {
  if (e.key === "Enter" || e.key === " ") e.stopPropagation();
}
</script>

<template>
  <div class="layer">
    <section v-if="stage !== 'keys'" class="card sign" role="dialog" aria-modal="true" aria-labelledby="quest-rent-title" @keydown="onKey">
      <div class="sign-frame">
        <header class="sign-band">
          <span class="chip"><Icon name="coin" :size="22" /></span>
          <h2 id="quest-rent-title">{{ w.rentTitle }}</h2>
          <p class="sign-sub">{{ w.rentWhy(house) }}</p>
        </header>
        <div class="sign-body body">
          <section class="get" aria-labelledby="quest-rent-get">
            <h3 id="quest-rent-get" class="label">{{ w.rentGet }}</h3>
            <ul>
              <li v-for="g in gets" :key="g.icon"><Icon :name="g.icon" :size="16" /><span>{{ g.text }}</span></li>
            </ul>
          </section>
          <p class="amount"><strong class="num">{{ fcfa(rent!.share) }}</strong> <span>{{ w.rentMonth }}</span></p>
          <dl class="facts">
            <div><dt>{{ w.rentServer }}</dt><dd class="num">{{ fcfa(rent!.total) }}</dd></div>
            <div v-if="rent!.shares"><dt>{{ w.rentSplit }}</dt><dd>{{ w.rentFlatmates(rent!.shares) }}</dd></div>
            <div v-if="credit"><dt>{{ w.rentReview }}</dt><dd class="num">−{{ credit }}</dd></div>
          </dl>
          <div class="pay-with">
            <p class="label" id="quest-rent-how">{{ w.rentHow }}</p>
            <div class="segmented" role="radiogroup" aria-labelledby="quest-rent-how">
              <button v-for="o in rent!.operators" :key="o" type="button" role="radio" :aria-checked="operator === o" :disabled="stage === 'paying'" @click="operator = o"><OperatorMark :name="o" />{{ o }}</button>
            </div>
          </div>
          <button ref="go" type="button" class="primary go" :disabled="stage === 'paying'" @click="pay">{{ stage === "paying" ? w.rentPaying(operator) : w.rentPay(fcfa(rent!.share)) }}<kbd aria-hidden="true">↵</kbd></button>
          <p class="mock"><Icon name="info" :size="16" />{{ w.rentMock }}</p>
        </div>
      </div>
    </section>
    <section v-else class="card sign" role="dialog" aria-modal="true" aria-labelledby="quest-keys-title" @keydown="onKey">
      <div class="sign-frame">
        <header class="sign-band">
          <span class="chip"><Icon :name="rent ? 'tick' : 'key'" :size="22" /></span>
          <h2 id="quest-keys-title"><span class="sr-only">{{ w.keysTag }}. </span>{{ rent ? w.paidTitle : w.keysTitle }}</h2>
          <p class="sign-sub">{{ rent ? w.paidLine(fcfa(rent.share), operator) : house }}</p>
        </header>
        <div class="sign-body body">
          <!-- The room, on a tile: its name ends in an ellipsis rather than wrap (the whole of it is on hover, and read out). -->
          <p class="room">
            <span class="room-icon"><Icon name="door" :size="20" /></span>
            <span class="room-text"><span class="room-name" :title="room">{{ room }}</span><span class="room-where">{{ w.keysRoom }}{{ w.keysAt(house) }}</span></span>
          </p>
          <button ref="go" type="button" class="primary go" @click="emit('next')">{{ w.moveIn }}<kbd aria-hidden="true">↵</kbd></button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.layer { position: absolute; inset: 0; z-index: 30; display: grid; place-items: center; padding: 16px; }
.card { width: min(460px, 100%); animation: menu-pop var(--dur-slow) var(--ease-pop); }
@keyframes menu-pop {
  from { opacity: 0; transform: translateY(12px) scale(0.95); }
}
.body { display: grid; gap: 14px; }
.body > * { min-width: 0; }
.num { font-variant-numeric: tabular-nums; }
/* The rent: one big number on a soft tile, then the three facts it's made of, label left and number right. */
.amount { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; margin: 0; padding: 14px 16px; border-radius: var(--tile-r); background: var(--tile); font-size: 15px; color: var(--muted); }
.amount strong { font: 800 32px/1.15 var(--display); color: var(--accent); white-space: nowrap; }
.facts { display: grid; gap: 6px; margin: 0; }
.facts > div { display: flex; justify-content: space-between; gap: 12px; font-size: 15px; line-height: 21px; }
.facts dt { color: var(--muted); }
.facts dd { margin: 0; font-weight: 800; white-space: nowrap; }
.pay-with { display: grid; gap: 8px; }
.go { width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
.mock { display: flex; align-items: center; gap: 8px; margin: 0; color: var(--muted); font-size: 13px; line-height: 18px; }
/* What you get: eight short lines on two columns, each with its icon in the red. */
.get { display: grid; gap: 8px; }
.get ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 12px; }
.get li { min-width: 0; display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 700; line-height: 20px; }
.get li span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.get :deep(svg) { color: var(--accent); }
/* The providers' names, each after its mark: a little smaller, so three fit on one line. */
.segmented { flex-wrap: wrap; }
.segmented > button { padding: 0 8px; font-size: 14px; white-space: nowrap; }
/* A phone: the eight lines a little smaller, so each fits its column. */
@media (max-width: 520px) {
  .get ul { gap: 6px 8px; }
  .get li { gap: 6px; font-size: 13px; }
}
/* After paying: the room on a tile. */
.room { display: flex; align-items: center; gap: 12px; margin: 0; padding: 12px; border-radius: var(--tile-r); background: var(--tile); }
.room-icon { flex: none; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 10px; background: var(--surface); color: var(--accent); }
.room-text { min-width: 0; display: grid; gap: 1px; }
.room-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 16px; font-weight: 800; line-height: 21px; }
.room-where { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; line-height: 18px; color: var(--muted); }
@media (hover: none) {
  kbd { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .card { animation: none; }
}
</style>
