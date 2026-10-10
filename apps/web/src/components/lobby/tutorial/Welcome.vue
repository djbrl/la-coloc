<script setup lang="ts">
// The tutorial's two welcome cards, centred on an otherwise empty screen: the first says what La Coloc is and
// that a short tutorial follows; the last, once the real city is built around you, says what the city is for
// and hands you the keys. Each has one main action.
import { onMounted, ref } from "vue";

const props = defineProps<{ step: "welcome" | "city"; busy: boolean }>();
const emit = defineEmits<{ start: []; skip: []; end: [] }>();

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
      <template v-if="props.step === 'welcome'">
        <h2 id="tutorial-welcome-title">Welcome to La Coloc.</h2>
        <p>A city of houses. A house is a server a few devs share, and you get a room in one for your project.</p>
        <p class="soft">A short tutorial: by the end, your first project is online.</p>
        <div class="nav">
          <button type="button" class="link quiet" :disabled="busy" @click="emit('skip')">Skip the tutorial</button>
          <button ref="go" type="button" class="primary go" :disabled="busy" @click="emit('start')">Start</button>
        </div>
      </template>
      <template v-else>
        <h2 id="tutorial-welcome-title">Welcome to the city.</h2>
        <p>Go into any house to see who lives there and what they build. Knock on a free room to ask for it: the flatmates vote.</p>
        <p class="soft">The map, bottom right, takes you to other cities. The tutorial is in settings.</p>
        <div class="nav">
          <button ref="go" type="button" class="primary go" @click="emit('end')">Let's go</button>
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
  border-radius: 28px;
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
  animation: menu-pop 0.24s cubic-bezier(0.2, 0.9, 0.3, 1.2);
}
@keyframes menu-pop {
  from { opacity: 0; transform: translateY(12px) scale(0.94); }
}
h2 { margin: 0; font-size: 32px; line-height: 1.1; font-weight: 700; letter-spacing: -0.02em; }
p { margin: 0; font-size: 17px; line-height: 1.5; }
.soft { color: var(--muted); }
.nav { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 12px; }
/* The way out on the left, a quiet grey button; the main action as wide as the rest of the line, in the accent. */
.nav > .quiet:first-child { margin-right: auto; }
.quiet { min-height: 52px; padding: 0 18px; border-radius: 14px; background: var(--fill); color: var(--muted); font-size: 15px; font-weight: 600; }
.quiet:hover:not(:disabled) { background: var(--fill-hover); color: var(--text); text-decoration: none; }
.go { flex: 1 1 auto; min-height: 52px; padding: 0 24px; border-radius: 14px; font-size: 17px; font-weight: 700; }
:is(.quiet, .go):active:not(:disabled) { transform: scale(0.97); }
button:focus-visible { outline: 3px solid var(--accent-fill); outline-offset: 2px; }
@media (max-width: 520px) {
  .card { padding: 22px 20px 18px; border-radius: 24px; }
  h2 { font-size: 26px; }
  p { font-size: 16px; }
}
@media (prefers-reduced-motion: reduce) {
  .card { animation: none; }
  :is(.quiet, .go):active:not(:disabled) { transform: none; }
}
</style>
