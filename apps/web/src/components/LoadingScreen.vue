<script setup lang="ts">
// The city's loading screen, like a game's: the name in bold, what it is in one line (the one moment we're sure
// to be read), a chunky progress bar, and one fact at a time on a small floating card. Always in the night colours
// (the class "tone-night"), day or night: a game's loading screen is dark, and so is the city it fades into.
import { onBeforeUnmount, onMounted, ref } from "vue";

const props = withDefaults(defineProps<{ progress?: number | null; leaving?: boolean }>(), { progress: null, leaving: false });

const TIPS = [
  "Each house is one server, shared by the developers who live in it.",
  "Every lit window is someone's project. Blue ones are free rooms.",
  "Knock on a free room. If the house votes yes, you move in.",
  "Rent is split by what each room actually uses.",
  "Part of the rent is paid in code reviews.",
  "Merge a pull request and your room puts it online.",
];
const tip = ref(0);
let timer: number | undefined;

onMounted(() => {
  tip.value = Math.floor(Math.random() * TIPS.length);
  timer = window.setInterval(() => (tip.value = (tip.value + 1) % TIPS.length), 3200);
});
onBeforeUnmount(() => clearInterval(timer));
</script>

<template>
  <div class="loading tone-night" :class="{ leaving: props.leaving }" role="status" aria-live="polite">
    <div class="center">
      <p class="name">La Coloc</p>
      <p class="pitch">A city of dev houses, from Dakar to Kigali.</p>
      <div class="track" :aria-label="props.progress === null ? 'Loading' : `Loading, ${Math.round(props.progress * 100)} percent`">
        <div class="bar" :class="{ unknown: props.progress === null }" :style="props.progress === null ? {} : { width: `${Math.max(4, props.progress * 100)}%` }" />
      </div>
      <Transition name="tip" mode="out-in">
        <p :key="tip" class="tip">{{ TIPS[tip] }}</p>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
/* The whole screen in the night colours, a faint grid on it like a blueprint of the city, and a warm glow of the
   orange from the bottom, where the city will rise. */
.loading {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  padding: 16px;
  background:
    radial-gradient(90% 60% at 50% 110%, color-mix(in srgb, var(--accent-fill) 22%, transparent) 0%, transparent 70%),
    linear-gradient(color-mix(in srgb, var(--text) 5%, transparent) 1px, transparent 1px) 0 0 / 32px 32px,
    linear-gradient(90deg, color-mix(in srgb, var(--text) 5%, transparent) 1px, transparent 1px) 0 0 / 32px 32px,
    var(--bg);
  color: var(--text);
  transition: opacity 0.6s var(--ease);
}
.loading.leaving { opacity: 0; pointer-events: none; }
.center { width: min(440px, 100%); text-align: center; display: grid; gap: 22px; justify-items: center; }
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
/* The fact: a flat card with one sentence, the orange stripe on its left like the city's toasts. */
.tip { display: grid; place-items: center; margin: 0; min-height: 3.6em; padding: 12px 16px; border-radius: var(--r-md); background: var(--surface); box-shadow: var(--lift), inset 3px 0 0 var(--accent-fill); font-size: 15px; line-height: 1.45; text-align: center; }
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
}
@media (prefers-reduced-motion: reduce) {
  .bar, .bar.unknown { animation: none; }
  .bar.unknown { width: 60%; }
  .loading, .tip-enter-active, .tip-leave-active { transition: none; }
}
</style>
