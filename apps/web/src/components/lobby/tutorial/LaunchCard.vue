<script setup lang="ts">
// Chapter 5: the launch, as a show. Four stages in plain words on a track (fetching your code → building →
// starting → live), the current one breathing, the bar filling as the caretaker reports each step, a clock in the
// monospace, and a tick for each new stage. Meanwhile the house wears its crane (the engine draws it while the
// room builds); when it goes live the fireworks go off over the house and your window lights up. A failed build
// says why, in the build's own words, and offers to try again or to fall back on the ready-made page.
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { play } from "../../../lobby/sound";
import { STAGES, stageOf } from "./tutorial";
import QuestIcon from "./QuestIcon.vue";
import { tutorialWords as w } from "./words";

const props = defineProps<{
  // The room's status as the API last said it, and the first line of a failed build's reason.
  status: string | undefined;
  why?: string | null;
  // Live: the show is over (the view moves on a moment later).
  launched: boolean;
  // The press that started it, a refusal from the API, and whether a GitHub repo was the source.
  error: string;
  busy: boolean;
  waiting?: boolean;
  fromGithub: boolean;
}>();
const emit = defineEmits<{ retry: []; starter: [] }>();

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
// A retry starts the track over.
watch(failed, (now, before) => {
  if (before && !now) reached.value = 0;
});

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
const fill = computed(() => (props.launched ? 100 : Math.min(100, (reached.value / 3) * 100 + (failed.value ? 0 : 100 / 6))));
const title = computed(() => (props.launched ? w.liveTitle : failed.value || props.error ? w.failed : w.launching));
const nowSaid = computed(() => w.stageOf(reached.value + 1, STAGES.length, w.stages[STAGES[reached.value]]));
</script>

<template>
  <div class="launch" :class="{ live: launched, failed: failed || !!error }">
    <div class="top">
      <p class="title">{{ title }}</p>
      <span class="clock" aria-hidden="true">{{ w.seconds(stopped ?? seconds) }}</span>
    </div>

    <!-- The track: four stages, each a dot and a word, with the bar filling under them. -->
    <ol class="track" :aria-label="w.launching">
      <li
        v-for="(stage, i) in STAGES"
        :key="stage"
        class="stage"
        :class="{ done: i < reached || launched, now: i === reached && !launched && !failed && !error, stuck: i === reached && failed }"
        :aria-current="i === reached ? 'step' : undefined"
      >
        <span class="dot"><QuestIcon v-if="i < reached || launched" name="tick" :size="12" /></span>
        <span class="word">{{ w.stages[stage] }}</span>
      </li>
    </ol>
    <div class="bar" aria-hidden="true"><span :style="{ width: `${fill}%` }" /></div>
    <p class="sr-only" aria-live="polite">{{ launched ? w.liveTitle : failed ? w.failed : nowSaid }}</p>

    <template v-if="error">
      <p class="why" role="alert">{{ error }}</p>
    </template>
    <template v-else-if="failed">
      <p class="sub">{{ w.failedWhy }}</p>
      <pre class="log">{{ why || "—" }}</pre>
    </template>

    <div v-if="failed || error" class="nav">
      <button v-if="fromGithub" type="button" class="quiet" :disabled="busy || waiting" @click="emit('starter')">{{ w.useStarter }}</button>
      <button type="button" class="primary go" :disabled="busy || waiting" @click="emit('retry')">{{ w.tryAgain }}</button>
    </div>
  </div>
</template>

<style scoped>
.launch { display: grid; gap: 10px; }
.top { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.title { margin: 0; font: 800 22px/1.15 var(--display); }
.live .title { color: var(--live); }
.clock { font: 600 14px/1 var(--num); color: var(--muted); font-variant-numeric: tabular-nums; }
.track { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin: 4px 0 0; padding: 0; list-style: none; }
.stage { display: grid; justify-items: center; gap: 6px; text-align: center; min-width: 0; }
.dot { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--surface); box-shadow: inset 0 0 0 2px var(--line-strong); color: var(--on-accent); }
.word { font-size: 14px; line-height: 1.2; color: var(--muted); }
.done .dot { background: var(--accent-fill); box-shadow: 0 2px 0 var(--accent-lip); }
.done .word { color: var(--text); }
.live .done .dot { background: var(--live); box-shadow: none; color: var(--surface); }
/* The stage running now: the ring breathes in the red. */
.now .dot { box-shadow: inset 0 0 0 2px var(--accent-fill); animation: breathe 1.2s var(--ease) infinite; }
.now .word { color: var(--text); font-weight: 600; }
.stuck .dot { box-shadow: inset 0 0 0 2px var(--danger); background: var(--danger-soft); }
.stuck .word { color: var(--danger); font-weight: 600; }
@keyframes breathe {
  50% { box-shadow: inset 0 0 0 2px var(--accent-fill), 0 0 0 6px var(--focus); }
}
/* The bar: a sunken track, filled in the red, striped while it runs, green once live. */
.bar { height: 8px; border-radius: 4px; background: var(--fill); overflow: hidden; }
.bar span { display: block; height: 100%; border-radius: 4px; background: repeating-linear-gradient(-45deg, var(--accent-fill) 0 8px, var(--accent-fill-hover) 8px 16px); background-size: 22px 22px; transition: width 600ms var(--ease); animation: run 0.8s linear infinite; }
.live .bar span { background: var(--live); animation: none; }
.failed .bar span { background: var(--danger); animation: none; }
@keyframes run {
  to { background-position: 22px 0; }
}
.sub { margin: 0; font-size: 14px; color: var(--muted); }
.why { margin: 0; font-size: 15px; color: var(--danger); }
.log { margin: 0; padding: 8px 10px; border-radius: var(--r-sm); background: var(--code-bg); color: var(--code-text); font: 600 14px/1.4 var(--num); white-space: pre-wrap; overflow-wrap: anywhere; max-height: 4.4em; overflow: hidden; }
.nav { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.quiet { min-height: 46px; padding: 0 14px; border-radius: var(--r-md); background: var(--surface); box-shadow: var(--quiet-edge); color: var(--muted); font-size: 14px; font-weight: 600; margin-right: auto; }
.quiet:hover:not(:disabled) { background: var(--tile); color: var(--text); }
.go { min-height: 50px; padding: 0 20px; border-radius: var(--r-md); font-size: 17px; }
@media (max-width: 520px) {
  .word { font-size: 14px; }
  .title { font-size: 19px; }
}
@media (prefers-reduced-motion: reduce) {
  .now .dot, .bar span { animation: none; }
  .bar span { transition: none; }
}
</style>
