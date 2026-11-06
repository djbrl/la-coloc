<script setup lang="ts">
// The quest's two cards at either end, centred on an otherwise empty screen, in carte blanche: the first says what the
// next five minutes give you, as three nouns on three tiles (or, for someone coming back, where they were, with
// "Continue"), since the door (CreationDoor.vue) has already said what La Coloc is; the last, once the real city is
// built around you, is the only one to say welcome to it. Each has one main action and nothing else: the quest has
// no "Not now" any more, its one way out is the corner button (SkipTutorial.vue), there at every step (Jib, 6 11).
// No drawing either: a solid card rather than an illustration.
import { onMounted, ref } from "vue";
import Icon from "../house/Icon.vue";
import type { IconName } from "../house/icons";
import { tutorialWords as w } from "./words";

const props = defineProps<{
  step: "welcome" | "city";
  busy: boolean;
  error?: string;
  // Coming back: the chapter you'd reached (its number and name), to continue from there.
  resume?: { n: number; name: string } | null;
}>();
const emit = defineEmits<{ start: []; resume: []; end: [] }>();

// The three tiles' icons, in the order of `w.youGet`: a room, a project, an address.
const GET_ICONS: IconName[] = ["key", "box", "globe"];

// The keyboard lands on the main action, a moment after the card appears.
const go = ref<HTMLButtonElement | null>(null);
onMounted(() => setTimeout(() => go.value?.focus({ preventScroll: true }), 0));

// Enter and Space press the focused button; they must not reach the engine, where Enter means "use what's in reach".
function onKey(e: KeyboardEvent) {
  if (e.key === "Enter" || e.key === " ") e.stopPropagation();
}
</script>

<template>
  <div class="layer">
    <section class="card sign" role="dialog" aria-modal="true" aria-labelledby="tutorial-welcome-title" @keydown="onKey">
      <div class="sign-frame">
        <header class="sign-band">
          <span class="chip"><Icon :name="props.step === 'city' ? 'globe' : 'house'" :size="22" /></span>
          <h2 v-if="props.step === 'city'" id="tutorial-welcome-title">{{ w.city }}</h2>
          <h2 v-else-if="resume" id="tutorial-welcome-title"><span class="sr-only">{{ w.quest }}. </span>{{ w.welcomeBack }}</h2>
          <h2 v-else id="tutorial-welcome-title">{{ w.quest }}</h2>
          <p class="sign-sub lines">{{ props.step === "city" ? w.cityPitch : resume ? w.resumeAt(resume.n, resume.name) : w.promise }}</p>
        </header>
        <div class="sign-body body">
          <ul v-if="props.step === 'welcome' && !resume" class="get">
            <li v-for="(thing, i) in w.youGet" :key="thing"><Icon :name="GET_ICONS[i]" :size="22" />{{ thing }}</li>
          </ul>
          <p v-if="error" class="error" role="alert">{{ error }}</p>
          <div class="nav">
            <button v-if="props.step === 'welcome' && resume" type="button" class="second" :disabled="busy" @click="emit('start')">{{ w.fromStart }}</button>
            <button v-if="props.step === 'city'" ref="go" type="button" class="primary go" @click="emit('end')">{{ w.letsGo }}<kbd aria-hidden="true">↵</kbd></button>
            <button v-else-if="resume" ref="go" type="button" class="primary go" :disabled="busy" @click="emit('resume')">{{ w.continue }}<kbd aria-hidden="true">↵</kbd></button>
            <button v-else ref="go" type="button" class="primary go" :disabled="busy" @click="emit('start')">{{ w.start }}<kbd aria-hidden="true">↵</kbd></button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* The card sits in the middle of the screen. The layer around it catches clicks, so nothing in the city is picked while you read. */
.layer { position: absolute; inset: 0; z-index: 30; display: grid; place-items: center; padding: 16px; }
.card { width: min(460px, 100%); animation: menu-pop var(--dur-slow) var(--ease-pop); }
@keyframes menu-pop {
  from { opacity: 0; transform: translateY(12px) scale(0.95); }
}
/* The line under the title may take two lines here: it's the card's one sentence. */
.sign-sub.lines { white-space: normal; }
.body { display: grid; gap: 16px; }
/* What you'll have: three nouns on three soft tiles, an icon over each. Not buttons, so nothing about them invites a click. */
.get { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.get li { min-width: 0; display: grid; justify-items: center; gap: 8px; padding: 14px 8px; border-radius: var(--tile-r); background: var(--tile); color: var(--text); font-size: 14px; font-weight: 800; line-height: 18px; text-align: center; }
.get li svg { color: var(--accent); }
.error { color: var(--danger); font-size: 15px; }
.nav { display: flex; gap: 10px; }
.nav > button { flex: 1 1 0; min-width: 0; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
.nav > .go { flex-grow: 2; }
@media (prefers-reduced-motion: reduce) {
  .card { animation: none; }
}
</style>
