<script setup lang="ts">
// The house's news: the notes it pins on its board by itself when something happens in a room (a new version
// online, an app that crashed, a review gone late, a thank-you). The API calls the board "the fridge"; people see
// "news". Quiet lines, grouped by day (Jib, 6 Nov: no stacked cards, no colour-coded rows, no counters on top): one
// symbol each (done, broken, or waiting for you), the note's first sentence as its line and the rest under it, how
// many times it happened at the end of that, and when on the right. The room isn't repeated: the note already names
// the flatmate ("awa's app crashed").
//
// `compact` (the lobby's house panel) draws just the lines. Without it, on a page of its own, it brings its own
// heading and explanation. How a note looks and when it was pinned, in words, are decided in lobby/house/notes.ts
// (tested there).
import { computed } from "vue";
import { locale } from "../i18n";
import type { FridgeNote } from "../types";
import { byDay, noteMark, noteWhen, notesSummary, splitNote } from "./lobby/house/notes";
import { noteText } from "./said";
import { explain } from "./lobby/panel/words";
import { commonWords as w } from "./words";

const props = defineProps<{ notes: FridgeNote[]; compact?: boolean }>();

const days = computed(() => byDay(props.notes));
const parts = (n: FridgeNote) => splitNote(noteText(n));
// The full date and time, for the pointer's tooltip on the short "14:02" or "Yesterday".
const fullWhen = (iso: string) => new Date(iso).toLocaleString(locale(), { dateStyle: "long", timeStyle: "short" });
</script>

<template>
  <div class="news" :class="{ page: !compact }">
    <template v-if="!compact">
      <h2>{{ w.newsTitle }}</h2>
      <p class="muted intro">{{ explain.fridge }}</p>
    </template>
    <p v-if="!notes.length" class="none">{{ notesSummary(notes) }}</p>
    <section v-for="d in days" :key="d.day" class="day" :aria-label="d.day">
      <h3 class="label" aria-hidden="true">{{ d.day }}</h3>
      <ul class="plain">
        <li v-for="n in d.notes" :key="n.id" class="note">
          <span class="status-mark" :class="noteMark(n.tone)">
            <svg v-if="noteMark(n.tone) === 'ok'" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /></svg>
            <svg v-else-if="noteMark(n.tone) === 'fail'" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" /></svg>
            <span class="sr-only">{{ w.tone[n.tone] }}.</span>
          </span>
          <span class="text">
            <span class="head">{{ parts(n).head }}</span>
            <span v-if="parts(n).rest || n.count > 1" class="rest">{{ parts(n).rest }}<template v-if="n.count > 1">{{ parts(n).rest ? " · " : "" }}{{ w.times(n.count) }}</template></span>
          </span>
          <time :datetime="n.at" :title="fullWhen(n.at)">{{ noteWhen(n.at) }}</time>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.news { display: grid; gap: 20px; align-content: start; min-width: 0; padding-top: 6px; }
.news.page { gap: 16px; padding-top: 0; }
.intro { margin-bottom: 4px; }
.none { font-size: 15px; font-weight: 600; color: var(--muted); }
.day { display: grid; min-width: 0; }
.label { padding-bottom: 2px; font-family: var(--font); }
.plain { list-style: none; margin: 0; padding: 0; }
/* A line: the symbol, the words, when. Air between lines, never a box or a colour behind them. */
.note { display: flex; align-items: flex-start; gap: 12px; min-width: 0; padding: 10px 0; }
.note .status-mark { margin-top: 1px; }
.text { flex: 1 1 auto; min-width: 0; display: grid; gap: 2px; }
.head { font-size: 15px; font-weight: 600; line-height: 21px; color: var(--text); overflow-wrap: anywhere; }
.rest { font-size: 13px; font-weight: 600; line-height: 18px; color: var(--muted); overflow-wrap: anywhere; }
time { flex: none; font-size: 13px; font-weight: 600; line-height: 21px; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
</style>
