<script setup lang="ts">
// The coach: one flat tooltip at the bottom centre of the lobby during the tutorial. A thin line for how far
// along you are, one or two sentences for the step you're on, at most one main action, and a quiet way out. The
// steps themselves live in tutorial.ts; this only shows them. The welcome cards at either end are Welcome.vue.
// The words are the panels' words (panel/words.ts): a room is your share of the house's server, a project is an
// app whose code is in a Git repo, and putting it online means fetching, building and starting it at an address.
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { bare, explain } from "../panel/words";
import { goingWord, isLive, type TutorialMachine } from "./tutorial";
import { tutorialWords as w } from "./words";

const props = defineProps<{
  machine: TutorialMachine;
  // The server doesn't have the tutorial yet (404).
  missing: boolean;
  // The core is down: the steps that need the API wait, and say so.
  waiting?: boolean;
  busy: boolean;
  error: string;
  // "Put it online" was pressed: the sentence follows the room's status.
  ran: boolean;
}>();
const emit = defineEmits<{ room: []; run: []; opened: []; next: []; skipGithub: []; openRoom: []; finish: []; skip: [] }>();

const step = computed(() => props.machine.step);
// The steps that talk to the API.
const needsApi = computed(() => ["room", "run", "github"].includes(step.value));
const touch = computed(() => props.machine.touch);

// The key caps of the walk step.
const walkCaps = ["W", "A", "S", "D"];

// The room, and its status in the words of the step that puts it online.
const room = computed(() => props.machine.state?.room ?? null);
const houseName = computed(() => props.machine.state?.house.name ?? "L'Atelier");
const live = computed(() => isLive(props.machine.state));
const failed = computed(() => room.value?.status === "failed" || room.value?.status === "down");
const going = computed(() => goingWord(room.value?.status, props.ran));
const installUrl = computed(() => props.machine.state?.github.installUrl ?? null);

// Enter and Space press the focused button; they must not reach the engine, where Enter means "use what's in
// reach". Every other key (W A S D, E, Escape) passes, so you can still walk with the coach in focus.
function onKey(e: KeyboardEvent) {
  if (e.key === "Enter" || e.key === " ") e.stopPropagation();
}

// When a step's main action appears, the keyboard lands on it, a moment after the inside (which takes focus when
// it opens) has settled. Steps you do with the keys never take focus.
const go = ref<HTMLElement | null>(null);
let timer = 0;
watch(
  () => [step.value, live.value, props.machine.roomOpened, props.machine.linked],
  () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => go.value?.focus({ preventScroll: true }), 120);
  },
  { flush: "post", immediate: true },
);
onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <div class="coach" role="dialog" :aria-label="w.coach" @keydown="onKey">
    <div class="line" aria-hidden="true"><span :style="{ width: `${Math.round(machine.progress * 100)}%` }" /></div>

    <div class="body" aria-live="polite">
      <template v-if="waiting && needsApi && !live">
        <p class="text">{{ w.waiting }}</p>
        <p class="sub">{{ w.waitingWhy }}</p>
      </template>

      <p v-else-if="missing && (step === 'room' || step === 'run' || step === 'github')" class="text">{{ w.missing }}</p>

      <template v-else-if="step === 'walk'">
        <p v-if="touch" class="text">{{ w.walkTouch }}</p>
        <template v-else>
          <p class="text">{{ w.walkKeys }}</p>
          <p class="caps"><kbd v-for="c in walkCaps" :key="c">{{ c }}</kbd></p>
        </template>
      </template>

      <p v-else-if="step === 'look'" class="text">{{ w.look }}</p>

      <p v-else-if="step === 'go'" class="text">{{ touch ? w.goTouch : w.goKeys }}</p>

      <template v-else-if="step === 'room'">
        <p class="text">{{ w.room }}</p>
        <p class="sub">{{ w.roomWhy }}</p>
      </template>

      <!-- Putting the sample online: what a project is, then each step as the room goes, then its address. -->
      <template v-else-if="step === 'run'">
        <p v-if="live && machine.roomOpened" class="text">{{ w.wellDone }}</p>
        <p v-else-if="live" class="text">
          {{ w.onlineAt }} <span class="address">{{ room?.url ? bare(room.url) : w.itsAddress }}</span>{{ w.onlineEnd }}
          <a v-if="room?.url" ref="go" class="open" :href="room.url" target="_blank" rel="noopener" @click="emit('opened')" @auxclick="emit('opened')">{{ w.openIt }}</a>
        </p>
        <p v-else-if="error" class="text">{{ error }}</p>
        <p v-else-if="failed" class="text">{{ w.failed }}</p>
        <template v-else-if="going">
          <p class="text">{{ going }}</p>
          <p class="sub">{{ explain.online }}</p>
        </template>
        <template v-else>
          <p class="text">{{ w.project }}</p>
          <p class="sub">{{ w.sample }}</p>
        </template>
      </template>

      <template v-else-if="step === 'github'">
        <p v-if="machine.linked" class="text">{{ machine.linkedBefore ? w.linkedBefore : w.linked }}</p>
        <template v-else>
          <p class="text">{{ w.link }}</p>
          <p class="sub">{{ installUrl ? w.linkWhy : w.noGithub }}</p>
        </template>
      </template>

      <template v-else-if="step === 'done'">
        <p class="text">{{ room ? w.done(room.name, houseName) : w.doneShort }}</p>
        <p v-if="room" class="sub">{{ w.doneWhy }}</p>
      </template>

      <p v-if="error && step !== 'run'" class="sub error" role="alert">{{ error }}</p>
    </div>

    <div class="nav">
      <button v-if="step !== 'done'" type="button" class="link quiet" @click="emit('skip')">{{ w.skip }}</button>

      <button v-if="missing && !waiting && (step === 'room' || step === 'run' || step === 'github')" ref="go" type="button" class="primary go" :disabled="busy" @click="emit('skip')">{{ w.leave }}</button>
      <button v-else-if="step === 'room'" ref="go" type="button" class="primary go" :disabled="busy || waiting" @click="emit('room')">{{ w.takeRoom }}</button>
      <template v-else-if="step === 'run'">
        <button v-if="live && machine.roomOpened" ref="go" type="button" class="primary go" @click="emit('next')">{{ w.next }}</button>
        <button v-else-if="!live && (error || failed)" ref="go" type="button" class="primary go" :disabled="busy || waiting" @click="emit('run')">{{ w.tryAgain }}</button>
        <button v-else-if="!live && !going" ref="go" type="button" class="primary go" :disabled="busy || waiting" @click="emit('run')">{{ w.putOnline }}</button>
      </template>
      <template v-else-if="step === 'github'">
        <button v-if="machine.linked" ref="go" type="button" class="primary go" @click="emit('next')">{{ w.next }}</button>
        <template v-else-if="installUrl">
          <button type="button" class="link quiet" @click="emit('skipGithub')">{{ w.later }}</button>
          <a ref="go" class="button primary go" :href="installUrl" target="_blank" rel="noopener">{{ w.install }}</a>
        </template>
        <button v-else ref="go" type="button" class="primary go" @click="emit('skipGithub')">{{ w.later }}</button>
      </template>
      <template v-else-if="step === 'done'">
        <button v-if="room" type="button" class="link quiet" @click="emit('openRoom')">{{ w.openRoom }}</button>
        <button ref="go" type="button" class="primary go" :disabled="busy" @click="emit('finish')">{{ w.intoCity }}</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* A flat piece of the site's surface, lifted by a shadow: no glass, no blur. It reads like a game's hint box: a
   bold line, the keys as raised caps, chunky buttons. It pops in when it first shows. */
