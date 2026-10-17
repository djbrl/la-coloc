<script setup lang="ts">
// The coach: one flat card at the bottom of the screen during the quest, saying the one thing to do now. No line on
// top names the chapter (the tracker does; the card says it to screen readers): one or two sentences, the step's
// own piece (the two ways to bring a project, the launch's track, your address, the postcard to share, a card about the house), and at most one main action.
// A small × leaves the quest (settings bring it back). The steps themselves live in tutorial.ts; this only shows
// them. The big moments in the middle of the screen (the keys, "Welcome home") are KeysCard.vue and HomeCard.vue.
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { caps } from "../../../lobby/keys";
import { bare, explain } from "../panel/words";
import LaunchCard from "./LaunchCard.vue";
import QuestIcon, { type QuestIconName } from "./QuestIcon.vue";
import RepoPicker from "./RepoPicker.vue";
import ShareCard from "./ShareCard.vue";
import { CHAPTERS, HOUSE_CARDS, isLive, type TutorialMachine } from "./tutorial";
import { tutorialWords as w } from "./words";
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

// The key caps of the walk step, as this keyboard prints them (Z Q S D on AZERTY: lobby/keys.ts).
const walkCaps = computed(() => [caps.w, caps.a, caps.s, caps.d]);

const state = computed(() => props.machine.state);
const room = computed(() => state.value?.room ?? null);
const house = computed(() => state.value?.house ?? null);
const live = computed(() => isLive(state.value));
const installUrl = computed(() => state.value?.github.installUrl ?? null);
const repo = computed(() => state.value?.github.repo ?? null);
const url = computed(() => room.value?.url ?? null);
// Chapter 4 with GitHub: the picker shows once GitHub has answered with repos, or when "Change" is pressed.
const repos = computed(() => props.choices?.repos ?? []);
const changing = ref(false);
const picking = computed(() => step.value === "project" && repos.value.length > 0 && (props.machine.github === "waiting" || changing.value));
const needsLogin = computed(() => props.choices?.reason === "no-github");
watch(repo, () => (changing.value = false));

// Chapter 8's cards: an icon and a title each, and one sentence.
const houseCard = computed(() => HOUSE_CARDS[props.machine.card]);
const houseIcon: Record<(typeof HOUSE_CARDS)[number], QuestIconName> = { flatmates: "people", reviews: "reviews", news: "news" };
const houseLine = computed(() => (houseCard.value === "flatmates" ? w.flatmatesLine : houseCard.value === "reviews" ? w.reviewsLine(props.credit) : w.newsLine));
const lastCard = computed(() => props.machine.card === HOUSE_CARDS.length - 1);

