<script setup lang="ts">
// The shape of every panel inside the lobby (a house, a room, a knock): a head that never moves, the tabs, a body
// that takes the rest of the height, and a foot with the one thing to do next. Inside the lobby's sheet the panel
// is exactly the sheet's height, so the sheet itself never scrolls; only a body that holds a stream (a chat, logs,
// a long history) scrolls, inside itself. On a page of its own (the list view) the panel just grows.
//
// Slots: `head`, `tabs`, `default` (the body), `foot`.
// `summary` and `explain`, progressive reveal: with a `summary`, the body opens on that one plain sentence about the
// viewer's situation, and `explain` (what this part is, why it matters) waits behind a round "?" (Explain.vue).
// It sits inside the body, so a screen reader hears it as part of the tab. With `explain` alone, the panel shows it
// as one muted line under the tabs, as panels did before the "?" existed.
import Explain from "./Explain.vue";

defineProps<{ summary?: string | null; explain?: string | null; bodyLabel?: string; bodyId?: string; bodyLabelledby?: string }>();
</script>

<template>
  <div class="panel-shape">
    <header v-if="$slots.head" class="p-head"><slot name="head" /></header>
    <div v-if="$slots.tabs" class="p-tabs"><slot name="tabs" /></div>
    <p v-if="explain && !summary" class="p-explain">{{ explain }}</p>
    <div :id="bodyId" class="p-body" :role="bodyLabelledby ? 'tabpanel' : bodyLabel ? 'region' : undefined" :aria-labelledby="bodyLabelledby" :aria-label="bodyLabel">
      <Explain v-if="summary" class="p-summary" :summary="summary" :more="explain" />
      <slot />
    </div>
    <footer v-if="$slots.foot" class="p-foot"><slot name="foot" /></footer>
  </div>
</template>

<style scoped>
/* The band is the head, edge to edge in the sign's frame; the rest sits on the white body under it. */
.panel-shape {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
}
.p-head, .p-tabs, .p-explain, .p-foot { flex: none; }
.p-tabs, .p-explain { margin: 0 14px; }
.p-explain { font-size: 14px; line-height: 1.35; color: var(--muted); }
/* The summary keeps its full height even when a list below it is too long (then the body scrolls). */
.p-summary { flex: none; }
/* The body takes what's left. It scrolls only if what's in it can't fit (a stream, a long list). */
.p-body {
  /* Positioned, so hidden screen-reader text inside a scrolling list is clipped here instead of stretching the sheet. */
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  overscroll-behavior: contain;
  /* Room for focus rings at the edges. */
  padding: 2px 14px;
}
/* With no tabs and no head above it (a step of a flow), the body still keeps off the band. */
.p-body:last-child { padding-bottom: 14px; }
/* The one next step, on the same white, with no line above it. */
.p-foot { display: flex; align-items: center; gap: 8px; padding: 0 14px 14px; }
.p-foot :deep(button), .p-foot :deep(a.button) { min-height: 60px; font-size: 24px; }
.p-foot :deep(.second), .p-foot :deep(.small) { min-height: 50px; font-size: 18px; }
@media (max-width: 480px) {
  .p-foot :deep(button), .p-foot :deep(a.button) { min-height: 54px; font-size: 19px; }
}
</style>
