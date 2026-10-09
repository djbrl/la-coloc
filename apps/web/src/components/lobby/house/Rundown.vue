<script setup lang="ts">
// The window's rundown, for the tutorial: the house view's parts one at a time, each ringed in the accent colour
// with a short sentence just below it and a Next button. HouseInside marks the parts with data-tour="…"; this
// finds them, measures them, draws the ring and the bubble over them, and scrolls the panel so both are in view.
// No library: a few rectangles and a little arithmetic.
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";

const emit = defineEmits<{ done: [] }>();

// The parts, in the order a newcomer reads the window.
const steps = [
  { part: "header", text: "The house: its name, and whether its server is up." },
  { part: "actions", text: "What you can do here. These change with who you are." },
  { part: "segments", text: "Everything in the house, one panel at a time: rooms, people, the channel, chores, the fridge, the bill." },
  { part: "rooms", text: "Each tile is a room: one flatmate's project, running on the house's server." },
];

// Below a part: the ring's 4px offset, its 3px line, then 10px of air before the bubble.
const BELOW = 4 + 3 + 10;
// The panel's Back and Close bar (56px) stays on top while it scrolls: a part must come to rest under it.
const UNDER_BAR = 72;
// The widest the bubble gets.
const BUBBLE_WIDTH = 340;

// Our own box covers the house view (our parent), so every position below is in pixels from the house view's top
// left corner. The house view scrolls with the panel, so these numbers don't change when the panel scrolls.
const layer = ref<HTMLElement | null>(null);
const bubble = ref<HTMLElement | null>(null);
const next = ref<HTMLButtonElement | null>(null);
const step = ref(0);
const ring = ref<{ left: number; top: number; width: number; height: number } | null>(null);
const spot = ref({ left: 0, top: 0, width: BUBBLE_WIDTH });

const isLast = computed(() => step.value === steps.length - 1);

// The element a step is about, or null when the house view isn't showing it.
function part(i: number): HTMLElement | null {
  return layer.value?.parentElement?.querySelector<HTMLElement>(`[data-tour="${steps[i].part}"]`) ?? null;
}

// The nearest box around us that scrolls: the Inside panel (or the page itself, anywhere else).
function scroller(): HTMLElement {
  for (let el = layer.value?.parentElement ?? null; el; el = el.parentElement) {
    const y = getComputedStyle(el).overflowY;
    if (y === "auto" || y === "scroll") return el;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

// Where the ring and the bubble go for the current step, read from the part's rectangle.
function measure() {
  const host = layer.value?.parentElement;
  const el = part(step.value);
  if (!host || !el) return;
  const h = host.getBoundingClientRect();
  const p = el.getBoundingClientRect();
  ring.value = { left: p.left - h.left, top: p.top - h.top, width: p.width, height: p.height };
  // The bubble lines up with the part's left edge and keeps the same margin on the right.
  const left = Math.max(0, p.left - h.left);
  spot.value = { left, top: p.bottom - h.top + BELOW, width: Math.min(BUBBLE_WIDTH, h.width - 2 * left) };
}

// Scrolls the panel as little as possible so the part sits under the sticky bar and its bubble above the panel's
// bottom edge. When both can't fit (a tall grid of rooms), the bubble wins: it holds the button.
function bringIntoView() {
  const host = layer.value?.parentElement;
  const el = part(step.value);
  if (!host || !el || !bubble.value) return;
  const box = scroller();
  const s = box === document.scrollingElement ? { top: 0, bottom: window.innerHeight } : box.getBoundingClientRect();
  const p = el.getBoundingClientRect();
  // The bubble's bottom, worked out from where it's going rather than read from the screen, where it may still be
  // gliding from the last part.
  const bubbleBottom = host.getBoundingClientRect().top + spot.value.top + bubble.value.offsetHeight;
  const most = p.top - (s.top + UNDER_BAR); // scroll further than this and the part hides under the bar
  const least = bubbleBottom - (s.bottom - 16); // scroll less than this and the bubble is cut off at the bottom
  const by = least > most ? least : Math.min(Math.max(0, least), most);
  const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (Math.abs(by) > 1) box.scrollBy({ top: by, behavior: still ? "auto" : "smooth" });
}

// Shows step `i`, skipping any part the house view isn't showing; past the last one, the rundown is over.
async function show(i: number) {
  while (i < steps.length && !part(i)) i++;
  if (i >= steps.length) return finish();
  step.value = i;
  measure();
  // Wait for the bubble to hold this step's sentence: only then is its height real.
  await nextTick();
  bringIntoView();
  next.value?.focus({ preventScroll: true });
}

function forward() {
  if (isLast.value) finish();
  else show(step.value + 1);
}

// Focus goes back to the panel, so Escape and Tab keep working once the bubble is gone.
function finish() {
  scroller().focus?.({ preventScroll: true });
  emit("done");
}

// Enter and Space press Next and stop here, so the lobby's engine never hears them; Escape ends the rundown.
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    finish();
  } else if (e.key === "Enter" || e.key === " ") {
    e.stopPropagation();
  }
}

