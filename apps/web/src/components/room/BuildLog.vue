<script setup lang="ts">
// The build's own window: where the build is, and everything it prints as it prints it. It asks the API about once a
// second while it's open. The log follows the newest line unless you scroll up to read. A failure says what to do and
// offers a way on, and it's always one press to copy the whole log. While it builds it can be collapsed (closing the
// window changes nothing: the build goes on) or cancelled, with one press to confirm.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { postJSON } from "../../session";
import { STAGES, stageOf } from "../lobby/tutorial/tutorial";
import { tutorialWords } from "../lobby/tutorial/words";
import Icon from "../lobby/house/Icon.vue";
import { readable } from "./buildLog";
import { buildTrouble, refWord } from "./room";
import { roomWords as w } from "./words";

const props = defineProps<{
  houseId: string;
  room: string;
  // Where the room answers once it's online.
  url?: string | null;
  // What the failed build's second key says, when it doesn't lead to another project.
  otherWord?: string;
}>();
const emit = defineEmits<{ close: []; retry: []; other: []; cancelled: [] }>();

interface Build {
  id: string;
  status: string;
  ref: string;
  repo: string;
  detail: string | null;
  createdAt: string;
  updatedAt: string;
}

const POLL_MS = 1000;
const dialog = ref<HTMLDialogElement | null>(null);
const body = ref<HTMLElement | null>(null);
const build = ref<Build | null>(null);
const asked = ref(false);
const lines = ref<string[]>([]);
const following = ref(true);
const copied = ref(false);
const now = ref(Date.now());
let next = 0;
let timer = 0;

async function ask() {
  const res = await fetch(`/api/houses/${encodeURIComponent(props.houseId)}/rooms/${encodeURIComponent(props.room)}/build-log?from=${next}`).catch(() => null);
  // A hiccup: the next beat asks again.
  if (!res?.ok) return;
  const data = await res.json();
  asked.value = true;
  // A new build started (Try again): its log starts from nothing.
  if (data.build?.id !== build.value?.id && next > 0) {
    lines.value = [];
    next = 0;
    build.value = data.build;
    return ask();
  }
  build.value = data.build;
  if (data.lines.length) lines.value.push(...data.lines);
  next = data.next;
}

const status = computed(() => build.value?.status);
const over = computed(() => status.value === "live" || status.value === "failed");
const stopped = computed(() => status.value === "failed");
// Stopped on purpose (from here or by someone else who manages the room): not a failure, and nothing to read about.
const cancelled = computed(() => stopped.value && buildTrouble(build.value?.detail) === "cancelled");
const failed = computed(() => stopped.value && !cancelled.value);
const title = computed(() => (!build.value && asked.value ? w.logTitle.none : cancelled.value ? w.logTitle.cancelled : failed.value ? w.logTitle.failed : status.value === "live" ? w.logTitle.live : w.logTitle.building));
const shown = computed(() => readable(lines.value));
const trouble = computed(() => w.trouble[buildTrouble(build.value?.detail)]);
const reached = computed(() => (status.value === "live" ? 3 : Math.max(0, stageOf(status.value, true))));
const seconds = computed(() => {
  if (!build.value) return 0;
  const end = over.value ? new Date(build.value.updatedAt).getTime() : now.value;
  return Math.max(0, Math.round((end - new Date(build.value.createdAt).getTime()) / 1000));
});

// Follows the newest line, unless you've scrolled up to read.
watch(
  () => lines.value.length,
  async () => {
    if (!following.value) return;
    await nextTick();
    if (body.value) body.value.scrollTop = body.value.scrollHeight;
  },
);
function onScroll() {
  const b = body.value;
  if (b) following.value = b.scrollHeight - b.scrollTop - b.clientHeight < 40;
}
function latest() {
  following.value = true;
  if (body.value) body.value.scrollTop = body.value.scrollHeight;
}

async function copy() {
  await navigator.clipboard.writeText(lines.value.join("\n")).catch(() => undefined);
  copied.value = true;
  setTimeout(() => (copied.value = false), 2000);
}

// Cancel, then one press to confirm. A refusal (the server went offline, it just finished) stays in the window.
const asking = ref(false);
const cancelling = ref(false);
const refused = ref("");
async function cancel() {
  cancelling.value = true;
  refused.value = "";
  const res = await postJSON(`/api/houses/${encodeURIComponent(props.houseId)}/rooms/${encodeURIComponent(props.room)}/cancel-build`, {});
  cancelling.value = false;
  asking.value = false;
  if (!res.ok) {
    refused.value = res.message;
    return;
  }
  emit("cancelled");
  dialog.value?.close();
}

onMounted(() => {
  dialog.value?.showModal();
  void ask();
  timer = window.setInterval(() => {
    now.value = Date.now();
    if (document.visibilityState !== "hidden") void ask();
  }, POLL_MS);
});
onBeforeUnmount(() => clearInterval(timer));
</script>

