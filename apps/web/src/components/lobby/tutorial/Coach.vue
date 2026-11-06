<script setup lang="ts">
// The coach: one white card (carte blanche) at the bottom of the screen during the quest, saying the one thing to do now. No line on
// top names the chapter (the tracker does; the card says it to screen readers): one or two sentences, the step's
// own piece (the two ways to bring a project, the launch's track, your address, the postcard to share, a card about the house), and at most one main action.
// No ×: closing a message must never end the quest (Jib, 6 11). Leaving it is said in words, on the first card ("Not
// now") or in the settings. A step that points at a control in the house's window has a spotlight on it instead
// (Spotlight.vue). While the camera shows you the house ("look") there's no card at all: the city is the message. The
// walk there teaches walking on the way: the arrows to try, lit as you use them. The door's own prompt says how to go
// in, so the coach never mentions it. The steps themselves live in tutorial.ts; this only shows them. The big moments in the middle of the screen (the keys, "Well done") are KeysCard.vue and HomeCard.vue.
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { ARROWS } from "../../../lobby/keys";
import { bare, explain } from "../panel/words";
import ArrowKeys from "./ArrowKeys.vue";
import LaunchCard from "./LaunchCard.vue";
import QuestIcon, { type QuestIconName } from "./QuestIcon.vue";
import RepoPicker from "../../RepoPicker.vue";
import ShareCard from "./ShareCard.vue";
import { opensAnywhere } from "./share";
import { type Action, CHAPTERS, HOUSE_CARDS, isLive, type TutorialMachine } from "./tutorial";
import { houseLineOf, tutorialWords as w } from "./words";
import type { RepoChoices } from "../../../types";

const props = defineProps<{
  machine: TutorialMachine;
  // The server doesn't have the quest yet (404).
  missing: boolean;
  // The core is down: the steps that need the API wait, and say so.
  waiting?: boolean;
  busy: boolean;
  error: string;
  // Where the last launch came from, so "Try again" launches the same thing.
  source: "starter" | "github";
  // What a review takes off the rent, already written as money ("500 FCFA").
  credit: string;
  // The repos you let La Coloc see on GitHub (chapter 4's picker); null until asked.
  choices?: RepoChoices | null;
}>();
const emit = defineEmits<{
  room: [];
  run: [source: "starter" | "github"];
  github: [];
  pick: [id: number];
  back: [];
  opened: [];
  shared: [];
  later: [];
  next: [];
  stop: [];
}>();

const step = computed(() => props.machine.step);
const chapter = computed(() => props.machine.chapter);
// The box's hidden name: the quest, and the chapter you're in.
const label = computed(() => (chapter.value ? `${w.quest}. ${w.chapterOf(CHAPTERS.indexOf(chapter.value) + 1, CHAPTERS.length, w.chapters[chapter.value])}` : w.quest));
const touch = computed(() => props.machine.touch);
// The steps that talk to the API.
const needsApi = computed(() => ["room", "project", "launch", "open"].includes(step.value));

// The card's icon, in carte blanche's soft red tile beside its words. The launch and the postcard draw their own heads.
const chipIcon = computed<QuestIconName | null>(() => {
  if (props.waiting && needsApi.value && !live.value) return "launch";
  if (step.value === "launch" || step.value === "share") return null;
  if (step.value === "house") return houseIcon[houseCard.value];
  return ({ go: "arrive", room: "keys", project: picking.value ? "repo" : "project", open: "open" } as Partial<Record<string, QuestIconName>>)[step.value] ?? null;
});

// The walk to the house: the arrows you've walked with so far (W A S D count too, unshown).
const ARROW_OF: Partial<Record<Action, string>> = { "walk-up": ARROWS.up, "walk-left": ARROWS.left, "walk-down": ARROWS.down, "walk-right": ARROWS.right };
const walked = computed(() => props.machine.walked.map((a) => ARROW_OF[a] ?? ""));

