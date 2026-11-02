<script setup lang="ts">
// The door: the very first thing someone sees of La Coloc, before they pick a look (and again after the demo
// restarts, since picking a look does too). The whole window is the sign's red with the city's skyline along the
// bottom, one big title, one tiny line, one key. Pressing it lifts the door off the city (CharacterCreation.vue).
// The quest's last card (tutorial/Welcome.vue) is the arrival; this is only the way in.
import { onMounted, ref } from "vue";
import CityArt from "./lobby/tutorial/CityArt.vue";
import { welcomeWords as w } from "./words";

const emit = defineEmits<{ next: [] }>();

// The keyboard lands on the key: Enter or Space goes in.
const key = ref<HTMLButtonElement | null>(null);
onMounted(() => key.value?.focus({ preventScroll: true }));
</script>

<template>
  <div class="door" role="dialog" aria-modal="true" aria-labelledby="door-title">
    <div class="words">
      <h1 id="door-title">{{ w.doorHello }} <span class="name">{{ w.doorName }}</span></h1>
      <p>{{ w.doorLine }}</p>
      <button ref="key" type="button" class="enter" @click="emit('next')">{{ w.doorGo }}</button>
    </div>
    <CityArt class="skyline" />
  </div>
</template>

<style scoped>
/* Over everything in the lobby: the words fill what the skyline leaves, and the page never scrolls. */
.door {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  overflow: hidden;
  background: var(--surface);
  color: var(--text);
}
.words { display: grid; align-content: center; justify-items: center; gap: clamp(12px, 2.4dvh, 24px); padding: 16px; text-align: center; animation: door-words var(--dur-slow) var(--ease-pop) 0.1s backwards; }
h1 { font-size: clamp(36px, min(10vw, 10dvh), 124px); line-height: 0.98; }
/* The name on its own line, in the sticker's yellow: the one thing to remember. */
.name { display: block; color: var(--sticker); }
p { margin: 0; max-width: 34em; font-size: clamp(16px, 2.4dvh, 20px); line-height: 1.35; }
/* A yellow key, since a red one would vanish on the red: the same size and lip as the site's main action. */
.enter { min-height: 60px; min-width: min(280px, 100%); padding: 0 32px; background: var(--sticker); color: var(--ink); box-shadow: inset 0 0 0 1.5px var(--line), var(--lift); font-size: 20px; }
.enter:hover:not(:disabled) { background: var(--on-panel); }
.enter:active:not(:disabled) { transform: translateY(3px); box-shadow: inset 0 0 0 1.5px var(--line), var(--lift); }
.enter:focus-visible { outline: 3px solid var(--on-panel); outline-offset: 3px; }
/* The skyline stands along the whole bottom edge, and rises as you arrive. It wants 37.5% of the width to show whole;
   a tall phone gives it more (its sides crop), a very wide window less (its top crops), so the words always have room. */
.door .skyline { height: clamp(30dvh, 37.5vw, 60dvh); animation: door-rise 0.7s var(--ease-pop) backwards; }
@keyframes door-rise {
  from { transform: translateY(100%); }
}
@keyframes door-words {
  from { opacity: 0; transform: translateY(14px) scale(0.97); }
}
/* A short window, a phone on its side: the words come first. */
@media (max-height: 480px) {
  .door .skyline { height: 30dvh; }
  .enter { min-height: 50px; }
}
@media (prefers-reduced-motion: reduce) {
  .words, .door .skyline { animation: none; }
  .enter:active:not(:disabled) { transform: none; }
}
</style>
