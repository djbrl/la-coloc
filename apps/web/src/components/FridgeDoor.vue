<script setup lang="ts">
// The notes the house pins on its own: hogging, skipped reviews, thanks. On the house page it's a section with its
// own heading; `compact` (the lobby's house panel, which already says what the fridge is) draws just the notes,
// one panel row each.
import type { FridgeNote } from "../types";
import ListRow from "./lobby/panel/ListRow.vue";

defineProps<{ notes: FridgeNote[]; compact?: boolean }>();

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
// A note's tone shows as a coloured dot; the words stay readable.
const dot = { info: "", warning: "warn", danger: "danger", thanks: "live" } as const;
const toneWord = { info: "Note", warning: "Heads up", danger: "Needs a look", thanks: "Thanks" } as const;
// A note's row leads with what kind of note it is and the room it's about; the note itself goes under, whole.
const heading = (n: FridgeNote) => (n.room ? `${toneWord[n.tone]} · room ${n.room}` : toneWord[n.tone]);
</script>

<template>
  <template v-if="compact">
    <p v-if="!notes.length" class="muted none">No notes yet. Quiet house.</p>
    <ul v-else class="plain notes">
      <ListRow v-for="n in notes" :key="n.id" :title="heading(n)">
        <span class="said">{{ n.text }}</span>
        <template #lead><span class="tone" :class="dot[n.tone]" aria-hidden="true"><span class="dot" :class="dot[n.tone]" /></span></template>
        <template #meta>
          <span v-if="n.count > 1" :aria-label="`${n.count} times`">×{{ n.count }}</span>
          <time :datetime="n.at">{{ time(n.at) }}</time>
        </template>
      </ListRow>
    </ul>
  </template>
  <div v-else class="fridge">
    <h2>The fridge door.</h2>
    <p class="muted intro">Notes the house leaves on its own: hogging, skipped reviews, thanks.</p>
    <p v-if="!notes.length" class="muted">No notes yet. Quiet house.</p>
    <ul v-else class="rows">
      <li v-for="n in notes" :key="n.id">
        <span class="dot" :class="dot[n.tone]" aria-hidden="true" />
        <span class="text">{{ n.text }}<template v-if="n.count > 1"> <span class="muted">(×{{ n.count }})</span></template></span>
        <time class="end muted small" :datetime="n.at">{{ time(n.at) }}</time>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.fridge { display: grid; gap: 8px; align-content: start; min-width: 0; }
.intro { margin-bottom: 16px; }
.rows > li { flex-wrap: nowrap; align-items: baseline; font-size: 15px; }
.text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.plain { list-style: none; margin: 0; padding: 0; }
.notes { display: grid; gap: 6px; }
.none { padding: 8px 0; }
/* The note's tone, as a dot in a soft disc where a face would be. */
.tone { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; background: var(--fill); }
.tone.warn { background: var(--warn-soft); }
.tone.danger { background: var(--danger-soft); }
.tone.live { background: var(--live-soft); }
.tone .dot { margin: 0; width: 10px; height: 10px; }
/* The note in full, on two lines at most: it's the content, so it isn't cut to one. */
.said { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; font-size: 13px; color: var(--muted); }
</style>
