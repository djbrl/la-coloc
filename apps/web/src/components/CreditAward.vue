<script setup lang="ts">
// The credit, given with some ceremony but in a window like the other steps: the sum counts up from 0 under the band,
// and when it lands, the coin's sound. What earns more sits below it. The key was there all along, so nobody has to sit
// through it. Calmer motion shows the final number at once. The amount is whatever /api/me says.
import { onBeforeUnmount, onMounted, ref } from "vue";
import { play } from "../lobby/sound";
import { settings } from "../settings";
import { digits } from "./credit";
import Icon from "./lobby/house/Icon.vue";
import { fcfa } from "./lobby/house/server";
import { creditWords as w, welcomeWords as ww } from "./words";

const props = defineProps<{ amount: number; saving: boolean; error: string }>();
const emit = defineEmits<{ go: []; back: [] }>();

const COUNT_MS = 1400;
const calm = settings.reduceMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const shown = ref(calm ? props.amount : 0);
const dialog = ref<HTMLDialogElement | null>(null);
let frame = 0;

function land() {
  shown.value = props.amount;
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
  dialog.value?.showModal();
  if (calm || !props.amount) land();
  else frame = requestAnimationFrame((now) => count(now, now));
});
onBeforeUnmount(() => cancelAnimationFrame(frame));
</script>

<template>
  <dialog ref="dialog" class="step-sign" :aria-label="w.awardTitle(fcfa(amount))" @cancel.prevent>
    <div class="inner">
      <div class="form">
        <h2>{{ w.awardBand }}</h2>
        <p class="stat" aria-hidden="true"><Icon name="coin" :size="34" /><strong>{{ digits(shown) }}</strong><span>{{ w.unit }}</span></p>
        <p class="tiny">{{ w.fake }}</p>
        <p class="label">{{ w.awardEarn }}</p>
        <ul class="earn">
          <li><Icon name="check" :size="22" />{{ w.review }}</li>
          <li><Icon name="trophy" :size="22" />{{ w.arena }}</li>
        </ul>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <div class="foot">
          <button v-if="error" type="button" class="second" :disabled="saving" @click="emit('back')">{{ ww.back }}</button>
          <button type="button" class="primary go" autofocus :disabled="saving" @click="emit('go')">{{ error ? w.tryAgain : w.awardGo }}</button>
        </div>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
dialog { width: min(460px, calc(100vw - 32px)); animation: menu-pop var(--dur-slow) var(--ease-pop); }
dialog::backdrop { background: var(--scrim); }
@keyframes menu-pop {
  from { opacity: 0; transform: translateY(10px) scale(0.94); }
}
.stat { display: flex; align-items: center; justify-content: center; gap: 10px; margin: 22px 0 0; color: var(--panel-red); }
.stat strong { font: 400 46px/1.05 var(--display); font-variant-numeric: tabular-nums; white-space: nowrap; }
.stat span { align-self: flex-end; padding-bottom: 6px; font: 400 18px/1 var(--display); }
.tiny { margin: 6px 0 18px; font-size: 14px; color: var(--muted); text-align: center; }
.label { margin: 0 0 6px; font-size: 14px; font-weight: 700; }
.earn { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 0 0 14px; padding: 0; list-style: none; }
.earn li { display: flex; align-items: center; gap: 8px; min-height: 50px; padding: 6px 12px; border-radius: var(--r-md); background: var(--tile); font-size: 15px; font-weight: 700; line-height: 1.2; }
.earn :deep(svg) { flex: none; color: var(--panel-red); }
.error { margin: 0 0 12px; color: var(--danger); font-size: 15px; }
.foot { display: flex; gap: 8px; }
.go { flex: 1 1 0; }
@media (prefers-reduced-motion: reduce) {
  dialog { animation: none; }
}
</style>