const state = computed(() => props.machine.state);
const room = computed(() => state.value?.room ?? null);
const house = computed(() => state.value?.house ?? null);
const live = computed(() => isLive(state.value));
const installUrl = computed(() => state.value?.github.installUrl ?? null);
const repo = computed(() => state.value?.github.repo ?? null);
const url = computed(() => room.value?.url ?? null);
// Chapter 4 with GitHub: the picker shows once GitHub has answered with repos, or when "Change" is pressed.
const repos = computed(() => props.choices?.repos ?? []);
const changing = ref(props.machine.repick);
const picking = computed(() => step.value === "project" && repos.value.length > 0 && (props.machine.github === "waiting" || changing.value));
const needsLogin = computed(() => props.choices?.reason === "no-github");
watch(repo, () => (changing.value = false));
function pickRepo(id: number) {
  changing.value = false;
  emit("pick", id);
}
// A failed or cancelled launch: back to the list of repos, to bring another one (the machine remembers: `repick`).
function otherProject() {
  emit("back");
}

// Chapter 6: the address's copy key says "Copied" for a moment. No clipboard (an old browser, no permission): the
// address is on the card to copy by hand.
const copied = ref(false);
let copiedTimer = 0;
async function copyUrl() {
  if (!url.value) return;
  try {
    await navigator.clipboard.writeText(url.value);
  } catch {
    return;
  }
  copied.value = true;
  clearTimeout(copiedTimer);
  copiedTimer = window.setTimeout(() => (copied.value = false), COPIED_MS);
}
const COPIED_MS = 1600;
onBeforeUnmount(() => clearTimeout(copiedTimer));

// Chapter 8's cards: an icon and a title each, and one sentence.
const houseCard = computed(() => HOUSE_CARDS[props.machine.card]);
const houseIcon: Record<(typeof HOUSE_CARDS)[number], QuestIconName> = { flatmates: "people", channel: "chat", reviews: "reviews", news: "news", bill: "bill" };
const houseLine = computed(() => houseLineOf(houseCard.value, props.credit));
const lastCard = computed(() => props.machine.card === HOUSE_CARDS.length - 1);

// Enter and Space press the focused button; they must not reach the engine, where Enter means "use what's in
// reach". Every other key (the arrows, Escape) passes, so you can still walk with the coach in focus.
function onKey(e: KeyboardEvent) {
  if (e.key === "Enter" || e.key === " ") e.stopPropagation();
}

