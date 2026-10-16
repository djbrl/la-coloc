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
  // The viewer's own row: a light orange wash.
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
/* A dashboard's row: the surface with a 1px edge, dense. */
.list-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: 8px 12px;
  border-radius: var(--r-md);
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--line);
  transition: box-shadow var(--dur) var(--ease), background-color var(--dur-fast) var(--ease);
}
/* A free room, an empty seat: a dashed outline, nothing inside. */
.list-row.open { background: none; box-shadow: none; outline: 1px dashed var(--line-strong); outline-offset: -1px; }
/* Rows behave like a game menu's entries: the whole row lights under the pointer, and the one holding the keyboard
   focus is the selected entry, filled with the soft orange (a fill, never an outline or a stripe). */
.list-row:hover { background: var(--tile); }
.list-row:focus-within { background: var(--accent-soft); outline: none; }
/* Yours: a lighter wash of the same orange, like a pinned entry. */
.list-row.mine { background: color-mix(in srgb, var(--accent-soft) 55%, var(--surface)); }
.list-row.mine:focus-within { background: var(--accent-soft); }
/* Lit for a moment (picked from the crew above it): the selected fill, a shade stronger. */
.list-row.lit { background: color-mix(in srgb, var(--accent-fill) 22%, var(--surface)); }
.lead { flex: none; width: 40px; display: grid; place-items: center; color: var(--muted); }
.lead:empty { display: none; }
.text { flex: 1 1 auto; min-width: 0; display: grid; gap: 1px; }
.title { font-size: 15px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sub, .text :deep(.sub) { font-size: 13px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Numbers and times on the right, in the monospace, as a dashboard lines them up. */
.meta { flex: none; display: flex; align-items: center; gap: 10px; color: var(--muted); font: 500 12px/1.2 var(--mono); letter-spacing: 0; font-variant-numeric: tabular-nums; }
.end { flex: none; display: flex; align-items: center; gap: 8px; }
/* Buttons in a row are small pills. */
.end :deep(button), .end :deep(a.button) { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 0 12px; border-radius: var(--r-sm); font-size: 14px; font-weight: 600; }
/* A row's main button keeps a shorter lip, to its size. */
.end :deep(:is(button, a.button).primary) { --lip: 2px; }
@media (max-width: 480px) {
  .meta { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .list-row { transition: none; }
}
</style>
