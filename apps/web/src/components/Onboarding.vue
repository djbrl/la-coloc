<script setup lang="ts">
// The welcome, one idea per step, over the live lobby. Ends with picking your look (or an invitation to log in).
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { CHARACTERS } from "../lobby/assets";
import { me, sendJSON } from "../session";

const emit = defineEmits<{
  // Zoom on your character while you pick a look.
  focus: [on: boolean];
  // Preview a look in the lobby.
  character: [name: string];
  done: [];
}>();

const loggedIn = computed(() => !!me.value);
const steps = computed(() => (loggedIn.value ? ["welcome", "windows", "walk", "look", "lamps"] : ["welcome", "windows", "walk", "join", "lamps"]));
const step = ref(0);
const current = computed(() => steps.value[step.value]);
const look = ref(Math.max(0, CHARACTERS.indexOf(me.value?.avatar ?? "")));
const error = ref("");
const title = ref<HTMLElement | null>(null);

function go(to: number) {
  error.value = "";
  step.value = to;
  emit("focus", steps.value[to] === "look");
  if (steps.value[to] === "look") emit("character", CHARACTERS[look.value]);
  // Screen readers and keyboards land on the new step's title.
  requestAnimationFrame(() => title.value?.focus());
}

function turn(by: number) {
  look.value = (look.value + by + CHARACTERS.length) % CHARACTERS.length;
  emit("character", CHARACTERS[look.value]);
}

async function next() {
  if (current.value === "look") {
    const res = await sendJSON("PATCH", "/api/me", { avatar: CHARACTERS[look.value] });
    if (!res.ok) {
      error.value = res.message;
      return;
    }
    if (me.value) me.value.avatar = CHARACTERS[look.value];
  }
  if (step.value === steps.value.length - 1) finish();
  else go(step.value + 1);
}

function finish() {
  emit("focus", false);
  emit("done");
}

function key(e: KeyboardEvent) {
  if (e.key === "Escape") finish();
  if (current.value === "look" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
    e.preventDefault();
    e.stopPropagation();
    turn(e.key === "ArrowLeft" ? -1 : 1);
  }
}

onMounted(() => {
  window.addEventListener("keydown", key, true);
  requestAnimationFrame(() => title.value?.focus());
});
onBeforeUnmount(() => window.removeEventListener("keydown", key, true));
</script>

<template>
  <div class="sheet" role="dialog" aria-modal="false" aria-labelledby="onboarding-title">
    <Transition name="step" mode="out-in">
      <div :key="current" class="body">
        <template v-if="current === 'welcome'">
          <h2 id="onboarding-title" ref="title" tabindex="-1">Welcome to the city.</h2>
          <p>Every house is a server shared by a few developers. Every window is someone's room, with their project running in it.</p>
        </template>
        <template v-else-if="current === 'windows'">
          <h2 id="onboarding-title" ref="title" tabindex="-1">Read a house from the street.</h2>
          <p>
            By each door, a <span class="glow lit" aria-hidden="true" />warm light is a room someone lives in, a <span class="glow free" aria-hidden="true" />blue one is free, and
            <span class="glow making" aria-hidden="true" />amber means the house is still finding its flatmates.
          </p>
        </template>
        <template v-else-if="current === 'walk'">
          <h2 id="onboarding-title" ref="title" tabindex="-1">Walk around.</h2>
          <p>Use <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or click where you want to go. Step up to a door and press <kbd>E</kbd> to go in. <kbd>1</kbd> and <kbd>2</kbd> wave yes or no.</p>
        </template>
        <template v-else-if="current === 'look'">
          <h2 id="onboarding-title" ref="title" tabindex="-1">Pick your look.</h2>
          <p>Everyone in the city sees you this way. You can change it later in settings.</p>
          <div class="picker">
            <button class="round" aria-label="Previous look" @click="turn(-1)">‹</button>
            <span class="count" aria-live="polite">{{ look + 1 }} of {{ CHARACTERS.length }}</span>
            <button class="round" aria-label="Next look" @click="turn(1)">›</button>
          </div>
        </template>
        <template v-else-if="current === 'join'">
          <h2 id="onboarding-title" ref="title" tabindex="-1">Move in.</h2>
          <p>Log in with GitHub to get your own character, knock on free rooms, and talk with the houses.</p>
          <RouterLink class="text-link" to="/login">Log in ›</RouterLink>
        </template>
        <template v-else>
          <h2 id="onboarding-title" ref="title" tabindex="-1">One more thing.</h2>
          <p>Some street lamps in town are off. Walk up to one and press <kbd>E</kbd>. See if you can light them all.</p>
        </template>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
      </div>
    </Transition>

    <div class="foot">
      <div class="dots" aria-hidden="true">
        <span v-for="(s, i) in steps" :key="s" :class="{ on: i === step }" />
      </div>
      <button v-if="step > 0" class="quiet" @click="go(step - 1)">Back</button>
      <button v-else class="quiet" @click="finish">Skip</button>
      <button class="pill" @click="next">{{ step === steps.length - 1 ? "Start exploring" : current === "look" ? "This is me" : "Next" }}</button>
    </div>
  </div>
