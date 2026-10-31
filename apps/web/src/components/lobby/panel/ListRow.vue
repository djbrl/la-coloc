<script setup lang="ts">
// One row of a panel's list: something on the left (a face, an icon), a title and one line under it, whatever
// the row has to show on the right (a state, a number), and at most one action at the end. Rooms, people, knocks,
// chores, secrets and builds are all this row, so every list in the lobby reads the same way.
//
// Slots: `lead` (left, 40px wide), `meta` (right of the text), `end` (the action). `title` and `sub` are props
// so they truncate on one line each; `default` replaces the sub line when a row needs more than text there.
defineProps<{
  title: string;
  sub?: string | null;
  // The viewer's own row: a soft fill.
  mine?: boolean;
  // A free room, an empty seat.
  open?: boolean;
  // Lit for a moment (picked from the crew above it, say).
  lit?: boolean;
}>();
</script>

<template>
  <li class="list-row" :class="{ mine, open, lit }">
    <span class="lead"><slot name="lead" /></span>
    <span class="text">
      <span class="title">{{ title }}</span>
      <slot><span v-if="sub" class="sub">{{ sub }}</span></slot>
    </span>
    <span v-if="$slots.meta" class="meta"><slot name="meta" /></span>
    <span v-if="$slots.end" class="end"><slot name="end" /></span>
  </li>
</template>

<style scoped>
/* A row on the white, with a line between it and the next: no box. */
.list-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: 6px 0;
  transition: background-color var(--dur-fast) var(--ease);
}
.list-row + .list-row { border-top: 2px solid var(--row-line); }
/* Rows behave like a game menu's entries: the whole row lights under the pointer, and the one holding the keyboard
   focus is the selected entry (a fill, never an outline or a stripe). */
.list-row:hover { background: var(--tile); box-shadow: -6px 0 0 var(--tile), 6px 0 0 var(--tile); }
.list-row:focus-within { background: var(--accent-soft); box-shadow: -6px 0 0 var(--accent-soft), 6px 0 0 var(--accent-soft); outline: none; }
/* Yours, and a row lit for a moment (picked from the crew above it): the same soft fill. */
.list-row.mine, .list-row.lit { background: var(--accent-soft); box-shadow: -6px 0 0 var(--accent-soft), 6px 0 0 var(--accent-soft); }
.lead { flex: none; min-width: 40px; display: grid; place-items: center; color: var(--panel, var(--muted)); }
.lead:empty { display: none; }
.text { flex: 1 1 auto; min-width: 0; display: grid; gap: 1px; }
.title { font-size: 18px; font-weight: 800; line-height: 1.15; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sub, .text :deep(.sub) { font-size: 14px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* What's on the right: words and numbers that line up. */
.meta { flex: none; display: flex; align-items: center; gap: 10px; color: var(--text); font-size: 14px; font-weight: 800; line-height: 1.2; font-variant-numeric: tabular-nums; }
.end { flex: none; display: flex; align-items: center; gap: 8px; }
/* A row's buttons are one size: 46. A ghost unless a component says it's the row's main action. */
.end :deep(button:not(.toggle)), .end :deep(a.button) { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 46px; padding: 0 14px; border-radius: var(--r-sm); font-size: 18px; }
@media (max-width: 480px) {
  .meta { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .list-row { transition: none; }
}
</style>
