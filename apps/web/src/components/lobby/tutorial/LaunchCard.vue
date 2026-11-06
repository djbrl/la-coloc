<script setup lang="ts">
// Chapter 5: the launch, as a show, in carte blanche: the icon's tile, the title, and the stage you're at with a clock
// under it; then the four stages as quiet lines (fetching your code → building → starting → live), each with its
// symbol: a tick when done, the current one breathing, a soft dot for what's next, and a tick sound for each new stage. Meanwhile the house wears its crane (the engine draws it while the
// room builds); when it goes live the fireworks go off over the house and your window lights up. A failed build
// says what happened and what to do, with the whole log a press away, and offers to try again, to bring another
// project, or to fall back on the ready-made page. The build's own window opens over this card by itself as the build
// starts: collapse it and "Watch the build" brings it back; cancel the build and you're back to picking a project.
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { play } from "../../../lobby/sound";
import BuildLog from "../../room/BuildLog.vue";
import { buildTrouble } from "../../room/room";
import { roomWords } from "../../room/words";
import { STAGES, stageOf, TUTORIAL_HOUSE } from "./tutorial";
import QuestIcon from "./QuestIcon.vue";
import { tutorialWords as w } from "./words";

const props = defineProps<{
  // The room's status as the API last said it, the first line of a failed build's reason, and all of it.
  status: string | undefined;
  why?: string | null;
  log?: string | null;
  // Which room is building, for the log window.
  room?: string;
  // Live: the show is over (the view moves on a moment later).
  launched: boolean;
  // The press that started it, a refusal from the API, and whether a GitHub repo was the source.
  error: string;
  busy: boolean;
  waiting?: boolean;
  fromGithub: boolean;
}>();
const emit = defineEmits<{ retry: []; starter: []; other: [] }>();

// The build's window: up from the start, until it's collapsed.
const logOpen = ref(true);

// The stage only ever moves forward during one launch: a poll that lands between two steps can't send it back.
const reached = ref(0);
const failed = computed(() => !props.launched && (props.status === "failed" || props.status === "down"));
watch(
  () => [props.status, props.launched] as const,
  ([status, launched]) => {
    const at = launched ? 3 : stageOf(status, true);
    if (at > reached.value) {
      reached.value = at;
      if (at < 3) play("tick");
    }
  },
  { immediate: true },
);
// A retry starts the track over, with the log up again.
watch(failed, (now, before) => {
  if (before && !now) {
    reached.value = 0;
    logOpen.value = true;
  }
});
// Live: the log steps aside for the fireworks.
watch(
  () => props.launched,
  (live) => {
    if (live) logOpen.value = false;
  },
);

// The clock: seconds since the launch began, until it's live or failed.
const started = ref(Date.now());
const now = ref(Date.now());
let clock = 0;
onMounted(() => (clock = window.setInterval(() => (now.value = Date.now()), 500)));
onBeforeUnmount(() => clearInterval(clock));
watch(failed, (f) => {
  if (!f) started.value = Date.now();
});
const seconds = computed(() => Math.max(0, Math.round((now.value - started.value) / 1000)));
const stopped = ref<number | null>(null);
watch(
  () => props.launched || failed.value,
  (over) => (stopped.value = over ? seconds.value : null),
);

// How full the bar is: each stage is a quarter, and the current one is half filled while it runs.
const title = computed(() => (props.launched ? w.liveTitle : failed.value || props.error ? w.failed : w.launching));
// What went wrong, and what to do about it.
const trouble = computed(() => roomWords.trouble[buildTrouble(props.log ?? props.why)]);
const nowSaid = computed(() => w.stageOf(reached.value + 1, STAGES.length, w.stages[STAGES[reached.value]]));
</script>