.coach {
  width: min(460px, calc(100vw - 32px));
  display: grid;
  gap: 10px;
  padding: 14px 16px 14px 18px;
  border-radius: var(--r-lg);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
  animation: coach-pop var(--dur-slow) var(--ease-pop);
}
@keyframes coach-pop {
  from { opacity: 0; transform: translateY(10px) scale(0.95); }
}
/* How far along you are: a game's quest bar, a sunken track filled in the orange up to here. */
.line { height: 6px; margin-right: 2px; border-radius: 3px; background: var(--fill); box-shadow: inset 0 0 0 1px var(--hairline); overflow: hidden; }
.line span { display: block; height: 100%; border-radius: 3px; background: var(--accent-fill); transition: width var(--dur-slow) var(--ease-pop); }
.body { display: grid; gap: 6px; }
.text { margin: 0; font: 700 18px/1.3 var(--display); letter-spacing: -0.015em; }
.sub { margin: 0; font-size: 15px; line-height: 1.4; color: var(--muted); }
.error { color: var(--danger); }
/* "Open it": a small accent pill inside the sentence, not an underlined link. */
.open { display: inline-flex; align-items: center; margin-left: 4px; padding: 2px 10px; border-radius: var(--r-sm); background: var(--accent-soft); color: var(--accent); font-weight: 700; white-space: nowrap; text-decoration: none; }
.open:hover { background: var(--accent-soft); text-decoration: none; box-shadow: inset 0 0 0 2px var(--accent-fill); }
/* The room's address, in the monospace like any address. A long one wraps rather than push the card wider. */
.address { font: 500 0.88em var(--mono); letter-spacing: 0; overflow-wrap: anywhere; }
/* The keys of the step, as big raised caps. */
.caps { margin: 4px 0 0; display: flex; gap: 6px; }
.caps kbd { min-width: 36px; height: 36px; padding: 0 8px; border-radius: var(--r-sm); border-bottom-width: 3px; font-size: 14px; transition: background-color var(--dur-fast), color var(--dur-fast), border-color var(--dur-fast), transform var(--dur-fast); }
.nav { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.nav:empty { display: none; }
/* The way out sits on the left as a quiet grey button; the step's action on the right, in the accent. */
.nav > .quiet:first-child { margin-right: auto; }
.quiet { min-height: 40px; padding: 0 14px; border-radius: var(--r-md); background: var(--surface); box-shadow: var(--quiet-edge); color: var(--muted); font-size: 14px; font-weight: 600; }
.quiet:hover:not(:disabled) { background: var(--tile); color: var(--text); text-decoration: none; }
.quiet:active:not(:disabled) { transform: translateY(1px); }
.go { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 20px; border-radius: var(--r-md); font-size: 17px; }
a.go:hover { text-decoration: none; }
button:focus-visible, a:focus-visible { outline: 3px solid var(--accent-fill); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  .coach { animation: none; }
  .line span, kbd { transition: none; }
  .quiet:active:not(:disabled) { transform: none; }
}
@media (max-width: 520px) {
  .coach { padding: 12px 14px; }
  .text { font-size: 16px; }
}
</style>
