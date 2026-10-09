<script setup lang="ts">
// The coach: one flat tooltip at the bottom centre of the lobby during the tutorial. A thin line for how far
// along you are, one or two sentences for the step you're on, at most one main action, and a quiet way out. The
// steps themselves live in tutorial.ts; this only shows them. The welcome cards at either end are Welcome.vue.
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { type Action, isLive, type TutorialMachine } from "./tutorial";

const props = defineProps<{
  machine: TutorialMachine;
  // The server doesn't have the tutorial yet (404).
  missing: boolean;
  busy: boolean;
  error: string;
  // "Run it" was pressed: the sentence follows the room's status.
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

// The room, and its status in the words of the step that runs it.
const room = computed(() => props.machine.state?.room ?? null);
const houseName = computed(() => props.machine.state?.house.name ?? "L'Atelier");
const live = computed(() => isLive(props.machine.state));
const failed = computed(() => room.value?.status === "failed" || room.value?.status === "down");
const running = computed(() => {
  const s = room.value?.status ?? "";
  if (s === "starting") return "Starting…";
  if (s === "deploying" || s === "building" || (props.ran && s === "empty")) return "Building…";
  return "";
});
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

      <p v-else-if="step === 'room'" class="text">Take your first room.</p>

      <template v-else-if="step === 'run'">
        <p v-if="live && machine.roomOpened" class="text">Well done.</p>
        <p v-else-if="live" class="text">
          It's live. Open it to see it. <a v-if="room?.url" ref="go" class="open" :href="room.url" target="_blank" rel="noopener" @click="emit('opened')" @auxclick="emit('opened')">Open it ›</a>
        </p>
        <p v-else-if="error" class="text">{{ error }}</p>
        <p v-else-if="failed" class="text">It didn't start.</p>
        <p v-else-if="running" class="text">{{ running }}</p>
        <p v-else class="text">Run the sample project.</p>
      </template>

      <template v-else-if="step === 'github'">
        <p v-if="machine.linked" class="text">{{ machine.linkedBefore ? "Your GitHub is already linked." : "Well done." }}</p>
        <template v-else>
          <p class="text">Link your GitHub: install the app on a repo, and the house reviews your pull requests.</p>
          <p v-if="!installUrl" class="sub">GitHub isn't set up on this server, so this one waits.</p>
        </template>
      </template>

      <template v-else-if="step === 'done'">
        <p class="text">That's it.</p>
        <p v-if="room" class="sub">Your room is {{ room.name }} in {{ houseName }}: a slice of the workshop's server, with its own memory and CPU.</p>
        <p class="sub">Open it any time to deploy another repo, set secrets, read logs or restart it. Once a repo is linked, every push goes live.</p>
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
        <button v-else-if="!live && !running" ref="go" type="button" class="primary go" :disabled="busy" @click="emit('run')">Run it</button>
      </template>
      <template v-else-if="step === 'github'">
        <button v-if="machine.linked" ref="go" type="button" class="primary go" @click="emit('next')">Next</button>
        <template v-else-if="installUrl">
          <button type="button" class="link quiet" @click="emit('skipGithub')">Skip for now</button>
          <a ref="go" class="button primary go" :href="installUrl" target="_blank" rel="noopener">Install the app ›</a>
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
/* A flat piece of the site's surface, lifted by a shadow: no glass, no blur. */
.coach {
  width: min(460px, calc(100vw - 32px));
  display: grid;
  gap: 10px;
  padding: 14px 18px 12px;
  border-radius: 20px;
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
}
/* How far along you are: a thin line, filled in the accent colour up to here. */
.line { height: 3px; border-radius: 2px; background: var(--hairline); overflow: hidden; }
.line span { display: block; height: 100%; border-radius: 2px; background: var(--accent-fill); transition: width 0.3s ease; }
.body { display: grid; gap: 6px; }
.text { margin: 0; font-size: 17px; line-height: 1.4; }
.sub { margin: 0; font-size: 15px; line-height: 1.4; color: var(--muted); }
.error { color: var(--danger); }
.open { color: var(--accent); text-decoration: none; white-space: nowrap; }
.open:hover { text-decoration: underline; }
/* The keys of the step, as flat caps; a used one fills with the accent. */
.caps { margin: 2px 0 0; display: flex; gap: 6px; }
kbd { font: 600 13px/1 var(--font); min-width: 30px; padding: 8px 6px; text-align: center; border-radius: 7px; border: 1px solid var(--hairline); background: var(--surface); color: var(--text); box-shadow: var(--lift); transition: background 0.15s, color 0.15s, border-color 0.15s; }
kbd.wide { min-width: 64px; }
kbd.lit { background: var(--accent-fill); border-color: var(--accent-fill); color: var(--on-accent); }
.nav { display: flex; align-items: center; justify-content: flex-end; gap: 14px; }
.nav:empty { display: none; }
/* The way out sits on the left, in the muted colour; the step's action on the right. */
.nav > .quiet:first-child { margin-right: auto; }
.quiet { min-height: 36px; font-size: 14px; color: var(--muted); }
.go { min-height: 40px; padding: 0 18px; font-size: 15px; }
button:focus-visible, a:focus-visible { outline: 3px solid var(--accent-fill); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  .line span, kbd { transition: none; }
}
@media (max-width: 520px) {
  .coach { padding: 12px 16px 10px; border-radius: 18px; }
  .text { font-size: 15px; }
}
</style>
