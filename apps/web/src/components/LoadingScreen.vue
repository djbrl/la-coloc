<script setup lang="ts">
// The city's loading screen: the name, a thin progress line, and one tip at a time.
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
        <p :key="tip" class="tip">{{ TIPS[tip] }}</p>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.loading { position: absolute; inset: 0; z-index: 30; display: grid; place-items: center; background: radial-gradient(120% 90% at 50% 0%, #3b2d63 0%, #1b1630 55%, #0f0c1c 100%); color: #f5f5f7; transition: opacity 0.6s ease; }
.loading.leaving { opacity: 0; pointer-events: none; }
.center { width: min(420px, 80vw); text-align: center; display: grid; gap: 22px; }
.name { margin: 0; font-size: 44px; font-weight: 600; letter-spacing: -0.03em; }
.track { height: 3px; border-radius: 3px; background: rgba(255, 255, 255, 0.14); overflow: hidden; }
.bar { height: 100%; background: #f5f5f7; border-radius: 3px; transition: width 0.4s ease; }
.bar.unknown { width: 30%; animation: slide 1.4s ease-in-out infinite; }
.tip { margin: 0; min-height: 3em; font-size: 15px; line-height: 1.5; color: rgba(245, 245, 247, 0.72); }
.tip-enter-active, .tip-leave-active { transition: opacity 0.35s ease; }
.tip-enter-from, .tip-leave-to { opacity: 0; }
@keyframes slide {
  from { transform: translateX(-110%); }
  to { transform: translateX(370%); }
}
@media (prefers-reduced-motion: reduce) {
  .bar.unknown { animation: none; width: 60%; }
  .loading, .tip-enter-active, .tip-leave-active { transition: none; }
}
</style>
