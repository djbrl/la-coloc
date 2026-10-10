<script setup lang="ts">
// The coach: one flat tooltip at the bottom centre of the lobby during the tutorial. A thin line for how far
// along you are, one or two sentences for the step you're on, at most one main action, and a quiet way out. The
// steps themselves live in tutorial.ts; this only shows them. The welcome cards at either end are Welcome.vue.
// The words are the panels' words (panel/words.ts): a room is your share of the house's server, a project is an
// app whose code is in a Git repo, and putting it online means fetching, building and starting it at an address.
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { bare, explain } from "../panel/words";
import { type Action, goingWord, isLive, type TutorialMachine } from "./tutorial";

const props = defineProps<{
  machine: TutorialMachine;
  // The server doesn't have the tutorial yet (404).
  missing: boolean;
  busy: boolean;
  error: string;
  // "Put it online" was pressed: the sentence follows the room's status.
  ran: boolean;
}>();
const emit = defineEmits<{ room: []; run: []; opened: []; next: []; skipGithub: []; openRoom: []; finish: []; skip: [] }>();

const step = computed(() => props.machine.step);
const touch = computed(() => props.machine.touch);

// The key caps of the walk and turn steps, each lit once you've used it.
const walkCaps: { action: Action; key: string }[] = [
  { action: "walk-up", key: "W" },
  { action: "walk-left", key: "A" },
  { action: "walk-down", key: "S" },
  { action: "walk-right", key: "D" },
];
const turnCaps: { action: Action; key: string }[] = [
  { action: "turn-left", key: "Q" },
  { action: "turn-right", key: "R" },
];

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
  <div class="coach" role="dialog" aria-label="The tutorial" @keydown="onKey">
    <div class="line" aria-hidden="true"><span :style="{ width: `${Math.round(machine.progress * 100)}%` }" /></div>

    <div class="body" aria-live="polite">
      <p v-if="missing && (step === 'room' || step === 'run' || step === 'github')" class="text">The tutorial isn't on this server yet.</p>

      <template v-else-if="step === 'walk'">
        <p v-if="touch" class="text">Tap the ground to walk there.</p>
        <template v-else>
          <p class="text">Walk around with W A S D.</p>
          <p class="caps"><kbd v-for="c in walkCaps" :key="c.key" :class="{ lit: machine.walked.includes(c.action) }">{{ c.key }}</kbd></p>
        </template>
      </template>

      <template v-else-if="step === 'dash'">
        <p class="text">Tap Shift to dash: it covers more ground.</p>
        <p class="caps"><kbd class="wide">Shift</kbd></p>
      </template>

      <template v-else-if="step === 'map'">
        <p v-if="touch" class="text">That's your map: the ring is you. Tap it to jump somewhere.</p>
        <p v-else-if="machine.mapOpen" class="text">Esc or M closes it.</p>
        <p v-else class="text">That's your map: the ring is you. Press M to open it.</p>
      </template>

      <template v-else-if="step === 'keys'">
        <p v-if="machine.keysOpened" class="text">Esc closes the list.</p>
        <p v-else class="text">Every other key is behind ?. Press it.</p>
      </template>

      <p v-else-if="step === 'look'" class="text">That's the workshop. That's where you're going.</p>

      <template v-else-if="step === 'turn'">
        <p v-if="touch" class="text">Turn the view with the two round arrows, top right.</p>
        <template v-else>
          <p class="text">Turn the view with Q and R.</p>
          <p class="caps"><kbd v-for="c in turnCaps" :key="c.key" :class="{ lit: machine.turned.includes(c.action) }">{{ c.key }}</kbd></p>
        </template>
      </template>

      <p v-else-if="step === 'go'" class="text">{{ touch ? "Walk to the workshop and tap Go in at its door." : "Walk to the workshop and press E at its door." }}</p>

      <template v-else-if="step === 'room'">
        <p class="text">Take your first room.</p>
        <p class="sub">It's your share of this house's server, for one project.</p>
      </template>

      <!-- Putting the sample online: what a project is, then each step as the room goes, then its address. -->
      <template v-else-if="step === 'run'">
        <p v-if="live && machine.roomOpened" class="text">Well done.</p>
        <p v-else-if="live" class="text">
          It's online at <span class="address">{{ room?.url ? bare(room.url) : "its address" }}</span>.
          <a v-if="room?.url" ref="go" class="open" :href="room.url" target="_blank" rel="noopener" @click="emit('opened')" @auxclick="emit('opened')">Open it ›</a>
        </p>
        <p v-else-if="error" class="text">{{ error }}</p>
        <p v-else-if="failed" class="text">It didn't go online.</p>
        <template v-else-if="going">
          <p class="text">{{ going }}</p>
          <p class="sub">{{ explain.online }}</p>
        </template>
        <template v-else>
          <p class="text">A project is an app, with its code in a Git repo.</p>
          <p class="sub">Here's a ready-made one: a small Hello page.</p>
        </template>
      </template>

      <template v-else-if="step === 'github'">
        <p v-if="machine.linked" class="text">{{ machine.linkedBefore ? "Your GitHub is already linked." : "Linked: your repo is in your room." }}</p>
        <template v-else>
          <p class="text">Link one of your repos: it moves into your room.</p>
          <p class="sub">{{ installUrl ? "Each merge goes online; flatmates review pull requests." : "GitHub isn't set up on this server: skip this one." }}</p>
        </template>
      </template>

      <template v-else-if="step === 'done'">
        <p class="text">{{ room ? `That's it: ${room.name} is your room in ${houseName}.` : "That's it." }}</p>
        <p v-if="room" class="sub">Open it any time: update it, give it secrets, read its logs.</p>
      </template>

      <p v-if="error && step !== 'run'" class="sub error" role="alert">{{ error }}</p>
    </div>

    <div class="nav">
      <button v-if="step !== 'done'" type="button" class="link quiet" @click="emit('skip')">Skip the tutorial</button>

      <button v-if="missing && (step === 'room' || step === 'run' || step === 'github')" ref="go" type="button" class="primary go" :disabled="busy" @click="emit('skip')">Leave</button>
      <button v-else-if="step === 'map' && touch" ref="go" type="button" class="primary go" @click="emit('next')">Next</button>
      <button v-else-if="step === 'room'" ref="go" type="button" class="primary go" :disabled="busy" @click="emit('room')">Take a room</button>
      <template v-else-if="step === 'run'">
        <button v-if="live && machine.roomOpened" ref="go" type="button" class="primary go" @click="emit('next')">Next</button>
        <button v-else-if="!live && (error || failed)" ref="go" type="button" class="primary go" :disabled="busy" @click="emit('run')">Try again</button>
        <button v-else-if="!live && !going" ref="go" type="button" class="primary go" :disabled="busy" @click="emit('run')">Put it online</button>
      </template>
      <template v-else-if="step === 'github'">
        <button v-if="machine.linked" ref="go" type="button" class="primary go" @click="emit('next')">Next</button>
        <template v-else-if="installUrl">
          <button type="button" class="link quiet" @click="emit('skipGithub')">Skip for now</button>
          <a ref="go" class="button primary go" :href="installUrl" target="_blank" rel="noopener">Install on GitHub ›</a>
        </template>
        <button v-else ref="go" type="button" class="primary go" @click="emit('skipGithub')">Skip for now</button>
      </template>
      <template v-else-if="step === 'done'">
        <button v-if="room" type="button" class="link quiet" @click="emit('openRoom')">Open my room</button>
        <button ref="go" type="button" class="primary go" :disabled="busy" @click="emit('finish')">Into the city</button>
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
  border-radius: 22px;
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
  animation: coach-pop 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.2);
}
@keyframes coach-pop {
  from { opacity: 0; transform: translateY(10px) scale(0.95); }
}
/* How far along you are: a short track, filled in the accent colour up to here. */
.line { height: 4px; margin-right: 2px; border-radius: 2px; background: var(--fill); overflow: hidden; }
.line span { display: block; height: 100%; border-radius: 2px; background: var(--accent-fill); transition: width 0.3s ease; }
.body { display: grid; gap: 6px; }
.text { margin: 0; font-size: 17px; font-weight: 600; line-height: 1.35; }
.sub { margin: 0; font-size: 15px; line-height: 1.4; color: var(--muted); }
.error { color: var(--danger); }
/* "Open it": a small accent pill inside the sentence, not an underlined link. */
.open { display: inline-flex; align-items: center; margin-left: 4px; padding: 2px 10px; border-radius: 9px; background: var(--accent-soft); color: var(--accent); font-weight: 700; white-space: nowrap; text-decoration: none; }
.open:hover { background: var(--accent-soft); text-decoration: none; box-shadow: inset 0 0 0 2px var(--accent-fill); }
/* The room's address, as people read it, in bold. A long one wraps rather than push the card wider. */
.address { font-weight: 700; overflow-wrap: anywhere; }
/* The keys of the step, as raised caps; a used one fills with the accent. */
.caps { margin: 4px 0 0; display: flex; gap: 6px; }
kbd { display: inline-grid; place-items: center; min-width: 36px; height: 36px; padding: 0 8px; border-radius: 9px; border: 1px solid var(--border); border-bottom-width: 3px; background: var(--surface); color: var(--text); font: 700 14px/1 var(--font); transition: background-color 0.15s, color 0.15s, border-color 0.15s, transform 0.15s; }
kbd.wide { min-width: 72px; }
kbd.lit { background: var(--accent-fill); border-color: var(--accent-fill); color: var(--on-accent); transform: translateY(1px); }
.nav { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.nav:empty { display: none; }
/* The way out sits on the left as a quiet grey button; the step's action on the right, in the accent. */
.nav > .quiet:first-child { margin-right: auto; }
.quiet { min-height: 40px; padding: 0 14px; border-radius: 12px; background: var(--fill); color: var(--muted); font-size: 14px; font-weight: 600; }
.quiet:hover:not(:disabled) { background: var(--fill-hover); color: var(--text); text-decoration: none; }
.go { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 20px; border-radius: 13px; font-size: 16px; font-weight: 700; }
a.go:hover { text-decoration: none; }
:is(.quiet, .go):active:not(:disabled) { transform: scale(0.97); }
button:focus-visible, a:focus-visible { outline: 3px solid var(--accent-fill); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  .coach { animation: none; }
  .line span, kbd { transition: none; }
  kbd.lit { transform: none; }
  :is(.quiet, .go):active:not(:disabled) { transform: none; }
}
@media (max-width: 520px) {
  .coach { padding: 12px 14px; border-radius: 20px; }
  .text { font-size: 15px; }
}
</style>
