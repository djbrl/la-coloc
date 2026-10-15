<script setup lang="ts">
// The dash, for touch screens: Shift does it on a keyboard, and a phone has no Shift. A big round button in the
// right thumb's reach, just above the minimap. It asks the lobby to dash (the `dash` event; the engine decides
// whether it may) and shows the breather before the next one as a ring that fills back up. Screens with a
// pointer that hovers (a mouse, a trackpad) never see it.
import { onBeforeUnmount, onMounted, ref } from "vue";

const emit = defineEmits<{ dash: [] }>();

// How long the engine waits before another dash: the burst plus the breather, DASH.length + DASH.cooldown in
// apps/web/src/lobby/Lobby.ts (0.14 s + 0.35 s). Not exported there, so it's repeated here; keep the two in step.
const READY_AFTER_MS = 490;

const touch = ref(false);
let query: MediaQueryList | null = null;
const onChange = (e: MediaQueryListEvent) => (touch.value = e.matches);
onMounted(() => {
  query = window.matchMedia?.("(hover: none)") ?? null;
  touch.value = !!query?.matches;
  query?.addEventListener("change", onChange);
});

// Each dash restarts the ring's animation (by changing its key) and dims the button until it's ready again.
// A press while it's still cooling does nothing, as Shift does nothing then.
const cooling = ref(false);
const cycle = ref(0);
let readyAt = 0;
let timer = 0;
function press() {
  const now = performance.now();
  if (now < readyAt) return;
  readyAt = now + READY_AFTER_MS;
  cooling.value = true;
  cycle.value++;
  clearTimeout(timer);
  timer = window.setTimeout(() => (cooling.value = false), READY_AFTER_MS);
  emit("dash");
}

// The thumb's touch dashes at once, on the way down, not when it lifts. A click that follows it is skipped;
// a click with no pointer before it (Enter or Space on a focused button) dashes too. A touch the browser takes
// back (a scroll) brings no click, so it clears the mark.
const pressedByPointer = ref(false);
function down() {
  pressedByPointer.value = true;
  press();
}
function click() {
  if (pressedByPointer.value) pressedByPointer.value = false;
  else press();
}

onBeforeUnmount(() => {
  query?.removeEventListener("change", onChange);
  clearTimeout(timer);
});

// The ring: a circle's outline, drawn from empty to full over the wait.
const RADIUS = 29;
const AROUND = 2 * Math.PI * RADIUS;
</script>

<template>
  <button
    v-if="touch"
    type="button"
    class="touch-dash"
    :class="{ cooling }"
    aria-label="Dash"
    :style="{ '--ready-after': `${READY_AFTER_MS}ms` }"
    @pointerdown="down"
    @pointercancel="pressedByPointer = false"
    @click="click"
    @contextmenu.prevent
  >
    <svg class="ring" viewBox="0 0 64 64" width="64" height="64" aria-hidden="true" focusable="false">
      <circle
        v-if="cycle"
        :key="cycle"
        class="fill"
        cx="32"
        cy="32"
        :r="RADIUS"
        :stroke-dasharray="AROUND"
        :style="{ '--around': AROUND }"
      />
    </svg>
    <!-- Not in icons.ts: an arrow with two speed lines behind it. -->
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      <path d="M13 6l6 6-6 6M19 12H9M3 8h4M3 16h4" />
    </svg>
  </button>
</template>

<style scoped>
/* Sits on the lobby itself (position: relative), in the right column: under the round tools, above the minimap,
   which is 130px tall on a phone and 170px elsewhere, standing 28px off the bottom (12px and 16px off the right). */
.touch-dash {
  position: absolute;
  z-index: 10;
  right: 16px;
  bottom: calc(max(28px, env(safe-area-inset-bottom)) + 170px + 16px);
  width: 64px;
  height: 64px;
  min-height: 0;
  padding: 0;
  border: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--surface);
  color: var(--accent);
  /* A game pad's button: round, with a lip that sinks when pressed. */
  box-shadow: var(--lift), 0 3px 0 var(--line-strong);
  cursor: pointer;
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
  transition: transform var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease), opacity var(--dur) var(--ease);
}
@media (max-width: 520px) {
  .touch-dash { right: 12px; bottom: calc(max(28px, env(safe-area-inset-bottom)) + 130px + 14px); }
}
.touch-dash > svg { grid-area: 1 / 1; }
/* Pushed in: it moves down by what its lip loses. */
.touch-dash:active { transform: translateY(2px); box-shadow: var(--lift), 0 1px 0 var(--line-strong); }
.touch-dash.cooling { color: var(--muted); }
.touch-dash:focus-visible { outline: 3px solid var(--accent-fill); outline-offset: 2px; }

/* The ring starts at the top and fills clockwise over the wait. */
.ring { transform: rotate(-90deg); pointer-events: none; }
.fill {
  fill: none;
  stroke: var(--accent);
  stroke-width: 4;
  stroke-linecap: round;
  stroke-dashoffset: 0;
  animation: refill var(--ready-after) linear both;
}
@keyframes refill {
  from { stroke-dashoffset: calc(var(--around) * 1px); }
  to { stroke-dashoffset: 0; }
}
/* Once full it fades, so a resting button is just the button. */
.touch-dash:not(.cooling) .fill { opacity: 0; transition: opacity 0.25s var(--ease) 0.1s; }

@media (prefers-reduced-motion: reduce) {
  .touch-dash { transition: none; }
  .touch-dash:active { transform: none; }
  /* No sweep: the dimmed icon says it's resting, and it brightens when it's ready. */
  .fill { animation: none; opacity: 0; }
}
</style>
