<script setup lang="ts">
// The window's rundown: the house panel's parts one at a time, each ringed in the accent colour with a short
// sentence beside it and a Next button. The tutorial asks for it in the workshop, and it's also the first-time
// tour of any house. HouseInside marks the parts with data-tour="…"; this finds them, brings each into view in
// whatever box around it scrolls (the panel's body, say, or nothing at all), measures it, and draws the ring and
// the bubble over it, keeping the bubble inside the house view. No library: a few rectangles and some arithmetic.
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { houseWords as w } from "./words";

const props = defineProps<{
  // The house's name, for the first sentence.
  name: string;
  // An example house: nothing runs there, so the first sentence says that instead of what the dot means.
  demo?: boolean;
  // Said after "Your next step is always here." when the foot has a button: what that step is, in a few words.
  next?: string | null;
}>();
const emit = defineEmits<{ done: [] }>();

// The parts, in the order a newcomer reads the window. A part the panel isn't showing (the tabs, for a visitor)
// is skipped. `below`: the part the bubble sits under, when that isn't the part itself (the head's bubble goes
// under the faces and the house's exchange lines, so it never covers them).
const steps = computed((): { part: string; text: string; below?: string }[] => [
  {
    part: "header",
    text: props.demo ? w.tour.headerExample(props.name) : w.tour.header(props.name),
  },
  { part: "rooms", text: w.tour.rooms },
  { part: "tabs", text: w.tour.tabs },
  { part: "foot", text: props.next ? `${w.tour.foot} ${props.next}` : w.tour.foot },
]);

// The ring's 4px offset and its 3px line, then 10px of air before the bubble.
const GAP = 4 + 3 + 10;
// What the bubble keeps from the house view's edges.
const EDGE = 8;
// The widest the bubble gets.
const BUBBLE_WIDTH = 340;

// Our own box covers the house view (our parent), so every position below is in pixels from its top left corner.
const layer = ref<HTMLElement | null>(null);
const bubble = ref<HTMLElement | null>(null);
const next = ref<HTMLButtonElement | null>(null);
const step = ref(0);
// The steps actually shown, for the dots.
const shown = ref<number[]>([]);
const ring = ref<{ left: number; top: number; width: number; height: number } | null>(null);
const spot = ref({ left: 0, top: 0, width: BUBBLE_WIDTH });

const isLast = computed(() => !shown.value.some((i) => i > step.value));

// The element a step is about, or null when the house view isn't showing it.
function part(i: number): HTMLElement | null {
  return find(steps.value[i].part);
}
function find(name: string): HTMLElement | null {
  const el = layer.value?.parentElement?.querySelector<HTMLElement>(`[data-tour="${name}"]`) ?? null;
  // A part that draws nothing (an empty tab bar) isn't there.
  return el && el.getClientRects().length ? el : null;
}

type Box = { top: number; bottom: number; left: number; right: number };

// The part of `el`'s box that can be seen: cut by every box around it that clips (scrolls or hides overflow), and
// by the window.
function seen(el: HTMLElement): Box {
  const r = el.getBoundingClientRect();
  const box: Box = { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  for (let up = el.parentElement; up; up = up.parentElement) {
    const style = getComputedStyle(up);
    if (style.overflowX === "visible" && style.overflowY === "visible") continue;
    const c = up.getBoundingClientRect();
    box.top = Math.max(box.top, c.top);
    box.bottom = Math.min(box.bottom, c.bottom);
    box.left = Math.max(box.left, c.left);
    box.right = Math.min(box.right, c.right);
  }
  box.top = Math.max(box.top, 0);
  box.bottom = Math.min(box.bottom, window.innerHeight);
  return box;
}

// Where the ring and the bubble go for the current step. The ring covers what can be seen of the part; the
// bubble goes under it if it fits in the house view, over it if not, and otherwise sits at the view's bottom,
// over the part (a long list of rooms), because it holds the button.
function measure() {
  const host = layer.value?.parentElement;
  const el = part(step.value);
  if (!host || !el) return;
  const h = host.getBoundingClientRect();
  const view = seen(host);
  const p = seen(el);
  const top = p.top - h.top;
  const height = Math.max(0, p.bottom - p.top);
  ring.value = { left: p.left - h.left, top, width: Math.max(0, p.right - p.left), height };

  const width = Math.min(BUBBLE_WIDTH, h.width - 2 * EDGE);
  const left = Math.min(Math.max(EDGE, p.left - h.left), h.width - width - EDGE);
  const tall = bubble.value?.offsetHeight ?? 120;
  const floor = view.bottom - h.top - EDGE;
  const ceiling = view.top - h.top + EDGE;
  // Under the part, or under the one the step names in `below` when that's further down.
  const under = steps.value[step.value].below ? find(steps.value[step.value].below!) : null;
  const bottom = Math.max(top + height, under ? seen(under).bottom - h.top : 0);
  let y = bottom + GAP;
  if (y + tall > floor) y = top - GAP - tall >= ceiling ? top - GAP - tall : floor - tall;
  spot.value = { left, top: Math.max(ceiling, y), width };
}

// Brings the part into view in every box around it that scrolls, as little as possible. In the lobby nothing
// around the head or the foot scrolls, so this only ever moves the panel's body (to show the rooms).
function bringIntoView() {
  const el = part(step.value);
  if (!el) return;
  const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: still ? "auto" : "smooth" });
}

