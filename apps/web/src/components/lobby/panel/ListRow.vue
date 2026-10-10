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
  // The viewer's own row: an accent ring.
  mine?: boolean;
  // A free room, an empty seat: drawn as an outline, no fill.
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
.list-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: 8px 12px;
  border-radius: 14px;
  background: var(--tile);
  transition: box-shadow 0.2s var(--ease), background-color 0.15s var(--ease);
}
.list-row.open { background: var(--surface); box-shadow: inset 0 0 0 1px var(--border); }
/* Rows behave like a game menu's entries: the whole row lights under the pointer, and the one holding the keyboard
   focus is the selected entry. */
.list-row:hover { background: var(--fill); }
.list-row.open:hover { background: var(--tile); }
.list-row:focus-within { background: var(--accent-soft); box-shadow: inset 0 0 0 2px var(--accent-fill); }
.list-row.mine { box-shadow: inset 0 0 0 2px var(--accent-fill); }
.list-row.lit { box-shadow: inset 0 0 0 2px var(--accent-fill), 0 0 0 4px var(--focus); }
.lead { flex: none; width: 40px; display: grid; place-items: center; color: var(--muted); }
.lead:empty { display: none; }
.text { flex: 1 1 auto; min-width: 0; display: grid; gap: 1px; }
.title { font-size: 15px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sub, .text :deep(.sub) { font-size: 13px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.meta { flex: none; display: flex; align-items: center; gap: 10px; color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; }
.end { flex: none; display: flex; align-items: center; gap: 8px; }
/* Buttons in a row are small pills. */
.end :deep(button), .end :deep(a.button) { min-height: 34px; padding: 0 14px; font-size: 14px; }
@media (max-width: 480px) {
  .meta { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .list-row { transition: none; }
}
</style>
