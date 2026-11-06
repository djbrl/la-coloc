<script setup lang="ts">
// One row of a panel's list: something on the left (a face, an icon), a title and one line under it, whatever
// the row has to show on the right (a state, a number), and at most one action at the end. Rooms, people, knocks,
// chores, secrets and builds are all this row, so every list in the lobby reads the same way.
//
// Slots: `lead` (left, 40px wide), `tag` (small grey words after the title: "chef", "you"), `meta` (right of the
// text), `end` (the action). `title` and `sub` are props so they truncate on one line each; `default` replaces the sub
// line when a row needs more than text there.
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
      <span v-if="$slots.tag" class="title-line"><span class="title">{{ title }}</span><slot name="tag" /></span>
      <span v-else class="title">{{ title }}</span>
      <slot><span v-if="sub" class="sub">{{ sub }}</span></slot>
    </span>
    <span v-if="$slots.meta" class="meta"><slot name="meta" /></span>
    <span v-if="$slots.end" class="end"><slot name="end" /></span>
  </li>
</template>

<style scoped>
/* A row on the white: no box, and no line between rows. Air and the row's own light keep them apart. */
.list-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  padding: 6px 0;
  transition: background-color var(--dur-fast) var(--ease);
}
/* Rows behave like a game menu's entries: the whole row lights under the pointer, and the one holding the keyboard
   focus is the selected entry. Carte blanche keeps colour for the icon's tile and the main button, so the light is
   the soft paper, never pink, and never an outline or a stripe. */
.list-row:hover, .list-row:focus-within { background: var(--tile); box-shadow: -8px 0 0 var(--tile), 8px 0 0 var(--tile); outline: none; }
/* Yours, and a row lit for a moment (picked from the crew above it): the same soft paper, one step darker on hover. */
.list-row.mine, .list-row.lit { background: var(--tile); box-shadow: -8px 0 0 var(--tile), 8px 0 0 var(--tile); }
.list-row.mine:hover, .list-row.lit:hover { background: var(--fill); box-shadow: -8px 0 0 var(--fill), 8px 0 0 var(--fill); }
.lead { flex: none; min-width: 40px; display: grid; place-items: center; color: var(--muted); }
.lead:empty { display: none; }
.text { flex: 1 1 auto; min-width: 0; display: grid; gap: 2px; }
/* The name at 15 and its line at 13, one line each: a long name ends in "…", never on two lines. */
.title { font-size: 15px; font-weight: 800; line-height: 20px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sub, .text :deep(.sub) { font-size: 13px; font-weight: 600; line-height: 18px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* A tag after the name: the soft grey, small capitals, never a colour. */
.title-line { display: flex; align-items: center; gap: 8px; min-width: 0; }
.title-line > :not(.title) { flex: none; height: 20px; padding: 0 7px; border-radius: 10px; background: var(--sunken); color: var(--muted); font-size: 11px; font-weight: 800; line-height: 20px; letter-spacing: 0.05em; text-transform: uppercase; }
/* What's on the right: numbers that line up, muted so the name stays first. */
.meta { flex: none; display: flex; align-items: center; gap: 10px; color: var(--muted); font-size: 14px; font-weight: 800; line-height: 1.2; font-variant-numeric: tabular-nums; }
.end { flex: none; display: flex; align-items: center; gap: 8px; }
/* A row's buttons are the small size of the one family: 40 high, the grey with its lip (3px at this size), the heavy
   cut at 14. A row's main action can still say .primary and take the red. */
/* A rail's parts (.segmented, style.css) keep the rail's look: they aren't the row's keys. */
.end :deep(button:not(.toggle, .segmented > button)), .end :deep(a.button) { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 40px; padding: 0 14px 3px; border-radius: 10px; font-size: 14px; }
.end :deep(button:not(.toggle, .primary, .segmented > button)), .end :deep(a.button:not(.primary)) { background: var(--sunken); color: var(--text); box-shadow: inset 0 -3px 0 var(--quiet-lip); }
.end :deep(button:not(.toggle, .primary, .segmented > button)):hover:not(:disabled), .end :deep(a.button:not(.primary)):hover { background: var(--fill); }
.end :deep(button.primary) { box-shadow: inset 0 -3px 0 var(--accent-lip); }
@media (max-width: 480px) {
  .meta { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .list-row { transition: none; }
}
</style>
