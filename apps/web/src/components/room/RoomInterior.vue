<script setup lang="ts">
// The room's Inside tab: what's in your-room and what's running, without going in. The page asks every few seconds while
// this is open. Something listening on a port can be put at the room's address from here. In numbers first (what
// your-room uses, how many things run), then one line per thing running with its symbol, and the folder's contents
// and the "why only inside" folded away.
import { computed } from "vue";
import type { RoomEntry, RoomInside, RoomInsideTrouble, RoomProcess } from "../../types";
import Icon from "../lobby/house/Icon.vue";
import ListRow from "../lobby/panel/ListRow.vue";
import UiNote, { type Note } from "../UiNote.vue";
import RoomFold from "./RoomFold.vue";
import RoomMark from "./RoomMark.vue";
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
const used = computed(() => (home.value ? sizeWord(home.value.usedKb) : ""));
const usedOf = computed(() => (home.value?.limitMb ? w.inside.usedOf(home.value.limitMb) : w.inside.used));
// Something only listens inside: the fold under the lines says why, and what to do.
const anyLocal = computed(() => props.inside?.running.some((r) => r.localOnly) ?? false);
const atAddress = (r: RoomProcess) => !!props.inside && r.port === props.inside.addressPort && !r.localOnly;
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
    <p v-if="trouble" class="info-note">{{ troubleWord }}</p>
    <p v-else-if="!inside && looked" class="info-note">{{ w.inside.failed }}</p>
    <template v-if="inside">
      <ul class="stats">
        <li v-if="home" class="stat"><strong>{{ used }}</strong><span>{{ usedOf }}</span></li>
        <li class="stat"><strong>{{ inside.running.length }}</strong><span>{{ w.inside.runningStat }}</span></li>
      </ul>

      <section class="part" :aria-label="w.inside.running">
        <p class="label" aria-hidden="true">{{ w.inside.running }}</p>
        <p v-if="dead" class="st-line" role="status"><RoomMark kind="fail" /><span class="st-text"><span class="st-title">{{ w.inside.nothingThere }}</span></span></p>
        <ul v-if="inside.running.length" class="st-lines">
          <li v-for="r in inside.running" :key="`${r.port ?? ''}${r.command}`" class="st-line run">
            <RoomMark :kind="atAddress(r) ? 'ok' : 'none'" />
            <span class="st-text">
              <code class="st-title cmd">{{ r.command ?? `:${r.port}` }}</code>
              <span class="st-sub">{{ processSub(r) }}</span>
            </span>
            <template v-if="r.port">
              <span v-if="atAddress(r)" class="here">{{ w.inside.atAddress }}</span>
              <span v-else-if="r.localOnly" class="st-end" :title="w.inside.localOnlyWhy">{{ w.inside.localOnly }}</span>
              <button v-else type="button" class="chunk small" :disabled="busy || deploying" @click="emit('putOnline', r.port!)">{{ w.inside.putOnline }}</button>
            </template>
          </li>
        </ul>
      </section>

      <RoomFold v-if="anyLocal" :title="w.inside.whyLocal" open>
        <p class="why">{{ w.inside.localOnlyWhy }}</p>
      </RoomFold>

      <!-- What's in your-room: folded, with how many things are there. -->
      <RoomFold v-if="home" :title="folder" :meta="String(home.entries.length + home.more)" class="home">
        <ul v-if="home.entries.length" class="row-list">
          <ListRow v-for="e in home.entries" :key="e.name" :title="e.name" :sub="entrySub(e)">
            <template #lead><Icon :name="entryIcon(e)" :size="20" /></template>
          </ListRow>
        </ul>
        <p v-else class="why">{{ w.inside.empty }}</p>
        <p v-if="home.more" class="why">{{ w.inside.more(home.more) }}</p>
      </RoomFold>

      <p v-if="!anythingStarted" class="info-note"><Icon name="info" :size="16" /><span>{{ w.inside.hint }}</span></p>
      <UiNote :note="note" />
    </template>
  </div>
</template>

<style scoped>
.interior { display: grid; gap: 16px; align-content: start; }
.part { display: grid; gap: 4px; }
.part > .label { padding-bottom: 4px; }
.run { min-height: 48px; }
/* A command is code, as it was typed. */
.cmd { font: 500 14px/20px var(--code); }
.here { flex: none; font: 800 13px/18px var(--font); white-space: nowrap; }
.why { font: 600 14px/20px var(--font); color: var(--muted); }
.home :deep(.fold-title) { font-family: var(--code); font-weight: 500; }
.home .row-list :deep(.lead) { min-width: 22px; color: var(--muted); }
</style>