// When a step's main action appears, the keyboard lands on it, a moment after anything else that takes focus (the
// house's window) has settled. Steps you do with the keys never take focus.
const go = ref<HTMLElement | null>(null);
let timer = 0;
watch(
  () => [step.value, props.machine.github, props.machine.card, live.value, props.machine.launched],
  () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => go.value?.focus({ preventScroll: true }), 160);
  },
  { flush: "post", immediate: true },
);
onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <!-- No eyebrow over the step (the tracker at the top already shows the chapter): it's in the box's hidden name. -->
  <div v-if="step !== 'look'" class="coach" :class="[`at-${step}`]" role="dialog" :aria-label="label" @keydown="onKey">
    <div class="row">
    <span v-if="chipIcon" class="icon-tile"><QuestIcon :name="chipIcon" :size="22" /></span>
    <div class="body" aria-live="polite">
      <template v-if="waiting && needsApi && !live">
        <p class="text">{{ w.waiting }}</p>
        <p class="sub">{{ w.waitingWhy }}</p>
      </template>

      <p v-else-if="missing && needsApi" class="text">{{ w.missing }}</p>

      <!-- 1 · Arrive: the camera has shown the light at the door; walk there. The arrows light as you use them. -->
      <template v-else-if="step === 'go'">
        <p class="text">{{ w.goTitle }}</p>
        <p class="sub">{{ touch ? w.goTouch : w.goWhy }}</p>
        <p v-if="!touch" class="caps" aria-hidden="true"><span class="label">{{ w.tryIt }}</span><ArrowKeys :lit="walked" /></p>
      </template>

      <!-- 2 · Find a home: inside, take the room. -->
      <template v-else-if="step === 'room'">
        <p class="text">{{ w.room }}</p>
        <p class="sub">{{ w.roomWhy }}</p>
      </template>

      <!-- 4 · Deploy a project: two big tiles, or the GitHub path one step at a time. -->
      <template v-else-if="picking">
        <p class="text">{{ w.pickTitle }}</p>
        <p class="sub">{{ w.pickWhy }}</p>
        <RepoPicker :selected="repo ?? undefined" :busy="busy" focus @pick="(r) => pickRepo(r.id)" />
      </template>
      <template v-else-if="step === 'project' && machine.github === 'waiting' && needsLogin">
        <p class="text">{{ w.pickLogin }}</p>
      </template>
      <template v-else-if="step === 'project' && machine.github === 'waiting'">
        <p class="text">{{ w.waitingGithub }}</p>
        <p class="sub dots" aria-hidden="true"><span /><span /><span /></p>
      </template>
      <template v-else-if="step === 'project' && machine.github === 'linked'">
        <p class="text">{{ repo ? w.linkedRepo(repo) : w.linkedSome }}</p>
        <p class="sub">{{ explain.online }}</p>
      </template>
      <template v-else-if="step === 'project'">
        <p class="text">{{ w.projectTitle }}</p>
        <p class="sub">{{ w.projectWhy }}</p>
        <div class="tiles">
          <button ref="go" type="button" class="tile main" :disabled="busy || waiting" @click="emit('run', 'starter')">
            <span class="tile-icon"><QuestIcon name="page" :size="24" /></span>
            <span class="tile-text"><span class="tile-title">{{ w.starter }}</span><span class="tile-sub">{{ w.starterWhy }}</span></span>
          </button>
          <button v-if="installUrl" type="button" class="tile" :disabled="busy || waiting" @click="emit('github')">
            <span class="tile-icon"><QuestIcon name="repo" :size="24" /></span>
            <span class="tile-text"><span class="tile-title">{{ w.own }}</span><span class="tile-sub">{{ w.ownWhy }}</span></span>
          </button>
          <div v-else class="tile off" aria-disabled="true">
            <span class="tile-icon"><QuestIcon name="repo" :size="24" /></span>
            <span class="tile-text"><span class="tile-title">{{ w.own }}</span><span class="tile-sub">{{ w.ownOff }}</span></span>
          </div>
        </div>
      </template>

      <!-- 5 · Launch it: the show. -->
      <LaunchCard
        v-else-if="step === 'launch'"
        :status="room?.status"
        :why="room?.why"
        :log="room?.log"
        :room="room?.name"
        :launched="machine.launched"
        :error="error"
        :busy="busy"
        :waiting="waiting"
        :from-github="source === 'github'"
        @retry="emit('run', source)"
        @starter="emit('run', 'starter')"
        @other="otherProject"
      />

      <!-- 6 · Open it: the address, big, with its copy key. -->
      <template v-else-if="step === 'open'">
        <p class="text">{{ w.openTitle }}</p>
        <div v-if="url" class="url-row">
          <p class="url">{{ bare(url) }}</p>
          <button type="button" class="copy" :class="{ done: copied }" :aria-label="copied ? w.copied : w.copyAddressName" @click="copyUrl">
            <QuestIcon :name="copied ? 'tick' : 'copy'" :size="16" /><span>{{ copied ? w.copied : w.copyAddress }}</span>
          </button>
        </div>
        <p class="sub">{{ url && !opensAnywhere(url) ? w.openWhyHere : w.openWhy }}</p>
      </template>

      <!-- 7 · Show it off. -->
      <ShareCard
        v-else-if="step === 'share' && url && room && house"
        :url="url"
        :room="room.name"
        :house="house.name"
        :house-id="house.id"
        :project="repo?.split('/').pop() ?? room.name"
        :city="house.city"
        :touch="touch"
        @shared="emit('shared')"
      />

      <!-- 8 · Meet the house, one idea per card. -->
      <template v-else-if="step === 'house'">
        <p class="text">{{ w.houseTitles[houseCard] }}</p>
        <p class="line">{{ houseLine }}</p>
      </template>

      <p v-if="error && step !== 'launch'" class="sub error" role="alert">{{ error }}</p>
    </div>
    </div>

    <div class="nav">
      <button v-if="missing && !waiting && needsApi" ref="go" type="button" class="primary go" :disabled="busy" @click="emit('stop')">{{ w.leave }}</button>
      <button v-else-if="step === 'room'" ref="go" type="button" class="primary go" :disabled="busy || waiting" @click="emit('room')">{{ w.takeRoom }}</button>
      <template v-else-if="picking">
        <button v-if="changing" type="button" class="quiet" @click="changing = false"><QuestIcon name="back" :size="16" />{{ w.back }}</button>
        <button v-else type="button" class="quiet" @click="emit('back')"><QuestIcon name="back" :size="16" />{{ w.back }}</button>
      </template>
      <template v-else-if="step === 'project' && machine.github === 'waiting'">
        <button type="button" class="quiet" @click="emit('back')"><QuestIcon name="back" :size="16" />{{ w.back }}</button>
        <a v-if="needsLogin" ref="go" class="button primary go" href="/login">{{ w.pickLoginGo }}</a>
        <a v-else-if="installUrl" ref="go" class="button primary go" :href="installUrl" target="_blank" rel="noopener">{{ w.openGithub }} <QuestIcon name="open" :size="16" /></a>
      </template>
      <template v-else-if="step === 'project' && machine.github === 'linked'">
        <button v-if="repos.length > 1" type="button" class="quiet" :disabled="busy || waiting" @click="changing = true">{{ w.pickChange }}</button>
        <button v-else type="button" class="quiet" :disabled="busy || waiting" @click="emit('run', 'starter')">{{ w.useStarter }}</button>
        <button ref="go" type="button" class="primary go" :disabled="busy || waiting" @click="emit('run', 'github')">{{ w.putOnline }}</button>
      </template>
      <!-- Your address: going to see it is the grey key; "Next" moves on without it. -->
      <template v-else-if="step === 'open' && url">
        <a class="button quiet" :href="url" target="_blank" rel="noopener" @click="emit('opened')" @auxclick="emit('opened')">
          {{ w.openIt }} <QuestIcon name="open" :size="16" /><span class="sr-only">{{ w.opensInTab }}</span>
        </a>
        <button ref="go" type="button" class="primary go" @click="emit('next')">{{ w.next }}</button>
      </template>
      <button v-else-if="step === 'share'" type="button" class="quiet" @click="emit('later')">{{ w.later }}</button>
      <template v-else-if="step === 'house'">
        <span class="count" aria-hidden="true">{{ w.houseCardOf(machine.card + 1, HOUSE_CARDS.length) }}</span>
        <button ref="go" type="button" class="primary go" @click="emit('next')">{{ lastCard ? w.gotIt : w.next }}</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* A flat piece of the site's surface, lifted by a shadow: no glass, no blur. It reads like a game's quest box: the
   close key in the corner, a bold line, the keys as raised caps, chunky buttons. It pops in. */