// The window can change size, and so can the house view (the stream brings a new room, a panel loads): measure
// again, without scrolling.
let watcher: ResizeObserver | null = null;
// The panel takes focus when it opens; the rundown starts a moment later, so its Next keeps it.
let timer = 0;
onMounted(() => {
  window.addEventListener("resize", measure);
  if (typeof ResizeObserver !== "undefined" && layer.value?.parentElement) {
    watcher = new ResizeObserver(() => measure());
    watcher.observe(layer.value.parentElement);
  }
  timer = window.setTimeout(() => show(0), 80);
});
onBeforeUnmount(() => {
  clearTimeout(timer);
  window.removeEventListener("resize", measure);
  watcher?.disconnect();
});
</script>

<template>
  <div ref="layer" class="rundown">
    <template v-if="ring">
      <div class="ring" aria-hidden="true" :style="{ left: `${ring.left}px`, top: `${ring.top}px`, width: `${ring.width}px`, height: `${ring.height}px` }" />
      <div
        ref="bubble"
        class="bubble"
        role="dialog"
        aria-label="What's in this window"
        :style="{ left: `${spot.left}px`, top: `${spot.top}px`, width: `${spot.width}px` }"
        @keydown="onKey"
        @keyup.stop
      >
        <p class="text" aria-live="polite">{{ steps[step].text }}</p>
        <div class="foot">
          <div class="dots" aria-hidden="true">
            <span v-for="(s, i) in steps" :key="s.part" class="d" :class="{ on: i === step }" />
          </div>
          <button ref="next" type="button" class="primary go" @click="forward">{{ isLast ? "Got it" : "Next" }}</button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* A layer the size of the house view, above its content; it lets every click through except on the bubble. */
.rundown { position: absolute; inset: 0; z-index: 3; pointer-events: none; }
/* The ring sits exactly on the part; the outline draws 4px outside it. */
.ring {
  position: absolute;
  border-radius: 12px;
  outline: 3px solid var(--accent);
  outline-offset: 4px;
  transition: left 0.25s var(--ease), top 0.25s var(--ease), width 0.25s var(--ease), height 0.25s var(--ease);
}
/* A small flat card on the site's surface, lifted by the small shadow. */
.bubble {
  position: absolute;
  pointer-events: auto;
  display: grid;
  gap: 10px;
  padding: 14px 14px 12px 16px;
  border-radius: 16px;
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--lift);
  border: 1px solid var(--hairline);
  transition: left 0.25s var(--ease), top 0.25s var(--ease);
}
.text { font-size: 15px; line-height: 1.38; }
.foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.dots { display: flex; gap: 5px; }
.d { width: 6px; height: 6px; border-radius: 50%; background: var(--fill); }
.d.on { width: 16px; border-radius: 3px; background: var(--accent-fill); }
.go { min-height: 36px; padding: 0 18px; font-size: 15px; }
@media (prefers-reduced-motion: reduce) {
  .ring, .bubble { transition: none; }
}
</style>
