<script setup lang="ts">
// The city's loading screen, like a game's: a still of the city by day drifting slowly behind (rendered from our own
// scene, public/loading/*.webp, ~80 KB each), and on a flat card the name in bold, what it is in one line (the one
// moment we're sure to be read), a chunky progress bar, and one fact at a time. The card is in the night colours
// (the class "tone-night"), day or night, so it reads the same over any picture.
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { hudWords as w } from "./lobby/words";

const props = withDefaults(defineProps<{ progress?: number | null; leaving?: boolean }>(), { progress: null, leaving: false });

// One fact at a time, in the language chosen now (lobby/words.ts).
const facts = computed(() => w.loadingTips);
const tip = ref(0);

// The city you're arriving in, if the address says (?city=Kigali) and we have its picture; any of them otherwise.
const PICTURES = ["dakar", "kigali", "marrakech", "tunis"];
function pictureFor(): string {
  const city = new URLSearchParams(location.search).get("city")?.toLowerCase() ?? "";
  const known = PICTURES.find((p) => p === city);
  return `/loading/${known ?? PICTURES[Math.floor(Math.random() * PICTURES.length)]}.webp`;
}
const picture = `url("${pictureFor()}")`;
let timer: number | undefined;

onMounted(() => {
  tip.value = Math.floor(Math.random() * facts.value.length);
  timer = window.setInterval(() => (tip.value = (tip.value + 1) % facts.value.length), 3200);
});
onBeforeUnmount(() => clearInterval(timer));
</script>

<template>
  <div class="loading" :class="{ leaving: props.leaving }" role="status" aria-live="polite">
    <div class="city" :style="{ backgroundImage: picture }" aria-hidden="true" />
    <div class="center tone-night">
      <p class="name">La Coloc</p>
      <p class="pitch">{{ w.pitch }}</p>
      <div class="track" :aria-label="props.progress === null ? w.loading : w.loadingPercent(Math.round(props.progress * 100))">
        <div class="bar" :class="{ unknown: props.progress === null }" :style="props.progress === null ? {} : { width: `${Math.max(4, props.progress * 100)}%` }" />
      </div>
      <Transition name="tip" mode="out-in">
        <p :key="tip" class="tip">{{ facts[tip] }}</p>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
/* The city by day fills the screen and drifts slowly, like a game's title screen; the sky colour shows while the
   picture loads. A flat card holds the words: no blur, no glass. */
.loading {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  padding: 16px;
  overflow: hidden;
  background: #cfe2f2;
  transition: opacity 0.6s var(--ease);
}
.loading.leaving { opacity: 0; pointer-events: none; }
.city { position: absolute; inset: -4%; background: center / cover no-repeat; animation: drift 24s ease-in-out infinite alternate; }
@keyframes drift {
  from { transform: scale(1.04) translate(-1.5%, 1%); }
  to { transform: scale(1.1) translate(1.5%, -1%); }
}
.center { position: relative; width: min(440px, 100%); text-align: center; display: grid; gap: 22px; justify-items: center; padding: 32px 28px 28px; border-radius: var(--r-xl); background: var(--surface); color: var(--text); box-shadow: var(--shadow); }
.name { margin: 0; font: 800 56px/0.95 var(--display); letter-spacing: -0.04em; }
.pitch { margin: -10px 0 0; font-size: 17px; font-weight: 500; line-height: 1.35; color: var(--muted); }
/* A chunky bar like a game's: a sunken track with an edge, filled in the orange with diagonal stripes that move. */
.track { width: 100%; height: 14px; padding: 3px; border-radius: var(--r-sm); background: var(--sunken); box-shadow: inset 0 0 0 1px var(--line-strong); overflow: hidden; }
.bar {
  height: 100%;
  border-radius: 4px;
  background:
    repeating-linear-gradient(-45deg, transparent 0 6px, color-mix(in srgb, var(--on-accent) 16%, transparent) 6px 12px),
    var(--accent-fill);
  background-size: 17px 100%, auto;
  transition: width 0.4s var(--ease);
  animation: stripes 0.6s linear infinite;
}
.bar.unknown { width: 30%; animation: stripes 0.6s linear infinite, slide 1.4s var(--ease) infinite; }
/* The fact: one sentence on a sunken tile inside the card. */
.tip { display: grid; place-items: center; margin: 0; min-height: 3.6em; width: 100%; box-sizing: border-box; padding: 12px 16px; border-radius: var(--r-md); background: var(--tile); font-size: 15px; line-height: 1.45; text-align: center; }
.tip-enter-active { transition: opacity var(--dur) var(--ease), transform var(--dur-slow) var(--ease-pop); }
.tip-leave-active { transition: opacity var(--dur-fast) var(--ease); }
.tip-enter-from { opacity: 0; transform: translateY(6px); }
.tip-leave-to { opacity: 0; }
@keyframes slide {
  from { transform: translateX(-110%); }
  to { transform: translateX(370%); }
}
@keyframes stripes {
  to { background-position: 17px 0, 0 0; }
}
@media (max-width: 520px) {
  .name { font-size: 44px; }
  .center { padding: 24px 18px 20px; }
}
@media (prefers-reduced-motion: reduce) {
  .bar, .bar.unknown, .city { animation: none; }
  .bar.unknown { width: 60%; }
  .loading, .tip-enter-active, .tip-leave-active { transition: none; }
}
</style>
