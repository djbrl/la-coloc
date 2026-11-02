<script setup lang="ts">
// The credit, given with some ceremony: the window clears, a big coin stands on a red burst over the city, and the
// sum counts up on its face from 0. When it lands: the coin's sound, one tiny line, and the key was there all along,
// so nobody has to sit through it. Calmer motion shows the final number at once. The amount is whatever /api/me says.
import { onBeforeUnmount, onMounted, ref } from "vue";
import { play } from "../lobby/sound";
import { settings } from "../settings";
import { digits } from "./credit";
import { fcfa } from "./lobby/house/server";
import { creditWords as w, welcomeWords as ww } from "./words";

const props = defineProps<{ amount: number; saving: boolean; error: string }>();
const emit = defineEmits<{ go: []; back: [] }>();

// The burst behind the coin: a flat star of sixteen points, around the middle of a 200×200 box.
const BURST = Array.from({ length: 32 }, (_, i) => {
  const r = i % 2 ? 72 : 100;
  const a = (i / 32) * Math.PI * 2;
  return `${(100 + r * Math.cos(a)).toFixed(1)},${(100 + r * Math.sin(a)).toFixed(1)}`;
}).join(" ");

const COUNT_MS = 1400;
const calm = settings.reduceMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const shown = ref(calm ? props.amount : 0);
const landed = ref(false);
const key = ref<HTMLButtonElement | null>(null);
let frame = 0;

function land() {
  shown.value = props.amount;
  landed.value = true;
  play("coin");
}

function count(start: number, now: number) {
  const t = Math.min(1, (now - start) / COUNT_MS);
  // Fast at first, slowing into the final sum.
  shown.value = Math.round(props.amount * (1 - (1 - t) ** 3));
  if (t < 1) frame = requestAnimationFrame((later) => count(start, later));
  else land();
}

onMounted(() => {
  key.value?.focus({ preventScroll: true });
  if (calm || !props.amount) land();
  else frame = requestAnimationFrame((now) => count(now, now));
});
onBeforeUnmount(() => cancelAnimationFrame(frame));
</script>

<template>
  <div class="award" role="dialog" aria-modal="true" aria-labelledby="award-title">
    <h2 id="award-title" class="sr-only">{{ w.awardTitle(fcfa(amount)) }}</h2>
    <div class="seal" :class="{ landed }" aria-hidden="true">
      <svg class="burst" viewBox="0 0 200 200"><polygon :points="BURST" /></svg>
      <div class="coin">
        <span class="sum">{{ digits(shown) }}</span>
        <span class="unit">{{ w.unit }}</span>
      </div>
    </div>
    <p class="line" :class="{ landed }">{{ w.awardWhy }}</p>
    <p v-if="error" class="line error" role="alert">{{ error }}</p>
    <div class="foot">
      <button v-if="error" type="button" class="second" :disabled="saving" @click="emit('back')">{{ ww.back }}</button>
      <button ref="key" type="button" class="primary go" :disabled="saving" @click="emit('go')">{{ error ? w.tryAgain : w.awardGo }}</button>
    </div>
  </div>
</template>

<style scoped>
/* The window clears: the city steps back under the scrim, with your character somewhere behind the coin. */
.award {
  --coin: clamp(150px, min(62vw, 42dvh), 340px);
  position: absolute;
  inset: 0;
  z-index: 30;
  display: grid;
  align-content: center;
  justify-items: center;
  gap: clamp(16px, 3dvh, 28px);
  padding: 16px;
  background: var(--scrim);
  animation: award-in var(--dur) var(--ease);
}
@keyframes award-in {
  from { opacity: 0; }
}
.seal { position: relative; display: grid; place-items: center; width: var(--coin); height: var(--coin); margin: calc(var(--coin) * 0.24) 0; animation: seal-in 0.5s var(--ease-pop); }
@keyframes seal-in {
  from { transform: scale(0.5); opacity: 0; }
}
/* Landing: one soft bump, as if stamped. */
.seal.landed { animation: seal-land 0.34s var(--ease-pop); }
@keyframes seal-land {
  40% { transform: scale(1.07); }
}
.burst { position: absolute; inset: -22%; width: 144%; height: 144%; fill: var(--panel-red); animation: burst-turn 24s linear infinite; }
@keyframes burst-turn {
  to { transform: rotate(360deg); }
}
/* The coin: flat yellow, a hard lip under it, and a dashed line inside its edge like the postcard's stamp. */
.coin { position: relative; display: grid; align-content: center; justify-items: center; gap: 4px; width: 100%; height: 100%; border-radius: 50%; background: var(--sticker); color: var(--ink); box-shadow: 0 9px 0 var(--accent-lip); }
.coin::before { content: ""; position: absolute; inset: 5%; border: 3px dashed var(--ink); border-radius: 50%; }
.sum { font: 800 calc(var(--coin) * 0.2)/1 var(--num); font-variant-numeric: tabular-nums; white-space: nowrap; }
.unit { font: 400 calc(var(--coin) * 0.075)/1 var(--display); }
/* The tiny line, on a flat strip so it reads over any part of the city. It arrives with the sum. */
.line { margin: 0; max-width: min(520px, 100%); padding: 8px 14px; border-radius: var(--r-md); background: var(--surface); color: var(--text); box-shadow: var(--lift); font-size: 16px; line-height: 1.35; text-align: center; opacity: 0; transition: opacity var(--dur-slow) var(--ease); }
.line.landed, .line.error { opacity: 1; }
.line.error { color: var(--danger); }
.foot { display: flex; gap: 8px; width: min(360px, 100%); }
.foot .second { flex: none; min-height: 60px; background: var(--surface); }
.go { flex: 1 1 0; min-height: 60px; font-size: 20px; box-shadow: 0 5px 0 var(--accent-lip); }
.go:focus-visible, .second:focus-visible { outline: 3px solid var(--ring); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  .award, .seal, .seal.landed, .burst { animation: none; }
  .line { transition: none; }
}
</style>
