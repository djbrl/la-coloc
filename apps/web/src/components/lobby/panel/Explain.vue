<script setup lang="ts">
// A part of a panel says the simple thing first, and the why only if you ask: one plain sentence about your own
// situation ("You have 1 review to do."), then a small round "?" that unfolds a line or three saying what this part
// is and why it matters. Newcomers get the explanation in place; everyone else isn't made to read it every time.
//
// It's a disclosure button (aria-expanded, aria-controls), so a screen reader hears "What is this?, collapsed" and
// Tab reaches it like any button. It doesn't touch Escape: in the lobby Escape already means "go back a page".
// The explanation folds again when it changes (another tab), so each part starts short.
import { ref, useId, watch } from "vue";
import { explain as words } from "./words";

const props = defineProps<{ summary: string; more?: string | null }>();

const open = ref(false);
watch(
  () => props.more,
  () => (open.value = false),
);

// A unique id per instance (Vue makes it), so aria-controls points at this explanation.
const id = `explain-${useId()}`;
</script>

<template>
  <div class="explain">
    <p class="summary">
      <span>{{ summary }}</span>
      <button v-if="more" type="button" class="ask" :aria-expanded="open" :aria-controls="id" :aria-label="words.whatIsThis" :title="words.whatIsThis" @click="open = !open">
        <span aria-hidden="true">?</span>
      </button>
    </p>
    <p v-if="more" v-show="open" :id="id" class="why">{{ more }}</p>
  </div>
</template>

<style scoped>
.explain { display: grid; gap: 6px; min-width: 0; }
/* The sentence about you: body text, a size under a row's title, so the rows stay the heart of the panel. */
.summary { font-size: 15px; line-height: 1.3; color: var(--text); }
.summary > span { margin-right: 6px; }
/* The "?": a small round key at the end of the sentence, like a game's hint button. */
.ask {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  min-height: 0;
  padding: 0;
  vertical-align: -5px;
  border-radius: 50%;
  background: var(--text);
  color: var(--surface);
  font: 800 13px/1 var(--font);
  transition: background-color var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
}
/* A finger needs more than 22px: the press area reaches 8px past the circle, invisibly. */
.ask { position: relative; }
.ask::after { content: ""; position: absolute; inset: -8px; }
.ask:hover:not(:disabled) { background: var(--muted); color: var(--surface); }
.ask[aria-expanded="true"] { background: var(--accent-fill); color: var(--on-accent); }
/* The explanation: muted, a touch smaller, under the "?". */
.why {
  font-size: 14px;
  line-height: 1.4;
  color: var(--muted);
  animation: unfold var(--dur) var(--ease);
}
@keyframes unfold {
  from { opacity: 0; transform: translateY(-3px); }
}
@media (prefers-reduced-motion: reduce) {
  .ask { transition: none; }
  .why { animation: none; }
}
</style>
