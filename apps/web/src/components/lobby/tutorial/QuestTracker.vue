<script setup lang="ts">
// The quest's tracker, at the top of the screen: eight stamps on a string, like a passport filling up, and the
// chapter you're in, in words. A finished chapter is stamped in the red with its icon; the one you're in has a
// ring that breathes; the ones to come are dashed circles. A new stamp lands with a little thump (the view plays
// the sound). On "Welcome home" the same row shows every stamp, bigger (`full`).
import { computed } from "vue";
import { type Chapter, CHAPTERS } from "./tutorial";
import QuestIcon from "./QuestIcon.vue";
import { tutorialWords as w } from "./words";

const props = defineProps<{ stamps: Chapter[]; current: Chapter | null; full?: boolean }>();

const index = computed(() => (props.current ? CHAPTERS.indexOf(props.current) : -1));
// The newest stamp is the one that lands with the animation.
const newest = computed(() => props.stamps[props.stamps.length - 1] ?? null);
const stateOf = (c: Chapter) => (props.stamps.includes(c) ? "done" : c === props.current ? "now" : "later");
const said = (c: Chapter) => {
  const s = stateOf(c);
  return `${w.chapters[c]}, ${s === "done" ? w.stampDone : s === "now" ? w.stampNow : w.stampLater}`;
};
</script>

<template>
  <div class="tracker" :class="{ full }">
    <ol class="stamps" :aria-label="w.quest">
      <li v-for="c in CHAPTERS" :key="c" class="stamp" :class="[stateOf(c), { newest: c === newest && !full }]" :aria-label="said(c)" :aria-current="c === current && !full ? 'step' : undefined">
        <QuestIcon v-if="stateOf(c) !== 'later'" :name="c" :size="full ? 18 : 14" />
      </li>
    </ol>
    <p v-if="!full && current" class="where" aria-live="polite">
      <span class="n">{{ index + 1 }}/{{ CHAPTERS.length }}</span>
      <span class="name">{{ w.chapters[current] }}</span>
      <span class="sr-only">{{ w.chapterOf(index + 1, CHAPTERS.length, w.chapters[current]) }}</span>
    </p>
  </div>
</template>

<style scoped>
/* A flat key ring on the surface: the stamps on a thin string, then where you are. No glass. */
.tracker { display: flex; align-items: center; gap: 14px; padding: 7px 14px 7px 10px; border-radius: var(--r-pill); background: var(--surface); color: var(--text); box-shadow: var(--lift); }
.tracker.full { padding: 0; background: none; box-shadow: none; justify-content: center; }
.stamps { position: relative; display: flex; align-items: center; gap: 6px; margin: 0; padding: 0; list-style: none; }
/* The string the stamps hang on. */
.stamps::before { content: ""; position: absolute; left: 10px; right: 10px; top: 50%; height: 2px; background: var(--line-strong); border-radius: 1px; }
.stamp { position: relative; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--surface); }
.full .stamp { width: 34px; height: 34px; }
.full .stamps { gap: 8px; }
.full .stamps::before { left: 16px; right: 16px; }
/* To come: a dashed circle. */
.stamp.later { background: var(--surface); }
.stamp.later::after { content: ""; width: 4px; height: 4px; border-radius: 50%; background: var(--line-strong); }
/* Now: the red ring, breathing; the icon in the red. */
.stamp.now { color: var(--accent); background: var(--accent-soft); box-shadow: inset 0 0 0 2px var(--accent-fill), 0 0 0 0 var(--focus); animation: breathe 1.8s var(--ease) infinite; }
@keyframes breathe {
  50% { box-shadow: inset 0 0 0 2px var(--accent-fill), 0 0 0 5px transparent; }
  0%, 100% { box-shadow: inset 0 0 0 2px var(--accent-fill), 0 0 0 0 var(--focus); }
}
/* Done: stamped in the red, dark ink, a slight tilt like a real stamp. */
.stamp.done { background: var(--accent-fill); color: var(--on-accent); box-shadow: 0 2px 0 var(--accent-lip); transform: rotate(-8deg); }
.stamp.done:nth-child(even) { transform: rotate(6deg); }
/* The newest stamp lands: big, then pressed down. */
.stamp.done.newest { animation: land 520ms var(--ease-pop); }
@keyframes land {
  0% { transform: scale(2.2) rotate(-24deg); opacity: 0; }
  55% { transform: scale(0.86) rotate(-6deg); opacity: 1; }
  100% { transform: scale(1) rotate(-8deg); }
}
.where { display: flex; align-items: baseline; gap: 8px; margin: 0; white-space: nowrap; }
.n { font: 600 14px/1 var(--num); color: var(--accent); }
.name { font: 800 16px/1.1 var(--display); }
@media (max-width: 520px) {
  .tracker { gap: 10px; padding: 6px 12px 6px 8px; }
  .stamp { width: 18px; height: 18px; }
  .stamps { gap: 4px; }
  .stamp :deep(svg) { width: 11px; height: 11px; }
  .name { font-size: 14px; }
  .full .stamp { width: 28px; height: 28px; }
  .full .stamp :deep(svg) { width: 15px; height: 15px; }
}
@media (max-width: 400px) {
  .tracker:not(.full) .name { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .stamp.now, .stamp.done.newest { animation: none; }
}
</style>
