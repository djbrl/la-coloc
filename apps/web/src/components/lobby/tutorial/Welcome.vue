<script setup lang="ts">
// The quest's two welcome cards, centred on an otherwise empty screen: the first says what La Coloc is and what
// the next five minutes give you (or, for someone coming back, where they were, with "Continue"); the last, once
// the real city is built around you, says what the city is for. Each has one main action.
import { onMounted, ref } from "vue";
import { tutorialWords as w } from "./words";

const props = defineProps<{
  step: "welcome" | "city";
  busy: boolean;
  error?: string;
  // Coming back: the chapter you'd reached (its number and name), to continue from there.
  resume?: { n: number; name: string } | null;
}>();
const emit = defineEmits<{ start: []; resume: []; skip: []; end: [] }>();

// The keyboard lands on the main action, a moment after the card appears.
const go = ref<HTMLButtonElement | null>(null);
onMounted(() => setTimeout(() => go.value?.focus({ preventScroll: true }), 0));

// Enter and Space press the focused button; they must not reach the engine, where Enter means "use what's in reach".
function onKey(e: KeyboardEvent) {
  if (e.key === "Enter" || e.key === " ") e.stopPropagation();
}
</script>

<template>
  <div class="layer">
    <section class="card" role="dialog" aria-modal="true" aria-labelledby="tutorial-welcome-title" @keydown="onKey">
      <template v-if="props.step === 'welcome' && resume">
        <p class="kicker">{{ w.quest }}</p>
        <h2 id="tutorial-welcome-title">{{ w.welcomeBack }}</h2>
        <p>{{ w.resumeAt(resume.n, resume.name) }}</p>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <div class="nav">
          <button type="button" class="link quiet" :disabled="busy" @click="emit('start')">{{ w.fromStart }}</button>
          <button ref="go" type="button" class="primary go" :disabled="busy" @click="emit('resume')">{{ w.continue }}</button>
        </div>
      </template>
      <template v-else-if="props.step === 'welcome'">
        <p class="kicker">{{ w.quest }}</p>
        <h2 id="tutorial-welcome-title">{{ w.welcome }}</h2>
        <p>{{ w.pitch }}</p>
        <p class="soft">{{ w.promise }}</p>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <div class="nav">
          <button type="button" class="link quiet" :disabled="busy" @click="emit('skip')">{{ w.skip }}</button>
          <button ref="go" type="button" class="primary go" :disabled="busy" @click="emit('start')">{{ w.start }}</button>
        </div>
      </template>
      <template v-else>
        <h2 id="tutorial-welcome-title">{{ w.city }}</h2>
        <p>{{ w.cityPitch }}</p>
        <p class="soft">{{ w.cityHint }}</p>
        <div class="nav">
          <button ref="go" type="button" class="primary go" @click="emit('end')">{{ w.letsGo }}</button>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
/* The card sits in the middle of the screen. The layer around it catches clicks, so nothing in the city is picked while you read. */
.layer { position: absolute; inset: 0; z-index: 30; display: grid; place-items: center; padding: 16px; }
/* A flat piece of the site's surface, lifted by a shadow: no glass, no blur. It pops in like a game's title card. */
.card {
  width: min(520px, 100%);
  display: grid;
  gap: 12px;
  padding: 28px 28px 22px;
  border-radius: var(--r-xl);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
  animation: menu-pop var(--dur-slow) var(--ease-pop);
}
@keyframes menu-pop {
  from { opacity: 0; transform: translateY(12px) scale(0.95); }
}
.kicker { margin: 0 0 -4px; font: 500 12px/1 var(--mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); }
.error { color: var(--danger); font-size: 15px; }
h2 { margin: 0; font-size: 40px; line-height: 1; letter-spacing: -0.035em; }
p { margin: 0; font-size: 17px; line-height: 1.5; }
.soft { color: var(--muted); }
.nav { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 12px; }
/* The way out on the left, a quiet grey button; the main action as wide as the rest of the line, in the accent. */
.nav > .quiet:first-child { margin-right: auto; }
/* The way out: a quiet key with a grey edge. The main action: the orange key (style.css gives it its lip). */
.quiet { min-height: 52px; padding: 0 18px; border-radius: var(--r-md); background: var(--surface); box-shadow: var(--quiet-edge); color: var(--muted); font-size: 15px; font-weight: 600; }
.quiet:hover:not(:disabled) { background: var(--tile); color: var(--text); text-decoration: none; }
.quiet:active:not(:disabled) { transform: translateY(1px); }
.go { flex: 1 1 auto; min-height: 52px; padding: 0 24px; border-radius: var(--r-md); font-size: 19px; }
button:focus-visible { outline: 3px solid var(--accent-fill); outline-offset: 2px; }
@media (max-width: 520px) {
  .card { padding: 22px 20px 18px; }
  h2 { font-size: 30px; }
  p { font-size: 16px; }
}
@media (prefers-reduced-motion: reduce) {
  .card { animation: none; }
  .quiet:active:not(:disabled) { transform: none; }
}
</style>
