<script setup lang="ts">
// The quest's tracker, at the top of the screen: a slim pill with the chapter you're in, how far along it is, and a
// thin bar of eight segments under them. Quiet on purpose: the game is the street, not this (Jib, 1 Nov).
import { computed } from "vue";
import { type Chapter, CHAPTERS } from "./tutorial";
import { tutorialWords as w } from "./words";

const props = defineProps<{ stamps: Chapter[]; current: Chapter | null }>();

const index = computed(() => (props.current ? CHAPTERS.indexOf(props.current) : -1));
const stateOf = (c: Chapter) => (props.stamps.includes(c) ? "done" : c === props.current ? "now" : "later");
</script>

<template>
  <div v-if="current" class="tracker">
    <p class="where" aria-live="polite">
      <span class="name" aria-hidden="true">{{ w.chapters[current] }}</span>
      <span class="n" aria-hidden="true">{{ index + 1 }}/{{ CHAPTERS.length }}</span>
      <span class="sr-only">{{ w.chapterOf(index + 1, CHAPTERS.length, w.chapters[current]) }}</span>
    </p>
    <span class="bar" aria-hidden="true">
      <i v-for="c in CHAPTERS" :key="c" :class="stateOf(c)" />
    </span>
  </div>
</template>

<style scoped>
.tracker { display: grid; gap: 4px; width: 168px; padding: 6px 12px 7px; border-radius: var(--r-pill); background: var(--surface); color: var(--text); box-shadow: var(--lift); }
.where { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin: 0; white-space: nowrap; }
.name { overflow: hidden; text-overflow: ellipsis; font-size: 13px; font-weight: 600; line-height: 1.1; }
.n { font: 600 12px/1 var(--num); color: var(--muted); }
.bar { display: grid; grid-template-columns: repeat(8, 1fr); gap: 2px; }
.bar i { height: 3px; border-radius: 2px; background: var(--line-strong); transition: background var(--dur-slow) var(--ease); }
.bar i.done { background: var(--accent-fill); }
/* The chapter you're in: lit, but not done yet. */
.bar i.now { background: var(--accent-fill); opacity: 0.45; }
@media (prefers-reduced-motion: reduce) {
  .bar i { transition: none; }
}
</style>