</template>

<style scoped>
.sheet { position: absolute; left: 50%; bottom: max(24px, env(safe-area-inset-bottom)); transform: translateX(-50%); z-index: 20; width: min(560px, calc(100vw - 32px)); padding: 28px 28px 20px; border-radius: 28px; color: #f5f5f7; background: rgba(28, 24, 44, 0.72); backdrop-filter: saturate(180%) blur(24px); -webkit-backdrop-filter: saturate(180%) blur(24px); box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35); }
.body { display: grid; gap: 10px; }
h2 { margin: 0; font-size: 30px; line-height: 1.12; font-weight: 600; letter-spacing: -0.02em; color: #fff; outline: none; }
p { margin: 0; font-size: 17px; line-height: 1.5; color: rgba(245, 245, 247, 0.82); }
.glow { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin: 0 5px 1px 2px; vertical-align: middle; }
.glow.lit { background: #ffc96b; box-shadow: 0 0 10px #ffc96b; }
.glow.free { background: #6f9cff; box-shadow: 0 0 10px #6f9cff; }
.glow.making { background: #e0a640; box-shadow: 0 0 10px #e0a640; }
kbd { font: 600 12px/1 -apple-system, BlinkMacSystemFont, sans-serif; padding: 4px 6px; margin: 0 2px; border-radius: 6px; background: rgba(255, 255, 255, 0.14); border: 1px solid rgba(255, 255, 255, 0.18); color: #fff; }
.picker { display: flex; align-items: center; gap: 18px; margin-top: 6px; }
.round { width: 44px; height: 44px; border-radius: 50%; border: 0; background: rgba(255, 255, 255, 0.14); color: #fff; font-size: 24px; line-height: 1; cursor: pointer; }
.round:hover { background: rgba(255, 255, 255, 0.22); }
.count { font-size: 15px; color: rgba(245, 245, 247, 0.7); min-width: 64px; text-align: center; }
.text-link { color: #6eb4ff; font-size: 17px; text-decoration: none; }
.error { color: #ff8a80; font-size: 15px; }
.foot { display: flex; align-items: center; gap: 12px; margin-top: 22px; }
.dots { display: flex; gap: 6px; margin-right: auto; }
.dots span { width: 7px; height: 7px; border-radius: 50%; background: rgba(255, 255, 255, 0.25); transition: background 0.2s; }
.dots span.on { background: #fff; }
.quiet { border: 0; background: none; color: rgba(245, 245, 247, 0.75); font-size: 17px; padding: 10px 6px; cursor: pointer; }
.pill { border: 0; border-radius: 980px; padding: 12px 22px; min-height: 44px; font-size: 17px; font-weight: 500; background: #fff; color: #1d1d1f; cursor: pointer; }
/* Our own hovers: the site's button styles are for light pages, not this dark glass. */
.pill:hover:not(:disabled) { background: #e8e8ed; }
.quiet:hover:not(:disabled) { background: none; color: #fff; }
.round:hover:not(:disabled) { background: rgba(255, 255, 255, 0.22); }
.round { min-height: 44px; padding: 0; }
button:focus-visible, .text-link:focus-visible { outline: 3px solid #6eb4ff; outline-offset: 2px; }
.step-enter-active, .step-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.step-enter-from { opacity: 0; transform: translateY(6px); }
.step-leave-to { opacity: 0; transform: translateY(-6px); }
@media (prefers-reduced-motion: reduce) {
  .step-enter-active, .step-leave-active { transition: none; }
}
@media (max-width: 520px) {
  .sheet { padding: 22px 20px 16px; border-radius: 24px; }
  h2 { font-size: 26px; }
  p { font-size: 16px; }
}
</style>
