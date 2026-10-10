<script setup lang="ts">
// The city's loading screen, like a game's: the name in bold, a chunky progress bar, and one tip at a time on a
// small floating card. In the site's colours, so it follows day and night.
import { onBeforeUnmount, onMounted, ref } from "vue";

const props = withDefaults(defineProps<{ progress?: number | null; leaving?: boolean }>(), { progress: null, leaving: false });

const TIPS = [
  "Each house is one server, shared by the developers who live in it.",
  "Warm windows are rooms someone lives in. Blue ones are free.",
  "Knock on a free room. If the house votes yes, you move in.",
  "Rent is split by what each room actually uses.",
  "Part of the rent is paid in code reviews.",
  "Some lamps in town are still off.",
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
  <div class="loading" :class="{ leaving: props.leaving }" role="status" aria-live="polite">
    <div class="center">
      <p class="name">La Coloc</p>
      <div class="track" :aria-label="props.progress === null ? 'Loading' : `Loading, ${Math.round(props.progress * 100)} percent`">
        <div class="bar" :class="{ unknown: props.progress === null }" :style="props.progress === null ? {} : { width: `${Math.max(4, props.progress * 100)}%` }" />
      </div>
      <Transition name="tip" mode="out-in">
        <p :key="tip" class="tip"><span class="tag" aria-hidden="true">Tip</span>{{ TIPS[tip] }}</p>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
/* The whole screen, in the page's colours with a soft glow of the accent from the top. */
.loading { position: absolute; inset: 0; z-index: 30; display: grid; place-items: center; padding: 16px; background: radial-gradient(120% 80% at 50% 0%, var(--accent-soft) 0%, var(--bg-alt) 60%); color: var(--text); transition: opacity 0.6s ease; }
.loading.leaving { opacity: 0; pointer-events: none; }
.center { width: min(440px, 100%); text-align: center; display: grid; gap: 22px; justify-items: center; }
.name { margin: 0; font-size: 48px; font-weight: 800; line-height: 1; letter-spacing: -0.03em; }
/* A chunky bar in a grey track, filled in the accent. */
.track { width: 100%; height: 10px; padding: 2px; border-radius: 6px; background: var(--fill); overflow: hidden; }
.bar { height: 100%; border-radius: 4px; background: var(--accent-fill); transition: width 0.4s ease; }
.bar.unknown { width: 30%; animation: slide 1.4s ease-in-out infinite; }
/* The tip: a flat card, a small label, then the sentence. */
.tip { display: flex; align-items: flex-start; gap: 10px; margin: 0; min-height: 3.6em; padding: 12px 16px; border-radius: 18px; background: var(--surface); box-shadow: var(--lift); font-size: 15px; line-height: 1.45; text-align: left; }
.tag { flex: none; margin-top: 1px; padding: 1px 8px; border-radius: 7px; background: var(--accent-soft); color: var(--accent); font-size: 12px; font-weight: 700; line-height: 1.6; }
.tip-enter-active, .tip-leave-active { transition: opacity 0.3s ease, transform 0.3s ease; }
.tip-enter-from { opacity: 0; transform: translateY(6px); }
.tip-leave-to { opacity: 0; }
@keyframes slide {
  from { transform: translateX(-110%); }
  to { transform: translateX(370%); }
}
@media (max-width: 520px) {
  .name { font-size: 40px; }
}
@media (prefers-reduced-motion: reduce) {
  .bar.unknown { animation: none; width: 60%; }
  .loading, .tip-enter-active, .tip-leave-active { transition: none; }
}
</style>