// Shows step `i`, skipping any part the house view isn't showing; past the last one, the rundown is over.
async function show(i: number) {
  while (i < steps.value.length && !part(i)) i++;
  if (i >= steps.value.length) return finish();
  step.value = i;
  bringIntoView();
  measure();
  // Wait for the bubble to hold this step's sentence: only then is its height real.
  await nextTick();
  measure();
  next.value?.focus({ preventScroll: true });
}

function forward() {
  if (isLast.value) finish();
  else show(step.value + 1);
}

// Focus goes back to the sheet around us, so Escape and Tab keep working once the bubble is gone.
function finish() {
  layer.value?.parentElement?.closest<HTMLElement>("[tabindex='-1']")?.focus({ preventScroll: true });
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

// The window can change size, the house view too (the stream brings a new room), the bubble with its sentence,
// and the body scrolls (smoothly, after bringIntoView): measure again each time, once a frame at most.
let frame = 0;
function soon() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(measure);
}
let watcher: ResizeObserver | null = null;
// The panel takes focus when it opens; the rundown starts a moment later, so its Next keeps it.
let timer = 0;
onMounted(() => {
  window.addEventListener("resize", soon);
  // Scroll events don't bubble, but they can be caught on the way down.
  document.addEventListener("scroll", soon, { capture: true, passive: true });
  if (typeof ResizeObserver !== "undefined" && layer.value?.parentElement) {
    watcher = new ResizeObserver(soon);
    watcher.observe(layer.value.parentElement);
  }
  timer = window.setTimeout(() => {
    shown.value = steps.value.map((_, i) => i).filter((i) => part(i));
    show(0);
    if (bubble.value) watcher?.observe(bubble.value);
  }, 80);
});
onBeforeUnmount(() => {
  clearTimeout(timer);
  cancelAnimationFrame(frame);
  window.removeEventListener("resize", soon);
  document.removeEventListener("scroll", soon, { capture: true });
  watcher?.disconnect();
});
</script>

<template>
  <div ref="layer" class="rundown">
    <div v-if="ring" class="ring" aria-hidden="true" :style="{ left: `${ring.left}px`, top: `${ring.top}px`, width: `${ring.width}px`, height: `${ring.height}px` }" />
    <div
      v-show="ring"
      ref="bubble"
      class="bubble"
      role="dialog"
      :aria-label="w.tour.label"
      :style="{ left: `${spot.left}px`, top: `${spot.top}px`, width: `${spot.width}px` }"
      @keydown="onKey"
      @keyup.stop
    >
      <p class="text" aria-live="polite">{{ steps[step].text }}</p>
      <div class="foot">
        <div class="dots" aria-hidden="true">
          <span v-for="i in shown" :key="i" class="d" :class="{ on: i === step }" />
        </div>
        <button ref="next" type="button" class="primary go" @click="forward">{{ isLast ? w.tour.gotIt : w.tour.next }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* A layer the size of the house view, above its content; it lets every click through except on the bubble. */
.rundown { position: absolute; inset: 0; z-index: 3; pointer-events: none; }
/* The ring sits exactly on the part; the outline draws 4px outside it. */
.ring {
  position: absolute;
  border-radius: var(--r-md);
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
  border-radius: var(--r-lg);
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
.go { min-height: 46px; padding: 0 20px; font-size: 15px; font-weight: 600; }
@media (prefers-reduced-motion: reduce) {
  .ring, .bubble { transition: none; }
}
</style>