<template>
  <div class="launch" :class="{ live: launched, failed: failed || !!error }">
    <div class="top">
      <span class="icon-tile"><QuestIcon :name="launched ? 'tick' : 'project'" :size="22" /></span>
      <div class="words">
        <p class="title">{{ title }}</p>
        <p class="where"><span>{{ launched ? w.stages.live : nowSaid }}</span><span class="clock" aria-hidden="true">{{ w.seconds(stopped ?? seconds) }}</span></p>
      </div>
    </div>

    <!-- The stages: one quiet line each, a symbol for where it's at. -->
    <ol v-if="!failed" class="track" :aria-label="w.launching">
      <li
        v-for="(stage, i) in STAGES"
        :key="stage"
        class="stage"
        :class="{ done: i < reached || launched, now: i === reached && !launched && !failed && !error, stuck: i === reached && failed }"
        :aria-current="i === reached ? 'step' : undefined"
      >
        <span class="status-mark" :class="i < reached || launched ? 'ok' : i === reached && !error ? 'todo' : 'none'"><QuestIcon v-if="i < reached || launched" name="tick" :size="12" /></span>
        <span class="word">{{ w.stages[stage] }}</span>
      </li>
    </ol>
    <p class="sr-only" aria-live="polite">{{ launched ? w.liveTitle : failed ? w.failed : nowSaid }}</p>

    <template v-if="error">
      <p class="why" role="alert">{{ error }}</p>
    </template>
    <template v-else-if="failed">
      <p class="help">{{ trouble }}</p>
      <button v-if="room" type="button" class="quiet see" @click="logOpen = true">{{ roomWords.seeLog }}</button>
    </template>
    <button v-else-if="room && !launched" type="button" class="quiet see" @click="logOpen = true">{{ roomWords.watchBuild }}</button>

    <BuildLog v-if="logOpen && room" :house-id="TUTORIAL_HOUSE" :room="room" @close="logOpen = false" @retry="logOpen = false; emit('retry')" @other="logOpen = false; emit('other')" @cancelled="logOpen = false; emit('other')" />

    <div v-if="failed || error" class="nav">
      <template v-if="fromGithub">
        <button type="button" class="quiet" :disabled="busy || waiting" @click="emit('other')">{{ w.otherProject }}</button>
        <button type="button" class="quiet" :disabled="busy || waiting" @click="emit('starter')">{{ w.readyMade }}</button>
      </template>
      <button type="button" class="primary go" :disabled="busy || waiting" @click="emit('retry')">{{ w.tryAgain }}</button>
    </div>
  </div>
</template>

<style scoped>
.launch { display: grid; gap: 14px; }
.top { display: flex; align-items: flex-start; gap: 14px; }
.words { flex: 1 1 auto; min-width: 0; display: grid; gap: 4px; }
.title { margin: 0; padding-top: 1px; font: 800 22px/28px var(--display); }
.where { display: flex; justify-content: space-between; gap: 12px; margin: 0; font-size: 15px; line-height: 21px; color: var(--muted); }
.where > span:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.clock { flex: none; font-weight: 800; color: var(--text); font-variant-numeric: tabular-nums; }
.track { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.stage { display: flex; align-items: center; gap: 12px; min-width: 0; }
.word { font-size: 15px; font-weight: 800; line-height: 20px; color: var(--text); }
.stage:not(.done):not(.now):not(.stuck) .word { color: var(--muted); font-weight: 600; }
/* The stage running now: its symbol breathes. */
.now .status-mark { animation: breathe 1.2s var(--ease) infinite; }
.stuck .status-mark { background: var(--accent-soft); }
.stuck .word { color: var(--danger); }
@keyframes breathe {
  50% { opacity: 0.5; }
}
.help { margin: 0; font-size: 15px; line-height: 21px; }
.see { justify-self: start; }
.why { margin: 0; font-size: 15px; color: var(--danger); }
.nav { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; }
.nav .go { margin-left: auto; }
/* The second button: carte blanche's grey, with its lip. */
.quiet { min-height: 48px; padding: 0 16px var(--lip); border-radius: 12px; background: var(--sunken); box-shadow: var(--quiet-edge); color: var(--text); font-size: 15px; font-weight: 800; }
.quiet:hover:not(:disabled) { background: var(--fill); color: var(--text); }
.go { min-width: 140px; }
@media (max-width: 520px) {
  .title { font-size: 19px; line-height: 24px; }
}
@media (prefers-reduced-motion: reduce) {
  .now .status-mark { animation: none; }
}
</style>