.coach {
  width: min(480px, calc(100vw - 32px));
  display: grid;
  gap: 14px;
  padding: 20px;
  border-radius: var(--card-r);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
  animation: coach-pop var(--dur-slow) var(--ease-pop);
}
.coach.at-launch { width: min(540px, calc(100vw - 32px)); }
/* The postcard is a narrow, upright card (ShareCard.vue): the coach is no wider than it. */
.coach.at-share { width: min(420px, calc(100vw - 32px)); }
@keyframes coach-pop {
  from { opacity: 0; transform: translateY(10px) scale(0.95); }
}
.coach { position: relative; }
/* Carte blanche's head: the icon's tile, then the words. */
.row { display: flex; align-items: flex-start; gap: 14px; min-width: 0; }
.body { flex: 1 1 auto; min-width: 0; display: grid; gap: 4px; }
.text { margin: 0; padding-top: 1px; font: 800 22px/28px var(--display); }
.sub { margin: 0; font-size: 15px; line-height: 21px; color: var(--muted); }
.line { margin: 0; font-size: 15px; line-height: 21px; color: var(--muted); }
.error { color: var(--danger); }
/* Your address, big, in the monospace: the thing to remember. A long one wraps rather than push the card wider. */
.url-row { display: flex; align-items: center; gap: 10px; margin: 8px 0 4px; padding: 8px 8px 8px 14px; border-radius: 12px; background: var(--tile); }
.url { flex: 1 1 auto; min-width: 0; margin: 0; font: 500 15px/1.4 var(--code); color: var(--accent); overflow-wrap: anywhere; }
/* Copying is a small white key on the address's tile (as on the postcard, ShareCard.vue). */
.copy { flex: none; display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 12px 3px; border-radius: 10px; background: var(--surface); color: var(--text); box-shadow: inset 0 -3px 0 var(--quiet-lip); font-size: 14px; font-weight: 800; }
.copy:hover:not(:disabled) { background: var(--surface); }
.copy.done { color: var(--live); }
/* "Try it": the arrows as raised caps on a soft strip (ArrowKeys.vue). They're a hint: the city has the keys. */
.caps { display: flex; align-items: center; gap: 6px; margin: 10px 0 0; padding: 12px 14px; border-radius: var(--tile-r); background: var(--tile); }
.caps .label { margin-right: 6px; }
/* Chapter 4's two ways in: big tiles, the ready-made page first and in the red. */
.tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 6px; }
/* A choice is a row with a chevron's worth of room, never a picture: a soft tile, its icon on white. */
.tile { display: flex; align-items: center; gap: 12px; min-height: 0; padding: 12px 14px; border: 0; border-radius: var(--tile-r); background: var(--tile); color: var(--text); box-shadow: none; text-align: left; font: inherit; line-height: 1.3; text-decoration: none; cursor: pointer; }
.tile:hover:not(:disabled):not(.off) { background: var(--sunken); text-decoration: none; }
.tile:active:not(:disabled):not(.off) { transform: translateY(1px); }
.tile.off { opacity: 0.6; cursor: default; }
.tile-icon { flex: none; display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; background: var(--surface); color: var(--accent); }
.tile-text { display: grid; gap: 3px; min-width: 0; }
.tile-title { display: inline-flex; align-items: center; gap: 4px; font-weight: 800; font-size: 15px; line-height: 20px; }
.tile-sub { font-size: 13px; line-height: 18px; color: var(--muted); }
/* Waiting on GitHub: three dots that take turns. */
.dots { display: flex; gap: 6px; margin-top: 2px; }
.dots span { width: 8px; height: 8px; border-radius: 50%; background: var(--accent-fill); animation: dot 1.2s var(--ease) infinite; }
.dots span:nth-child(2) { animation-delay: 0.2s; }
.dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes dot {
  0%, 60%, 100% { opacity: 0.25; transform: none; }
  30% { opacity: 1; transform: translateY(-3px); }
}
.nav { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.nav:empty { display: none; }
.nav > .quiet:first-child { margin-right: auto; }
.count { margin-right: auto; font: 600 14px/1 var(--num); color: var(--muted); }
/* The second button: carte blanche's grey, with its lip. */
.quiet { display: inline-flex; align-items: center; gap: 6px; min-height: 48px; padding: 0 16px var(--lip); border-radius: 12px; background: var(--sunken); box-shadow: var(--quiet-edge); color: var(--text); font-size: 15px; font-weight: 800; }
.quiet:hover:not(:disabled) { background: var(--fill); text-decoration: none; }
.quiet:active:not(:disabled) { transform: translateY(2px); }
.go { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-width: 160px; padding: 0 20px var(--lip); }
.go.wide { flex: 1 1 auto; }
a.go:hover { text-decoration: none; }
button:focus-visible, a:focus-visible { outline: 3px solid var(--ring); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  .coach, .dots span { animation: none; }
  .quiet:active:not(:disabled), .tile:active { transform: none; }
}
@media (max-width: 520px) {
  .coach { padding: 16px; }
  .text { font-size: 19px; line-height: 24px; }
  .tiles { grid-template-columns: 1fr; }
  .url { font-size: 16px; }
}
</style>
