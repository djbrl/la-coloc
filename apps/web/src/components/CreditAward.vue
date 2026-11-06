<script setup lang="ts">
// The credit, given with some ceremony but in a window like the other steps (carte blanche): the sum counts up from 0 on its tile,
// and when it lands, the coin's sound. How to get more sits below it: two ways to earn it, and buying it (the credit's
// card has the amounts). The key was there all along, so nobody has to sit
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
  <dialog ref="dialog" class="sign award" :aria-label="w.awardTitle(fcfa(amount))" @cancel.prevent>
    <div class="sign-frame">
      <header class="sign-band">
        <span class="chip"><Icon name="coin" :size="22" /></span>
        <h2>{{ w.awardBand }}</h2>
        <p class="sign-sub">{{ w.fake }}</p>
      </header>
      <div class="sign-body body">
        <p class="stat" aria-hidden="true"><strong>{{ digits(shown) }} {{ w.unit }}</strong><span>{{ w.given }}</span></p>
        <div class="earn-more">
          <p class="label">{{ w.awardEarn }}</p>
          <ul class="earn">
            <li><Icon name="check" :size="18" />{{ w.review }}</li>
            <li><Icon name="trophy" :size="18" />{{ w.arena }}</li>
            <li><Icon name="plus" :size="18" />{{ w.buy }}</li>
          </ul>
        </div>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <div class="foot">
          <button v-if="error" type="button" class="second" :disabled="saving" @click="emit('back')">{{ ww.back }}</button>
          <button type="button" class="primary go" autofocus :disabled="saving" @click="emit('go')">{{ error ? w.tryAgain : w.awardGo }}<kbd aria-hidden="true">↵</kbd></button>
        </div>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
dialog { width: min(460px, calc(100vw - 32px)); padding: 0; border: 0; background: none; color: var(--text); overflow: visible; animation: menu-pop var(--dur-slow) var(--ease-pop); }
dialog::backdrop { background: var(--scrim); }
@keyframes menu-pop {
  from { opacity: 0; transform: translateY(10px) scale(0.94); }
}
.body { display: grid; gap: 16px; }
/* The sum on a soft tile, in the red, counting up. */
.stat { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; margin: 0; padding: 14px 16px; border-radius: var(--tile-r); background: var(--tile); color: var(--muted); font-size: 15px; }
.stat strong { font: 800 32px/1.15 var(--display); color: var(--accent); font-variant-numeric: tabular-nums; white-space: nowrap; }
.earn-more { display: grid; gap: 8px; }
.earn { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
.earn li { display: flex; align-items: center; gap: 10px; min-height: 28px; font-size: 15px; font-weight: 800; line-height: 20px; }
.earn :deep(svg) { flex: none; color: var(--muted); }
.error { margin: 0; color: var(--danger); font-size: 15px; }
.foot { display: flex; gap: 10px; }
.foot > button { flex: 1 1 0; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
.foot > .go { flex-grow: 2; }
@media (prefers-reduced-motion: reduce) {
  dialog { animation: none; }
}
</style>