// Enter and Space press the focused button; they must not reach the engine, where Enter means "use what's in
// reach". Every other key (W A S D, E, Escape) passes, so you can still walk with the coach in focus.
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
  <div class="coach" :class="[`at-${step}`]" role="dialog" :aria-label="label" @keydown="onKey">
    <button type="button" class="x" :aria-label="w.skip" @click="emit('stop')"><QuestIcon name="close" :size="16" /></button>

    <div class="body" aria-live="polite">
      <template v-if="waiting && needsApi && !live">
        <p class="text">{{ w.waiting }}</p>
        <p class="sub">{{ w.waitingWhy }}</p>
      </template>

      <p v-else-if="missing && needsApi" class="text">{{ w.missing }}</p>

      <!-- 1 · Arrive: walk. -->
      <template v-else-if="step === 'walk'">
        <p v-if="touch" class="text">{{ w.walkTouch }}</p>
        <template v-else>
          <p class="text">{{ w.walkKeys(walkCaps.join(" ")) }}</p>
          <p class="caps"><kbd v-for="c in walkCaps" :key="c">{{ c }}</kbd></p>
        </template>
      </template>

      <!-- 2 · Find a home: the camera shows the light at the door, then you walk there and go in, then take the room. -->
      <p v-else-if="step === 'look'" class="text">{{ w.look }}</p>
      <template v-else-if="step === 'go'">
        <p class="text">{{ touch ? w.goTouch : w.goKeys }}</p>
        <p v-if="!touch" class="caps"><kbd>{{ caps.e }}</kbd></p>
      </template>
      <template v-else-if="step === 'room'">
        <p class="text">{{ w.room }}</p>
        <p class="sub">{{ w.roomWhy }}</p>
      </template>

      <!-- 4 · Bring a project: two big tiles, or the GitHub path one step at a time. -->
      <template v-else-if="picking">
        <p class="text">{{ w.pickTitle }}</p>
        <RepoPicker :repos="repos" :chosen="choices?.chosen ?? null" :busy="busy" @pick="(id) => emit('pick', id)" />
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
        :launched="machine.launched"
        :error="error"
        :busy="busy"
        :waiting="waiting"
        :from-github="source === 'github'"
        @retry="emit('run', source)"
        @starter="emit('run', 'starter')"
      />

      <!-- 6 · Open it: the address, big, and one press. -->
      <template v-else-if="step === 'open'">
        <p class="text">{{ w.openTitle }}</p>
        <p v-if="url" class="url">{{ bare(url) }}</p>
        <p class="sub">{{ w.openWhy }}</p>
      </template>

      <!-- 7 · Show it off. -->
      <ShareCard
        v-else-if="step === 'share' && url && room && house"
        :url="url"
        :room="room.name"
        :house="house.name"
        :city="house.city"
        :touch="touch"
        @shared="emit('shared')"
      />

      <!-- 8 · Meet the house, one idea per card. -->
      <template v-else-if="step === 'house'">
        <p class="text with-icon"><span class="badge"><QuestIcon :name="houseIcon[houseCard]" :size="18" /></span>{{ w.houseTitles[houseCard] }}</p>
        <p class="line">{{ houseLine }}</p>
      </template>

      <p v-if="error && step !== 'launch'" class="sub error" role="alert">{{ error }}</p>
    </div>

    <div class="nav">
      <button v-if="missing && !waiting && needsApi" ref="go" type="button" class="primary go" :disabled="busy" @click="emit('stop')">{{ w.leave }}</button>
      <button v-else-if="step === 'room'" ref="go" type="button" class="primary go" :disabled="busy || waiting" @click="emit('room')">{{ w.takeRoom }}</button>
      <template v-else-if="picking">
        <button v-if="changing" type="button" class="quiet" @click="changing = false"><QuestIcon name="back" :size="16" />{{ w.back }}</button>
        <button v-else type="button" class="quiet" @click="emit('back')"><QuestIcon name="back" :size="16" />{{ w.back }}</button>
        <a v-if="installUrl" class="button quiet" :href="installUrl" target="_blank" rel="noopener">{{ w.pickAllow }} <QuestIcon name="open" :size="16" /><span class="sr-only">{{ w.opensInTab }}</span></a>
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
      <a
        v-else-if="step === 'open' && url"
        ref="go"
        class="button primary go wide"
        :href="url"
        target="_blank"
        rel="noopener"
        @click="emit('opened')"
        @auxclick="emit('opened')"
      >
        {{ w.openIt }} <QuestIcon name="open" :size="18" /><span class="sr-only">{{ w.opensInTab }}</span>
      </a>
      <button v-else-if="step === 'share'" ref="go" type="button" class="quiet" @click="emit('later')">{{ w.later }}</button>
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
  gap: 10px;
  padding: 12px 16px 14px 18px;
  border-radius: var(--r-lg);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
  animation: coach-pop var(--dur-slow) var(--ease-pop);
}
.coach.at-share, .coach.at-launch { width: min(540px, calc(100vw - 32px)); }
@keyframes coach-pop {
  from { opacity: 0; transform: translateY(10px) scale(0.95); }
}
/* The close key sits in the corner; the step's first line leaves room for it. */
.coach { position: relative; padding-top: 14px; }
.body > :first-child { padding-right: 30px; }
.x { position: absolute; top: 8px; right: 8px; flex: none; width: 30px; height: 30px; min-height: 0; padding: 0; display: grid; place-items: center; border-radius: var(--r-sm); background: none; color: var(--muted); }
.x:hover:not(:disabled) { background: var(--fill); color: var(--text); }
.body { display: grid; gap: 6px; }
.text { margin: 0; font: 700 19px/1.3 var(--display); letter-spacing: -0.015em; }
.sub { margin: 0; font-size: 15px; line-height: 1.4; color: var(--muted); }
.line { margin: 0; font-size: 16px; line-height: 1.45; }
.error { color: var(--danger); }
/* Your address, big, in the monospace: the thing to remember. A long one wraps rather than push the card wider. */
.url { margin: 4px 0; padding: 10px 12px; border-radius: var(--r-md); background: var(--tile); box-shadow: inset 0 0 0 1px var(--line); font: 600 20px/1.25 var(--mono); color: var(--accent); overflow-wrap: anywhere; }
/* The keys of the step, as big raised caps. */
.caps { margin: 4px 0 0; display: flex; gap: 6px; }
.caps kbd { min-width: 36px; height: 36px; padding: 0 8px; border-radius: var(--r-sm); border-bottom-width: 3px; font-size: 14px; }
/* Chapter 4's two ways in: big tiles, the ready-made page first and in the orange. */
.tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 6px; }
.tile { display: flex; align-items: flex-start; gap: 10px; min-height: 0; padding: 12px; border: 0; border-radius: var(--r-md); background: var(--surface); color: var(--text); box-shadow: var(--quiet-edge); text-align: left; font: inherit; line-height: 1.3; text-decoration: none; cursor: pointer; }
.tile:hover:not(:disabled):not(.off) { background: var(--tile); text-decoration: none; }
.tile:active:not(:disabled):not(.off) { transform: translateY(1px); }
.tile.main { background: var(--accent-soft); box-shadow: inset 0 0 0 2px var(--accent-fill), 0 3px 0 var(--accent-lip); }
.tile.main:hover:not(:disabled) { background: var(--accent-soft); box-shadow: inset 0 0 0 2px var(--accent-fill-hover), 0 3px 0 var(--accent-lip); }
.tile.off { opacity: 0.6; cursor: default; }
.tile-icon { flex: none; display: grid; place-items: center; width: 40px; height: 40px; border-radius: var(--r-sm); background: var(--tile); color: var(--muted); }
.main .tile-icon { background: var(--accent-fill); color: var(--on-accent); }
.tile-text { display: grid; gap: 3px; min-width: 0; }
.tile-title { display: inline-flex; align-items: center; gap: 4px; font-weight: 700; font-size: 15px; }
.tile-sub { font-size: 13px; color: var(--muted); }
/* Waiting on GitHub: three dots that take turns. */
.dots { display: flex; gap: 6px; margin-top: 2px; }
.dots span { width: 8px; height: 8px; border-radius: 50%; background: var(--accent-fill); animation: dot 1.2s var(--ease) infinite; }
.dots span:nth-child(2) { animation-delay: 0.2s; }
.dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes dot {
  0%, 60%, 100% { opacity: 0.25; transform: none; }
  30% { opacity: 1; transform: translateY(-3px); }
}
/* Chapter 8: the card's icon in a soft disc beside its title. */
.with-icon { display: flex; align-items: center; gap: 10px; }
.badge { flex: none; display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; background: var(--accent-soft); color: var(--accent); }
.nav { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.nav:empty { display: none; }
.nav > .quiet:first-child { margin-right: auto; }
.count { margin-right: auto; font: 500 13px/1 var(--mono); color: var(--muted); }
.quiet { display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 0 14px; border-radius: var(--r-md); background: var(--surface); box-shadow: var(--quiet-edge); color: var(--muted); font-size: 14px; font-weight: 600; }
.quiet:hover:not(:disabled) { background: var(--tile); color: var(--text); text-decoration: none; }
.quiet:active:not(:disabled) { transform: translateY(1px); }
.go { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 0 20px; border-radius: var(--r-md); font-size: 17px; }
.go.wide { flex: 1 1 auto; min-height: 52px; font-size: 19px; }
a.go:hover { text-decoration: none; }
button:focus-visible, a:focus-visible { outline: 3px solid var(--accent-fill); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  .coach, .dots span { animation: none; }
  .quiet:active:not(:disabled), .tile:active { transform: none; }
}
@media (max-width: 520px) {
  .coach { padding: 10px 12px 12px 14px; }
  .text { font-size: 17px; }
  .tiles { grid-template-columns: 1fr; }
  .url { font-size: 16px; }
}
</style>