<template>
  <dialog ref="dialog" class="window" :aria-label="w.logLabel" @close="emit('close')" @click="(e) => e.target === dialog && dialog?.close()">
    <div class="frame" :class="{ failed, live: status === 'live' }">
      <header class="head">
        <h2>{{ title }}</h2>
        <span class="meta"><span v-if="build && !build.repo?.startsWith('docker://')">{{ refWord(build.ref) }}</span><span v-if="build">{{ tutorialWords.seconds(seconds) }}</span></span>
        <button v-if="build && !over" type="button" class="x" :aria-label="w.logCollapse" :title="w.logCollapse" @click="dialog?.close()">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
        <button v-else type="button" class="x" :aria-label="w.logClose" :title="w.logClose" @click="dialog?.close()"><span aria-hidden="true">X</span></button>
      </header>

      <ol v-if="build" class="track">
        <li v-for="(stage, i) in STAGES" :key="stage" :class="{ done: i < reached || status === 'live', now: i === reached && !over, stuck: i === reached && failed }">
          <span class="dot" aria-hidden="true" />{{ tutorialWords.stages[stage] }}
        </li>
      </ol>

      <div class="term">
        <div ref="body" class="lines" role="log" tabindex="0" @scroll.passive="onScroll">
          <p v-if="!shown.length" class="wait">{{ w.logWaiting }}</p>
          <p v-for="(l, i) in shown" :key="i" :class="l.kind">{{ l.text }}</p>
        </div>
        <button v-if="!following" type="button" class="back" @click="latest"><Icon name="next" :size="16" />{{ w.logLatest }}</button>
      </div>

      <p v-if="stopped" class="trouble" role="status">{{ trouble }}</p>
      <p v-if="refused" class="trouble refused" role="alert">{{ refused }}</p>

      <footer class="foot">
        <button type="button" class="second" :disabled="!lines.length" @click="copy"><Icon :name="copied ? 'tick' : 'copy'" :size="18" />{{ copied ? w.logCopied : w.logCopy }}</button>
        <template v-if="stopped">
          <button type="button" class="second" @click="emit('other')">{{ otherWord ?? w.otherProject }}</button>
          <button type="button" class="primary" @click="emit('retry')">{{ w.buildAgain }}</button>
        </template>
        <a v-else-if="status === 'live' && url" class="button primary" :href="url" target="_blank" rel="noopener">{{ w.logOpen }}</a>
        <template v-else-if="build && !over">
          <template v-if="asking">
            <button type="button" class="second" @click="asking = false">{{ w.logKeepGoing }}</button>
            <button type="button" class="stop" :disabled="cancelling" @click="cancel">{{ w.logCancelYes }}</button>
          </template>
          <button v-else type="button" class="second" @click="asking = true">{{ w.logCancel }}</button>
        </template>
      </footer>
    </div>
  </dialog>
</template>

<style scoped>
/* Its own window over everything: a flat card, as wide as a terminal wants, the log taking all the room left. */
.window { width: min(860px, calc(100vw - 32px)); height: min(640px, calc(100dvh - 32px)); max-height: none; padding: 0; border: none; border-radius: var(--r-md); background: var(--surface); overflow: hidden; }
.window[open] { animation: pop var(--dur-slow) var(--ease-pop); }
.window::backdrop { background: var(--scrim); }
@keyframes pop {
  from { opacity: 0; transform: translateY(10px) scale(0.96); }
}
/* Head, track, the log taking what's left, then whatever is under it. */
.frame { display: flex; flex-direction: column; gap: 12px; height: 100%; padding: 16px; }
.head { display: flex; align-items: center; gap: 12px; min-width: 0; }
h2 { margin: 0; font: 400 26px/1.1 var(--display); }
.live h2 { color: var(--live); }
.failed h2 { color: var(--danger); }
.meta { display: flex; gap: 12px; min-width: 0; margin-left: auto; color: var(--muted); font: 600 14px/1 var(--num); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; }
.x { flex: none; display: grid; place-items: center; width: 44px; height: 44px; min-height: 0; padding: 0; border-radius: var(--r-md); background: var(--tile); box-shadow: none; color: var(--text); font: 500 20px/1 var(--font); }

.track { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin: 0; padding: 0; list-style: none; }
.track li { display: flex; align-items: center; gap: 7px; min-width: 0; color: var(--muted); font-size: 14px; line-height: 1.2; }
.dot { flex: none; width: 12px; height: 12px; border-radius: 50%; box-shadow: inset 0 0 0 2px var(--line-strong); }
.done { color: var(--text) !important; }
.done .dot { background: var(--accent-fill); box-shadow: none; }
.live .done .dot { background: var(--live); }
.now { color: var(--text) !important; font-weight: 600; }
.now .dot { box-shadow: inset 0 0 0 2px var(--accent-fill); animation: breathe 1.2s var(--ease) infinite; }
.stuck { color: var(--danger) !important; font-weight: 600; }
.stuck .dot { background: var(--danger); box-shadow: none; }

.term { position: relative; flex: 1 1 0; min-height: 0; border-radius: var(--r-sm); background: var(--code-bg); }
.lines { height: 100%; overflow: auto; overscroll-behavior: contain; padding: 12px 14px; color: var(--code-text); font: 500 13px/1.5 var(--num); }
.lines p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.lines .step { margin-top: 10px; color: var(--sticker); font-weight: 700; }
.lines .step:first-child { margin-top: 0; }
.lines .error { color: #ff8b8b; font-weight: 700; }
.lines .wait { opacity: 0.6; }
.back { position: absolute; right: 12px; bottom: 12px; display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 12px; background: var(--surface); color: var(--text); font: 700 14px/1 var(--font); }

.trouble { margin: 0; font-size: 15px; line-height: 1.35; }
.refused { color: var(--danger); }
.foot { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.foot .button, .foot button { min-height: 44px; }
.foot .second:first-child { margin-right: auto; }
.foot .second { display: inline-flex; align-items: center; gap: 6px; }
.stop { padding: 0 16px; background: var(--danger); box-shadow: none; color: var(--surface); font-weight: 700; }
.stop:hover:not(:disabled) { background: var(--danger); filter: brightness(0.95); }
@media (max-width: 560px) {
  .track li { flex-direction: column; text-align: center; font-size: 13px; }
}
</style>
