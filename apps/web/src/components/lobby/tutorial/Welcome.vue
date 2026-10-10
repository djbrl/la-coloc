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
/* A flat piece of the site's surface, lifted by a shadow: no glass, no blur. */
.card {
  width: min(520px, 100%);
  display: grid;
  gap: 12px;
  padding: 28px 28px 20px;
  border-radius: 24px;
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
}
h2 { margin: 0; font-size: 30px; line-height: 1.12; font-weight: 600; letter-spacing: -0.02em; }
p { margin: 0; font-size: 17px; line-height: 1.5; }
.soft { color: var(--muted); }
.nav { display: flex; align-items: center; justify-content: flex-end; gap: 14px; margin-top: 10px; }
.nav > .quiet:first-child { margin-right: auto; }
.quiet { min-height: 36px; font-size: 15px; color: var(--muted); }
.go { min-height: 44px; padding: 0 22px; font-size: 17px; }
button:focus-visible { outline: 3px solid var(--accent-fill); outline-offset: 2px; }
@media (max-width: 520px) {
  .card { padding: 22px 20px 16px; border-radius: 20px; }
  h2 { font-size: 26px; }
  p { font-size: 16px; }
}
</style>
