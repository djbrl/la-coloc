<script setup lang="ts">
// The coach: a flat card at the bottom centre of the lobby during the tutorial. Six dots for the six steps, one
// sentence for the step you're on, one action when the step has one, and a quiet way out. The step machine
// itself lives in tutorial.ts; this only shows it.
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { TutorialState } from "../../../types";
import { type Step, STEPS } from "./tutorial";

const props = defineProps<{
  step: Step;
  state: TutorialState | null;
  // The server doesn't have the tutorial yet (404).
  missing: boolean;
  busy: boolean;
  error: string;
  // "Run it" was pressed: the sentence follows the room's status.
  ran: boolean;
}>();
const emit = defineEmits<{ room: []; run: []; next: []; skipGithub: []; finish: []; skip: [] }>();

const index = computed(() => STEPS.indexOf(props.step));
// Phones and tablets: talk about tapping, not keys.
const touch = typeof window !== "undefined" && window.matchMedia("(hover: none)").matches;

// The room's status, in the words of the step that runs it.
const room = computed(() => props.state?.room ?? null);
const live = computed(() => room.value?.status === "live");
const failed = computed(() => room.value?.status === "failed" || room.value?.status === "down");
const running = computed(() => {
  const s = room.value?.status ?? "";
  if (s === "starting") return "Starting…";
  if (s === "deploying" || s === "building" || (props.ran && s === "empty")) return "Building…";
  return "";
});
const installUrl = computed(() => props.state?.github.installUrl ?? null);

// Enter and Space press the focused button; they must not reach the engine, where Enter means "use what's in
// reach". Every other key (W A S D, E, Escape) passes, so you can still walk with the coach in focus.
function onKey(e: KeyboardEvent) {
  if (e.key === "Enter" || e.key === " ") e.stopPropagation();
}

// A step with an action puts its button under the keyboard, a moment after the inside (which takes focus when
// it opens) has settled.
const go = ref<HTMLElement | null>(null);
let timer = 0;
watch(
  [() => props.step, live],
  () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => go.value?.focus({ preventScroll: true }), 120);
  },
  { flush: "post" },
);
onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <div class="coach" role="dialog" aria-label="The tutorial" @keydown="onKey">
    <div class="dots" aria-hidden="true">
      <span v-for="(s, i) in STEPS" :key="s" class="d" :class="{ on: i === index, done: i < index }" />
    </div>
    <span class="sr-only">Step {{ index + 1 }} of {{ STEPS.length }}.</span>

    <div class="body" aria-live="polite">
      <p v-if="missing" class="text">The tutorial isn't on this server yet.</p>

      <p v-else-if="step === 'walk'" class="text">
        <template v-if="touch">Walk to the workshop: tap where to go.</template>
        <template v-else>Walk to the workshop: <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>, or click where to go.</template>
      </p>

      <p v-else-if="step === 'enter'" class="text">
        <template v-if="touch">Tap Go in.</template>
        <template v-else>Press <kbd>E</kbd> to go in.</template>
      </p>

      <p v-else-if="step === 'room'" class="text">Take your first room.</p>

      <template v-else-if="step === 'run'">
        <p v-if="live" class="text">
          It's live. <a v-if="room?.url" class="open" :href="room.url" target="_blank" rel="noopener">Open it ›</a>
        </p>
        <p v-else-if="error" class="text">{{ error }}</p>
        <p v-else-if="failed" class="text">It didn't start.</p>
        <p v-else-if="running" class="text">{{ running }}</p>
        <p v-else class="text">Run the sample project.</p>
      </template>

      <template v-else-if="step === 'github'">
        <p class="text">Link your GitHub: install the app on a repo and the house will review your pull requests.</p>
        <p v-if="!installUrl" class="sub">GitHub isn't set up on this server.</p>
      </template>

      <p v-else class="text">That's it. Your room stays yours in the workshop.</p>

      <p v-if="error && step !== 'run'" class="sub error" role="alert">{{ error }}</p>
    </div>

    <div class="nav">
      <button type="button" class="link quiet" @click="emit('skip')">Skip the tutorial</button>

      <button v-if="missing" ref="go" type="button" class="primary go" :disabled="busy" @click="emit('skip')">Leave</button>
      <button v-else-if="step === 'room'" ref="go" type="button" class="primary go" :disabled="busy" @click="emit('room')">Take a room</button>
      <template v-else-if="step === 'run'">
        <button v-if="live" ref="go" type="button" class="primary go" @click="emit('next')">Next</button>
        <button v-else-if="error || failed" ref="go" type="button" class="primary go" :disabled="busy" @click="emit('run')">Try again</button>
        <button v-else-if="!running" ref="go" type="button" class="primary go" :disabled="busy" @click="emit('run')">Run it</button>
      </template>
      <template v-else-if="step === 'github'">
        <button type="button" class="link quiet" @click="emit('skipGithub')">Skip for now</button>
        <a v-if="installUrl" ref="go" class="button primary go" :href="installUrl" target="_blank" rel="noopener">Install the app ›</a>
      </template>
      <button v-else-if="step === 'done'" ref="go" type="button" class="primary go" :disabled="busy" @click="emit('finish')">Into the city</button>
    </div>
  </div>
</template>

<style scoped>
/* A flat piece of the site's surface, lifted by a shadow: no glass, no blur. */
.coach {
  width: min(520px, calc(100vw - 32px));
  display: grid;
  gap: 10px;
  padding: 14px 18px 12px;
  border-radius: 20px;
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
}
/* The progress line: six dots, the ones behind you filled, the one you're on drawn out. */
.dots { display: flex; gap: 5px; }
.d { width: 6px; height: 6px; border-radius: 3px; background: var(--fill-hover); transition: width 0.2s, background 0.2s; }
.d.done { background: var(--accent-fill); }
.d.on { width: 18px; background: var(--accent-fill); }
.body { display: grid; gap: 4px; }
.text { margin: 0; font-size: 17px; line-height: 1.4; }
.sub { margin: 0; font-size: 14px; line-height: 1.4; color: var(--muted); }
.error { color: var(--danger); }
.open { color: var(--accent); text-decoration: none; white-space: nowrap; }
.open:hover { text-decoration: underline; }
kbd { font: 600 12px/1 var(--font); padding: 3px 5px; margin: 0 1px; border-radius: 5px; border: 1px solid var(--hairline); background: var(--fill); color: inherit; }
.nav { display: flex; align-items: center; justify-content: flex-end; gap: 14px; }
/* The way out sits on the left, in the muted colour; the step's action on the right. */
.nav > .quiet:first-child { margin-right: auto; }
.quiet { min-height: 36px; font-size: 14px; color: var(--muted); }
.go { min-height: 40px; padding: 0 18px; font-size: 15px; }
button:focus-visible, a:focus-visible { outline: 3px solid var(--accent-fill); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  .d { transition: none; }
}
@media (hover: none) {
  kbd { display: none; }
}
@media (max-width: 520px) {
  .coach { padding: 12px 16px 10px; border-radius: 18px; }
  .text { font-size: 15px; }
}
</style>
