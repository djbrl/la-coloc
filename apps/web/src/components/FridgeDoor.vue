<script setup lang="ts">
// The house's news: the notes it pins on its board by itself when something happens in a room (a new version
// online, an app that crashed, a review gone late, a thank-you). The API calls the board "the fridge"; people see
// "news". Each note is one panel row: an icon for its kind, the note's own words as the main line (it's the
// content, so it gets two lines), and when it was pinned on the right. The room isn't repeated under it: the note
// already names the flatmate ("awa's app crashed"), and a row of two lines stays as short as the other rows.
//
// `compact` (the lobby's house panel, whose summary line already says what the board is and when it's empty) draws
// just the rows. Without it, on a page of its own, it brings its own heading and explanation.
// How a note looks and when it was pinned, in words, are decided in lobby/house/notes.ts (tested there).
import { locale } from "../i18n";
import type { FridgeNote } from "../types";
import Icon from "./lobby/house/Icon.vue";
import { noteLook, noteWhen, notesSummary } from "./lobby/house/notes";
import { noteText } from "./said";
import ListRow from "./lobby/panel/ListRow.vue";
import { explain } from "./lobby/panel/words";
import { commonWords as w } from "./words";

defineProps<{ notes: FridgeNote[]; compact?: boolean }>();

// The full date and time, for the pointer's tooltip on the short "14:02" or "Yesterday".
const fullWhen = (iso: string) => new Date(iso).toLocaleString(locale(), { dateStyle: "long", timeStyle: "short" });
</script>

<template>
  <div class="news" :class="{ page: !compact }">
    <template v-if="!compact">
      <h2>{{ w.newsTitle }}</h2>
      <p class="muted intro">{{ explain.fridge }}</p>
      <p v-if="!notes.length" class="muted">{{ notesSummary(notes) }}</p>
    </template>
    <ul v-if="notes.length" class="plain notes">
      <ListRow v-for="n in notes" :key="n.id" :title="noteText(n)">
        <template #lead>
          <span class="kind" :class="noteLook(n.tone).colour">
            <Icon :name="noteLook(n.tone).icon" :size="20" />
            <span class="sr-only">{{ w.tone[n.tone] }}</span>
          </span>
        </template>
        <template #meta>
          <span v-if="n.count > 1" :aria-label="w.times(n.count)">×{{ n.count }}</span>
          <time :datetime="n.at" :title="fullWhen(n.at)">{{ noteWhen(n.at) }}</time>
        </template>
      </ListRow>
    </ul>
  </div>
</template>

<style scoped>
.news { display: grid; gap: 6px; align-content: start; min-width: 0; }
.news.page { gap: 8px; }
.intro { margin-bottom: 8px; }
.plain { list-style: none; margin: 0; padding: 0; }
.notes { display: grid; gap: 4px; line-height: 1.3; }
/* The note is the content: its words get up to two lines instead of the row title's one, a touch lighter. */
.notes :deep(.title) {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  white-space: normal;
  font-size: 14px;
  font-weight: 600;
}
/* The note's kind, as its icon in a soft disc of its colour where a face would be. */
.kind { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; background: var(--fill); color: var(--muted); }
.kind.live { background: var(--live-soft); color: var(--live); }
.kind.warn { background: var(--warn-soft); color: var(--warn); }
.kind.danger { background: var(--danger-soft); color: var(--danger); }
</style>
