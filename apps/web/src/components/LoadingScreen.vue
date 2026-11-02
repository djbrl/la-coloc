<script setup lang="ts">
// The city's loading screen: the landing's wall. The neon lights up letter by letter as the city loads, the next letter
// stuttering before it catches, over the same lit window, and the city's greeting is on the sidewalk. With no number to
// show, the letters come on in turn and start again. A letter's glow is a layer the browser only fades: nothing here
// costs a frame.
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { styleFor } from "../lobby/cityStyle";
import { NEON_CABLE, NEON_LETTERS, NEON_RAIL, NEON_TUBES, NEON_BROKEN, NEON_VIEW } from "./neon";
import { hudWords as w } from "./lobby/words";

const props = withDefaults(defineProps<{ progress?: number | null; leaving?: boolean }>(), { progress: null, leaving: false });

// The city you're arriving in, if the address says (?city=Kigali).
const city = new URLSearchParams(location.search).get("city");
const greeting = computed(() => (city ? styleFor(city).greeting : null));

const LETTERS = NEON_LETTERS.length;
const turn = ref(0);
const lit = computed(() => (props.progress === null ? turn.value : Math.round(props.progress * LETTERS)));
const on = computed(() => NEON_LETTERS.slice(0, lit.value).join(" "));
const next = computed(() => NEON_LETTERS[lit.value] ?? null);

let timer = 0;
onMounted(() => {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) turn.value = 4;
  else timer = window.setInterval(() => (turn.value = (turn.value + 1) % (LETTERS + 1)), 520);
});
onBeforeUnmount(() => clearInterval(timer));
</script>

<template>
  <div class="loading" :class="{ leaving: props.leaving }" role="status" aria-live="polite">
    <div class="wall">
      <div
        class="neon"
        role="progressbar"
        :aria-label="props.progress === null ? w.loading : w.loadingPercent(Math.round(props.progress * 100))"
        :aria-valuemin="0"
        :aria-valuemax="LETTERS"
        :aria-valuenow="props.progress === null ? undefined : lit"
      >
        <svg class="glass" :viewBox="NEON_VIEW" aria-hidden="true"><path class="rail" :d="NEON_RAIL" /><path class="cable" :d="NEON_CABLE" /><path :d="NEON_TUBES + ' ' + NEON_BROKEN" /></svg>
        <template v-if="on">
          <svg class="halo" :viewBox="NEON_VIEW" aria-hidden="true"><path :d="on" /></svg>
          <svg class="glow" :viewBox="NEON_VIEW" aria-hidden="true"><path :d="on" /></svg>
          <svg class="lit" :viewBox="NEON_VIEW" aria-hidden="true"><path class="tube" :d="on" /><path class="core" :d="on" /></svg>
        </template>
        <div v-if="next" :key="lit" class="next">
          <svg class="glow" :viewBox="NEON_VIEW" aria-hidden="true"><path :d="next" /></svg>
          <svg class="lit" :viewBox="NEON_VIEW" aria-hidden="true"><path class="tube" :d="next" /><path class="core" :d="next" /></svg>
        </div>
      </div>
      <img class="room" src="/loading/fenetre.jpg" alt="" />
    </div>
    <p class="sidewalk">
      <template v-if="city"><b>{{ city }}</b><span v-if="greeting">{{ greeting.text }}</span></template>
    </p>
  </div>
</template>

<style scoped>
/* Over the whole page, the top bar too: only "Offline" (65) stays above it. */
.loading {
  --u: calc(min(100vw, 1280px) / 1440);
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  flex-direction: column;
  background: #120c1c url("/loading/brique.jpg") center / cover;
  color: #fff1dc;
  transition: opacity 0.6s var(--ease);
}
.loading.leaving { opacity: 0; pointer-events: none; }
.wall { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: clamp(20px, 6vh, 56px); padding: 24px 16px 0; }
/* The name, as on the landing: dark glass always there, knocked crooked, each letter lit on top of it. */
.neon { position: relative; flex: none; width: min(680px, 86vw); aspect-ratio: 615 / 140; rotate: 3.4deg; transform-origin: 0 50%; }
.neon svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; fill: none; stroke-linecap: round; stroke-linejoin: round; }
.glass path { stroke: #4d2c3a; stroke-width: 12; }
.glass .rail { stroke: #140e18; stroke-width: 5; }
.glass .cable { stroke: #0d090f; stroke-width: 2.5; }
.halo { opacity: 0.5; filter: blur(calc(30 * var(--u))); }
.halo path { stroke: #ff2d55; stroke-width: 44; }
.glow { opacity: 0.85; filter: blur(calc(12 * var(--u))); }
.glow path { stroke: #ff2d55; stroke-width: 20; }
.lit .tube { stroke: #ff4a68; stroke-width: 12; }
.lit .core { stroke: #ffe6e6; stroke-width: 4.5; }
/* The next letter, catching. Three flashes in its half second at most. */
.next { position: absolute; inset: 0; will-change: opacity; animation: catching 520ms steps(1) both; }
@keyframes catching {
  0% { opacity: 0; }
  35% { opacity: 0.8; }
  50% { opacity: 0.1; }
  70% { opacity: 0.9; }
  100% { opacity: 0.95; }
}
/* The landing's own lit room, with the glow it throws on the bricks. */
.room { flex: 0 1 auto; min-height: 0; max-width: min(820px, 92vw); max-height: 52vh; object-fit: contain; box-shadow: 0 0 90px 20px rgba(240, 133, 58, 0.33); }
.sidewalk { flex: none; display: flex; justify-content: center; align-items: baseline; gap: 12px; min-height: 74px; margin: 24px 0 0; padding: 22px 16px; background: linear-gradient(180deg, #34293a, #231a2a); font-size: 17px; }
.sidewalk b { font: 400 24px/1 var(--display); text-transform: uppercase; letter-spacing: 0.02em; }
@media (max-height: 560px) {
  .room { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .next { animation: none; opacity: 0; }
  .loading { transition: none; }
}
</style>
