<script setup lang="ts">
// One card of the walkthrough, with the screen dimmed around it and a ring on what it talks about. Everything else
// stands still (the step's controls are off and the layer takes every click), Next moves on, Escape or Skip leaves. It
// sits on the page's body, so it can also dim the top bar and point at what's in it.
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { keyParts, TOUR_TARGET, TOUR_TEXT } from "./tour";
import type { TourCardName } from "./tutorial";
import { tutorialWords as w } from "./words";

const props = defineProps<{ card: TourCardName; n: number; total: number; touch: boolean }>();
const emit = defineEmits<{ next: []; skip: [] }>();

const text = computed(() => TOUR_TEXT[props.card]);
const parts = computed(() => keyParts((props.touch && text.value.touch) || text.value.keys));
const last = computed(() => props.n === props.total);

// Where the ring goes: the thing's place on screen, a little bigger than it.
const RING_GAP = 6;
const ring = ref<{ left: string; top: string; width: string; height: string } | null>(null);
function measure() {
  const selector = TOUR_TARGET[props.card];
  const box = selector ? document.querySelector(selector)?.getBoundingClientRect() : null;
  ring.value = box?.width
    ? { left: `${box.left - RING_GAP}px`, top: `${box.top - RING_GAP}px`, width: `${box.width + RING_GAP * 2}px`, height: `${box.height + RING_GAP * 2}px` }
    : null;
}

const go = ref<HTMLButtonElement | null>(null);
// The pieces around the card may still be popping in when it opens: measure again once they've landed.
let again = 0;
async function settle() {
  await nextTick();
  measure();
  clearTimeout(again);
  again = window.setTimeout(measure, 350);
  go.value?.focus({ preventScroll: true });
}
watch(() => props.card, settle);

// Escape leaves wherever the focus is; Enter and Space press the button and must not reach the engine.
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    emit("skip");
  } else if (e.key === "Enter" || e.key === " ") e.stopPropagation();
}
onMounted(() => {
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", measure);
  void settle();
});
onUnmounted(() => {
  window.removeEventListener("keydown", onKey, true);
  window.removeEventListener("resize", measure);
  clearTimeout(again);
});
</script>

<template>
  <Teleport to="body">
    <div class="tour" :class="{ dim: !ring }">
      <span v-if="ring" class="spot" :style="ring" aria-hidden="true" />
      <section class="card" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-line">
        <h2 id="tour-title">{{ text.title }}</h2>
        <p id="tour-line" class="line"><template v-for="(part, i) in parts" :key="i"><kbd v-if="part.key">{{ part.text }}</kbd><template v-else>{{ part.text }}</template></template></p>
        <div class="nav">
          <span class="count">{{ n }}/{{ total }}</span>
          <button type="button" class="quiet" @click="emit('skip')">{{ w.tourSkip }}<kbd v-if="!touch">Esc</kbd></button>
          <button ref="go" type="button" class="primary go" @click="emit('next')">{{ last ? w.gotIt : w.next }}</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
/* Above everything, and in the way of every click: the walkthrough is the only thing that answers. */
.tour { position: fixed; inset: 0; z-index: 900; display: grid; place-items: center; padding: 16px; overflow: hidden; }
.tour.dim { background: var(--scrim); }
/* The hole in the dark: its huge shadow is the dim, and the sticker's yellow marks the edge. */
.spot { position: fixed; border-radius: var(--r-md); box-shadow: 0 0 0 3px var(--sticker), 0 0 0 100vmax var(--scrim); transition: left var(--dur-slow) var(--ease), top var(--dur-slow) var(--ease), width var(--dur-slow) var(--ease), height var(--dur-slow) var(--ease); }
.card { position: relative; width: min(380px, 100%); display: grid; gap: 6px; padding: 20px 22px 16px; border-radius: var(--r-md); background: var(--surface); color: var(--text); box-shadow: inset 0 0 0 3px var(--panel-red), var(--shadow); }
h2 { margin: 0; font-size: 30px; line-height: 1.05; }
.line { margin: 0; font-size: 16px; line-height: 1.45; }
.line kbd { margin: 0 1px; }
.nav { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
.count { margin-right: auto; font: 600 13px/1 var(--num); color: var(--muted); }
.quiet { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 12px; border-radius: var(--r-md); background: var(--surface); box-shadow: var(--quiet-edge); color: var(--muted); font-size: 14px; font-weight: 600; }
.quiet:hover { background: var(--tile); color: var(--text); }
.go { min-width: 104px; min-height: 44px; padding: 0 20px; border-radius: var(--r-md); font-size: 16px; }
button:focus-visible { outline: 3px solid var(--ring); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  .spot { transition: none; }
}
</style>
