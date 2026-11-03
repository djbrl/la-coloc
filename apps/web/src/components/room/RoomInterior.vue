<script setup lang="ts">
// The room's Inside tab: what's in your-room and what's running, without going in. The page asks every few seconds while
// this is open. Something listening on a port can be put at the room's address from here.
import { computed } from "vue";
import type { RoomEntry, RoomInside, RoomInsideTrouble, RoomProcess } from "../../types";
import Icon from "../lobby/house/Icon.vue";
import ListRow from "../lobby/panel/ListRow.vue";
import UiNote, { type Note } from "../UiNote.vue";
import { addressDead, sizeWord } from "./room";
import { roomWords as w } from "./words";

const props = defineProps<{
  inside: RoomInside | null;
  trouble: RoomInsideTrouble | null;
  // Asked at least once: until then there's nothing to say.
  looked: boolean;
  // A build is under way: it's about to replace all of this.
  deploying: boolean;
  busy: boolean;
  note: Note | null;
}>();
const emit = defineEmits<{ putOnline: [port: number] }>();

const STACKS: Record<string, string> = { node: "Node", python: "Python", go: "Go", rust: "Rust", ruby: "Ruby", php: "PHP", java: "Java", docker: "Docker", git: "Git" };

const home = computed(() => props.inside?.home ?? null);
const folder = computed(() => home.value?.path.split("/").pop() ?? "");
const used = computed(() => {
  const h = home.value;
  if (!h) return "";
  const size = sizeWord(h.usedKb);
  return h.limitMb ? `${size} / ${h.limitMb} ${w.mb}` : size;
});
const dead = computed(() => addressDead(props.inside));
const anythingStarted = computed(() => props.inside?.running.some((r) => r.started));
const troubleWord = computed(() => (props.trouble === "not_running" ? w.inside.notRunning : props.trouble === "no_shell" ? w.inside.noShell : w.inside.failed));

function entrySub(e: RoomEntry) {
  if (e.project) return w.inside.project;
  const stack = e.stack === "website" ? w.inside.website : e.stack ? STACKS[e.stack] : "";
  return [stack, e.kb === undefined ? "" : sizeWord(e.kb)].filter(Boolean).join(" · ") || undefined;
}
const entryIcon = (e: RoomEntry) => (e.project ? "rocket" : e.kind === "file" ? "file" : "folder");
const processSub = (r: RoomProcess) => [r.port ? `:${r.port}` : "", r.started ? w.inside.startedOverSsh : w.inside.projectProcess].filter(Boolean).join(" · ");
</script>

<template>
  <div class="interior">
    <p v-if="trouble" class="soft small">{{ troubleWord }}</p>
    <p v-else-if="!inside && looked" class="soft small">{{ w.inside.failed }}</p>
    <template v-if="inside">
      <section v-if="home" class="part">
        <div class="head">
          <h3><code>{{ folder }}</code></h3>
          <span class="used"><strong>{{ used }}</strong> {{ w.inside.used }}</span>
        </div>
        <ul v-if="home.entries.length" class="rows">
          <ListRow v-for="e in home.entries" :key="e.name" :title="e.name" :sub="entrySub(e)">
            <template #lead><Icon :name="entryIcon(e)" :size="22" /></template>
          </ListRow>
        </ul>
        <p v-else class="soft small">{{ w.inside.empty }}</p>
        <p v-if="home.more" class="soft small">{{ w.inside.more(home.more) }}</p>
      </section>

      <section class="part">
        <h3>{{ w.inside.running }}</h3>
        <p v-if="dead" class="dead" role="status"><Icon name="warn" :size="20" />{{ w.inside.nothingThere }}</p>
        <ul v-if="inside.running.length" class="rows">
          <ListRow v-for="r in inside.running" :key="`${r.port ?? ''}${r.command}`" :title="r.command ?? `:${r.port}`" :sub="processSub(r)">
            <template #lead><Icon :name="r.started ? 'prompt' : 'rocket'" :size="22" /></template>
            <template v-if="r.port" #end>
              <span v-if="r.port === inside.addressPort && !r.localOnly" class="here"><Icon name="tick" :size="18" />{{ w.inside.atAddress }}</span>
              <span v-else-if="r.localOnly" class="soft small" :title="w.inside.localOnlyWhy">{{ w.inside.localOnly }}<span class="sr-only"> {{ w.inside.localOnlyWhy }}</span></span>
              <button v-else type="button" class="chunk small" :disabled="busy || deploying" @click="emit('putOnline', r.port!)">{{ w.inside.putOnline }}</button>
            </template>
          </ListRow>
        </ul>
        <p v-if="!anythingStarted" class="soft small">{{ w.inside.hint }}</p>
      </section>
      <UiNote :note="note" />
    </template>
  </div>
</template>

<style scoped>
.interior { display: grid; gap: 16px; align-content: start; }
.part { display: grid; gap: 8px; }
.head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
h3 { margin: 0; font-size: 16px; }
h3 code { font: inherit; }
.used { font-size: 14px; color: var(--muted); white-space: nowrap; }
.used strong { color: var(--text); font-weight: 800; }
.rows { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.here { display: inline-flex; align-items: center; gap: 4px; font-size: 14px; font-weight: 700; color: var(--accent); white-space: nowrap; }
.dead { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: var(--r-md); background: var(--danger-soft); font-size: 15px; }
.dead :deep(svg) { flex: none; color: var(--danger); }
</style>
