<script setup lang="ts">
// The shape of every panel inside the lobby (a house, a room, a knock): a head that never moves, the tabs, a body
// that takes the rest of the height, and a foot with the one thing to do next. Inside the lobby's sheet the panel
// is exactly the sheet's height, so the sheet itself never scrolls; only a body that holds a stream (a chat, logs,
// a long history) scrolls, inside itself. On a page of its own (the list view) the panel just grows.
//
// Slots: `head`, `tabs`, `default` (the body), `foot`. `explain`: the one muted line under the tabs that says
// what the open tab is for (see words.ts).
defineProps<{ explain?: string | null; bodyLabel?: string; bodyId?: string; bodyLabelledby?: string }>();
</script>

<template>
  <div class="panel-shape">
    <header v-if="$slots.head" class="p-head"><slot name="head" /></header>
    <div v-if="$slots.tabs" class="p-tabs"><slot name="tabs" /></div>
    <p v-if="explain" class="p-explain">{{ explain }}</p>
    <div :id="bodyId" class="p-body" :role="bodyLabelledby ? 'tabpanel' : undefined" :aria-labelledby="bodyLabelledby" :aria-label="bodyLabel">
      <slot />
    </div>
    <footer v-if="$slots.foot" class="p-foot"><slot name="foot" /></footer>
  </div>
</template>

<style scoped>
.panel-shape {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 0;
  padding: 4px var(--gutter) 18px;
}
.p-head, .p-tabs, .p-explain, .p-foot { flex: none; }
.p-explain { margin-top: -4px; font-size: 13px; line-height: 1.35; color: var(--muted); }
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
  /* Room for focus rings and row rings at the edges. */
  margin: 0 -6px;
  padding: 2px 6px;
}
/* The foot sits under a hairline, like a dashboard card's footer, with the one next step in it. */
.p-foot { display: flex; align-items: center; gap: 12px; margin: 0 calc(-1 * var(--gutter)); padding: 12px var(--gutter) 0; border-top: 1px solid var(--line); }
</style>
