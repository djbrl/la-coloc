<script setup lang="ts">
// The quest's two cards at either end, centred on an otherwise empty screen: the first says what the next five minutes
// give you (or, for someone coming back, where they were, with "Continue"), since the door (CreationDoor.vue) has
// already said what La Coloc is; the last, once the real city is built around you, is the only one to say welcome to
// it, under its skyline. Each has one main action.
import { onMounted, ref } from "vue";
import CityArt from "./CityArt.vue";
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
    <section class="card" :class="{ city: props.step === 'city' }" role="dialog" aria-modal="true" aria-labelledby="tutorial-welcome-title" @keydown="onKey">
      <template v-if="props.step === 'welcome' && resume">
        <h2 id="tutorial-welcome-title"><span class="sr-only">{{ w.quest }}. </span>{{ w.welcomeBack }}</h2>
        <p>{{ w.resumeAt(resume.n, resume.name) }}</p>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <div class="nav">
          <button type="button" class="link quiet" :disabled="busy" @click="emit('start')">{{ w.fromStart }}</button>
          <button ref="go" type="button" class="primary go" :disabled="busy" @click="emit('resume')">{{ w.continue }}</button>
        </div>
      </template>
      <template v-else-if="props.step === 'welcome'">
        <h2 id="tutorial-welcome-title">{{ w.quest }}</h2>
        <p>{{ w.promise }}</p>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <div class="nav">
          <button type="button" class="link quiet" :disabled="busy" @click="emit('skip')">{{ w.skip }}</button>
          <button ref="go" type="button" class="primary go" :disabled="busy" @click="emit('start')">{{ w.start }}</button>
        </div>
      </template>
      <template v-else>
        <div class="hero">
          <CityArt />
          <span class="sticker new"><span class="w">{{ w.citySticker }}</span></span>
        </div>
        <div class="body">
          <h2 id="tutorial-welcome-title">{{ w.city }}</h2>
          <p>{{ w.cityPitch }}</p>
          <div class="nav">
            <button ref="go" type="button" class="primary go" @click="emit('end')">{{ w.letsGo }}</button>
          </div>
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
.error { color: var(--danger); font-size: 15px; }
h2 { margin: 0; font-size: 40px; line-height: 1; }
p { margin: 0; font-size: 17px; line-height: 1.5; }
.soft { color: var(--muted); }
.nav { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 12px; }
/* The way out on the left, a quiet grey button; the main action as wide as the rest of the line, in the accent. */
.nav > .quiet:first-child { margin-right: auto; }
/* The way out: a quiet key with a grey edge. The main action: the main key from style.css. */
.quiet { min-height: 60px; padding: 0 18px; border-radius: var(--r-md); background: var(--surface); box-shadow: var(--quiet-edge); color: var(--muted); font-size: 15px; font-weight: 600; }
.quiet:hover:not(:disabled) { background: var(--tile); color: var(--text); text-decoration: none; }
.quiet:active:not(:disabled) { transform: translateY(1px); }
.go { flex: 1 1 auto; min-height: 60px; padding: 0 24px; border-radius: var(--r-md); font-size: 19px; }
button:focus-visible { outline: 3px solid var(--ring); outline-offset: 2px; }
@media (max-width: 520px) {
  .card { padding: 22px 20px 18px; }
  h2 { font-size: 30px; }
  p { font-size: 16px; }
}
@media (prefers-reduced-motion: reduce) {
  .card { animation: none; }
  .quiet:active:not(:disabled) { transform: none; }
}
/* The sign's red line inside the edge, on the flat card. */
.card { border-radius: var(--r-md); box-shadow: inset 0 0 0 3px var(--panel-red), var(--shadow); }
/* The city's card: its skyline on the sign's red, right to the card's edge. */
.card.city { width: min(480px, 100%); gap: 0; padding: 0; overflow: hidden; box-shadow: var(--shadow); }
.hero { position: relative; height: 176px; background: var(--panel-red); }
.new { position: absolute; top: 14px; left: 14px; padding: 5px 12px 6px 10px; }
.new .w { font-size: 15px; }
.body { display: grid; gap: 8px; padding: 18px 24px 22px; }
.city h2 { font-size: 44px; }
@media (max-width: 520px) {
  .hero { height: 132px; }
  .body { padding: 14px 18px 18px; }
  .city h2 { font-size: 32px; }
}
</style>
