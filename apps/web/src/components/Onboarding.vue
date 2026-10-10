<script setup lang="ts">
// The welcome, one idea per step, over the live lobby: what the city is, how the rent works, what a room does, and
// how you get one. Ends with picking your look (or, for a visitor, an invitation to log in on the last step).
// It floats at the bottom like a game's dialogue box: a flat card, a bold line, chunky buttons, one main one.
// How to walk comes after, as a one-time tip over the city (lobby/tutorial/tips.ts).
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { CHARACTERS } from "../lobby/assets";
import { me, sendJSON } from "../session";
import Icon from "./lobby/house/Icon.vue";

const emit = defineEmits<{
  // Zoom on your character while you pick a look.
  focus: [on: boolean];
  // Preview a look in the lobby.
  character: [name: string];
  done: [];
}>();

const loggedIn = computed(() => !!me.value);
const steps = computed(() => (loggedIn.value ? ["city", "rent", "push", "knock", "look"] : ["city", "rent", "push", "knock"]));
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
  <div class="welcome-card" role="dialog" aria-modal="false" aria-labelledby="onboarding-title">
    <Transition name="step" mode="out-in">
      <div :key="current" class="body">
        <template v-if="current === 'city'">
          <h2 id="onboarding-title" ref="title" tabindex="-1">A city of dev houses, from Dakar to Kigali.</h2>
          <p>Each house is a server shared by a few developers. Every lit window is someone's project.</p>
        </template>
        <template v-else-if="current === 'rent'">
          <h2 id="onboarding-title" ref="title" tabindex="-1">Rent a server together.</h2>
          <p>Flatmates split the bill, and pay part of it in code reviews. Review a housemate's pull request, pay a little less.</p>
        </template>
        <template v-else-if="current === 'push'">
          <h2 id="onboarding-title" ref="title" tabindex="-1">Push, and it's online.</h2>
          <p>Your room runs your project. Merge a pull request and it goes live at its own address, in your room.</p>
        </template>
        <template v-else-if="current === 'knock'">
          <h2 id="onboarding-title" ref="title" tabindex="-1">Knock on a free room.</h2>
          <p>A <span class="glow free" aria-hidden="true" />blue window is free. Knock, say what you build, and the house votes.</p>
          <RouterLink v-if="!loggedIn" class="button login" to="/login"><Icon name="login" :size="20" />Log in with GitHub</RouterLink>
        </template>
        <template v-else-if="current === 'look'">
          <h2 id="onboarding-title" ref="title" tabindex="-1">Pick your look.</h2>
          <p>Everyone in the city sees you this way. You can change it later in settings.</p>
          <!-- Like a game's character select: arrows either side of the count (the arrow keys work too). -->
          <div class="picker">
            <button class="turn" aria-label="Previous look" @click="turn(-1)">
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </button>
            <span class="count" aria-live="polite">{{ look + 1 }} of {{ CHARACTERS.length }}</span>
            <button class="turn" aria-label="Next look" @click="turn(1)">
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </button>
          </div>
        </template>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
      </div>
    </Transition>

    <div class="foot">
      <div class="dots" aria-hidden="true">
        <span v-for="(s, i) in steps" :key="s" :class="{ on: i === step, done: i < step }" />
      </div>
      <button v-if="step > 0" class="second" @click="go(step - 1)">Back</button>
      <button v-else class="second" @click="finish">Skip</button>
      <button class="primary go" @click="next">{{ step === steps.length - 1 ? "Start exploring" : current === "look" ? "This is me" : "Next" }}</button>
    </div>
  </div>
</template>

<style scoped>
/* A flat card on the site's surface, lifted by a shadow: no glass, no blur. It pops up from the bottom. Its own
   class name: the lobby's scoped `.sheet` (its find and travel menus) would also reach this root and stretch it. */
.welcome-card {
  position: absolute;
  left: 50%;
  bottom: max(24px, env(safe-area-inset-bottom));
  translate: -50% 0;
  z-index: 20;
  width: min(560px, calc(100vw - 32px));
  padding: 24px 24px 18px;
  border-radius: 28px;
  color: var(--text);
  background: var(--surface);
  box-shadow: var(--shadow);
  animation: menu-pop 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.2);
}
@keyframes menu-pop {
  from { opacity: 0; transform: translateY(12px) scale(0.96); }
}
.body { display: grid; gap: 10px; }
h2 { margin: 0; font-size: 28px; line-height: 1.12; font-weight: 700; letter-spacing: -0.02em; outline: none; }
p { margin: 0; font-size: 17px; line-height: 1.5; }
/* A free room's window, in the colour the city draws it (the same in day and night). */
.glow { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin: 0 5px 1px 2px; vertical-align: middle; }
.glow.free { background: #6f9cff; box-shadow: 0 0 10px #6f9cff; }
.picker { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 4px; padding: 6px; border-radius: 18px; background: var(--tile); }
.turn { width: 52px; height: 52px; min-height: 0; padding: 0; display: grid; place-items: center; border-radius: 14px; background: var(--surface); color: var(--text); box-shadow: var(--lift); }
.turn:hover:not(:disabled) { background: var(--surface); color: var(--accent); }
.turn:active:not(:disabled) { transform: scale(0.94); }
.count { flex: 1; font-size: 17px; font-weight: 700; text-align: center; font-variant-numeric: tabular-nums; }
/* Logging in sits in the sentence's step as a soft accent button: "Start exploring" stays the one main action. */
.login { justify-self: start; gap: 8px; min-height: 50px; border-radius: 14px; font-weight: 700; background: var(--accent-soft); color: var(--accent); }
.login:hover { background: var(--accent-soft); text-decoration: none; box-shadow: inset 0 0 0 2px var(--accent-fill); }
.error { color: var(--danger); font-size: 15px; }
.foot { display: flex; align-items: center; gap: 10px; margin-top: 18px; }
/* How far along: dots, the current one a longer pill, as in every step flow. */
.dots { display: flex; gap: 6px; margin-right: auto; }
.dots span { width: 8px; height: 8px; border-radius: 4px; background: var(--border); transition: background-color 0.2s, width 0.2s; }
.dots span.done { background: var(--muted); }
.dots span.on { width: 22px; background: var(--accent-fill); }
/* Chunky buttons, as in a game's menu. */
.foot button { min-height: 50px; padding: 0 20px; border-radius: 14px; font-size: 17px; font-weight: 600; white-space: nowrap; }
.foot .go { min-width: 120px; font-weight: 700; }
.foot button:active:not(:disabled) { transform: scale(0.97); }
button:focus-visible, .login:focus-visible { outline: 3px solid var(--accent-fill); outline-offset: 2px; }
.step-enter-active, .step-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.step-enter-from { opacity: 0; transform: translateY(6px); }
.step-leave-to { opacity: 0; transform: translateY(-6px); }
@media (prefers-reduced-motion: reduce) {
  .welcome-card { animation: none; }
  .step-enter-active, .step-leave-active, .dots span { transition: none; }
  .turn:active:not(:disabled), .foot button:active:not(:disabled) { transform: none; }
}
@media (max-width: 520px) {
  .welcome-card { padding: 20px 18px 14px; border-radius: 24px; }
  h2 { font-size: 24px; }
  p { font-size: 16px; }
  .foot button { padding: 0 16px; }
}
</style>
