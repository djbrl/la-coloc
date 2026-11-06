<script setup lang="ts">
// A spotlight on the one control a tutorial step is about (Jib, 6 11: "a square that focuses on where you need to
// click", not a tooltip on the side). A yellow-edged hole around the control, the rest of the screen dimmed, and a
// very short line next to it (the slot: a sentence, and a button when the step has one). It never takes a click:
// the control under the hole works as it always does, and so does everything else.
//
// It follows the control every frame, so a window popping in, a panel scrolling or the screen turning keeps the hole
// on it. While the control isn't on screen (a window still opening, another tab shown), there's no dim and the line
// waits at the bottom of the screen, so the step can always be read and done.
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { type Box, placeLine, ringAround, same, type Side } from "./spot";

const props = defineProps<{
  // The control, as a CSS selector (the first match on the page).
  target: string;
  // The region's hidden name: the quest, and the chapter you're in.
  label: string;
  // Where the keyboard lands when the step starts: the control itself, or the line's main button (`.go`).
  focus?: "target" | "line";
  // The side of the control the line tries first (spot.ts): under it unless the step says otherwise.
  side?: Side;
}>();

const hole = ref<Box | null>(null);
const at = ref<{ left: number; top: number } | null>(null);
const line = ref<HTMLElement | null>(null);

let frame = 0;
function track() {
  const box = document.querySelector(props.target)?.getBoundingClientRect();
  const next = box && box.width && box.height ? ringAround(box) : null;
  if (!same(next, hole.value)) hole.value = next;
  const size = line.value ? { width: line.value.offsetWidth, height: line.value.offsetHeight } : null;
  const place = next && size ? placeLine(next, size, { width: window.innerWidth, height: window.innerHeight }, props.side) : null;
  if (!same(place, at.value)) at.value = place;
  frame = requestAnimationFrame(track);
}

// The keyboard goes to what the step is about, once the window around it has settled.
let focusTimer = 0;
function land() {
  clearTimeout(focusTimer);
  if (!props.focus) return;
  focusTimer = window.setTimeout(() => {
    const el = props.focus === "target" ? document.querySelector<HTMLElement>(props.target) : line.value?.querySelector<HTMLElement>(".go");
    el?.focus({ preventScroll: true });
  }, 200);
}
watch(() => props.target, async () => {
  await nextTick();
  land();
});

// Enter and Space press the line's button; they must not reach the engine, where Enter means "use what's in reach".
function onKey(e: KeyboardEvent) {
  if (e.key === "Enter" || e.key === " ") e.stopPropagation();
}

onMounted(() => {
  frame = requestAnimationFrame(track);
  land();
});
onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  clearTimeout(focusTimer);
});
const px = (b: Box) => ({ left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` });
</script>

<template>
  <Teleport to="body">
    <div class="spotlight">
      <span v-if="hole" class="hole" :style="px(hole)" aria-hidden="true" />
      <section
        ref="line"
        class="line"
        :class="{ loose: !hole, waiting: !!hole && !at }"
        :style="hole && at ? { left: `${at.left}px`, top: `${at.top}px` } : undefined"
        role="region"
        :aria-label="label"
        aria-live="polite"
        @keydown="onKey"
      >
        <slot />
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
/* Over the house's window and the HUD, under the walkthrough (900). It takes no click itself. */
.spotlight { position: fixed; inset: 0; z-index: 800; pointer-events: none; }
/* The hole in the dark: its huge shadow is the dim, and the sticker's yellow marks the edge. */
.hole {
  position: fixed;
  border-radius: var(--r-md);
  box-shadow: 0 0 0 3px var(--sticker), 0 0 0 100vmax var(--scrim);
  transition: left var(--dur) var(--ease), top var(--dur) var(--ease), width var(--dur) var(--ease), height var(--dur) var(--ease);
}
/* The line: a small white card (carte blanche) beside the hole. */
.line {
  position: fixed;
  pointer-events: auto;
  width: max-content;
  max-width: min(420px, calc(100vw - 32px));
  display: grid;
  gap: 12px;
  padding: 20px;
  border-radius: var(--card-r);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
  animation: line-pop var(--dur-slow) var(--ease-pop);
}
/* Nothing to point at yet: along the bottom of the screen, in the middle. */
.line.loose { left: 50%; bottom: 24px; transform: translateX(-50%); }
/* Measured before it's placed: one frame out of sight. */
.line.waiting { visibility: hidden; }
@keyframes line-pop {
  from { opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .hole { transition: none; }
  .line { animation: none; }
}
</style>
