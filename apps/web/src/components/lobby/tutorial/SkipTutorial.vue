<script setup lang="ts">
// The quest's one way out, in the screen's corner at every step (Jib, 6 11: "the tutorial is mandatory, except a skip
// tutorial button in a corner"). No card of the quest has a × or a "Not now" any more: closing a message must never
// end the quest by surprise, and leaving it on purpose is always here, in the same place.
//
// It asks once before leaving ("Skip it?" Skip / Keep going), since the quest isn't offered again. Escape works too,
// but only when nothing else is open (a house's window, the map, the key list: there Escape closes that, as always):
// a first Escape asks, Enter or a second press of Skip leaves, a second Escape keeps going. It listens before the
// city does, so the same Escape never also closes something underneath.
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { tutorialWords as w } from "./words";

const props = defineProps<{
  // Nothing on screen claims Escape right now.
  escFree: boolean;
  // A touch screen has no Escape: no key cap on the button.
  touch?: boolean;
  busy?: boolean;
  error?: string;
}>();
const emit = defineEmits<{ skip: [] }>();

const asking = ref(false);
const yes = ref<HTMLButtonElement | null>(null);
const opener = ref<HTMLButtonElement | null>(null);

async function ask() {
  asking.value = true;
  await nextTick();
  yes.value?.focus({ preventScroll: true });
}
function keepGoing() {
  asking.value = false;
}

function onKey(e: KeyboardEvent) {
  if (e.key !== "Escape" || e.metaKey || e.ctrlKey || e.altKey) return;
  const el = e.target as HTMLElement | null;
  if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
  if (!asking.value && !props.escFree) return;
  e.preventDefault();
  e.stopPropagation();
  if (asking.value) keepGoing();
  else void ask();
}
onMounted(() => window.addEventListener("keydown", onKey, true));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey, true));
</script>

<template>
  <div class="skip" :class="{ asking }">
    <button v-if="!asking" ref="opener" type="button" class="open" @click="ask">
      {{ w.skipTutorial }}<kbd v-if="!touch" aria-hidden="true">{{ w.escKey }}</kbd>
    </button>
    <div v-else class="ask" role="group" :aria-label="w.skipTutorial">
      <span class="q">{{ w.skipSure }}</span>
      <button type="button" class="second no" @click="keepGoing">{{ w.skipNo }}</button>
      <button ref="yes" type="button" class="primary yes" :disabled="busy" @click="emit('skip')">{{ w.skipYes }}</button>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.skip { display: grid; justify-items: start; gap: 6px; }
/* A small white key, like the HUD's: the corner's quiet way out, never the thing you look at first. */
.open { display: inline-flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 12px 3px 14px; border-radius: 12px; background: var(--surface); color: var(--text); box-shadow: inset 0 -3px 0 var(--quiet-lip), 0 4px 0 rgba(20, 12, 18, 0.35); font-size: 14px; }
.open:hover:not(:disabled) { background: var(--tile); }
.open kbd { min-width: 0; height: 20px; padding: 0 5px; background: var(--sunken); color: var(--text); font-size: 11px; }
/* Asked: the question and its two answers on one small white card. */
.ask { display: flex; align-items: center; gap: 8px; padding: 6px 6px 6px 14px; border-radius: 14px; background: var(--surface); box-shadow: var(--lift); animation: pop var(--dur) var(--ease-pop); }
.q { font-size: 14px; font-weight: 800; white-space: nowrap; }
.ask button { min-height: 40px; padding: 0 14px var(--lip); font-size: 14px; }
.error { max-width: 280px; margin: 0; padding: 6px 10px; border-radius: 10px; background: var(--surface); color: var(--danger); font-size: 13px; line-height: 18px; }
@keyframes pop {
  from { opacity: 0; transform: scale(0.95); }
}
@media (prefers-reduced-motion: reduce) {
  .ask { animation: none; }
}
</style>
