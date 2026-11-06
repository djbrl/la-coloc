<script setup lang="ts">
// A folded part of the room: a row you open, for what most people don't need to read first (the log's last lines, the
// history, why something only listens inside). A real disclosure button (aria-expanded, aria-controls), so a screen
// reader hears "History, collapsed" and Tab reaches it like any key. `meta`: a number or a word at the row's end.
import { ref, useId } from "vue";

const props = defineProps<{ title: string; meta?: string | null; open?: boolean }>();
const shown = ref(!!props.open);
const id = `fold-${useId()}`;
</script>

<template>
  <div class="fold" :class="{ open: shown }">
    <button type="button" class="fold-key" :aria-expanded="shown" :aria-controls="id" @click="shown = !shown">
      <span class="fold-title">{{ title }}</span>
      <span v-if="meta" class="fold-meta">{{ meta }}</span>
      <svg class="chev" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>
    <div v-show="shown" :id="id" class="fold-body"><slot /></div>
  </div>
</template>

<style scoped>
/* A soft tile with the inner corner; its key is the tile's whole top row, with no lip: it opens, it doesn't act. */
.fold { flex: none; border-radius: var(--tile-r); background: var(--tile); }
.fold-key { width: 100%; min-height: 48px; display: flex; align-items: center; gap: 10px; padding: 0 14px; border-radius: var(--tile-r); background: transparent; box-shadow: none; color: var(--text); text-align: left; font: 800 15px/1.2 var(--font); }
.fold-key:hover:not(:disabled) { background: transparent; }
.fold-key:focus-visible { outline-offset: -3px; }
.fold-title { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fold-meta { flex: none; max-width: 50%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 600 13px/1.2 var(--font); color: var(--muted); font-variant-numeric: tabular-nums; }
.chev { flex: none; color: var(--muted); transition: transform var(--dur) var(--ease); }
.open .chev { transform: rotate(180deg); }
.fold-body { display: grid; gap: 12px; padding: 0 14px 14px; }
@media (prefers-reduced-motion: reduce) {
  .chev { transition: none; }
}
</style>
