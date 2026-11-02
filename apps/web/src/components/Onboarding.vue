<script setup lang="ts">
// The welcome, one idea per step, over the live lobby: what the city is, how the rent works, what a room does, and
// how you get one, with an invitation to log in for a visitor. Picking your look comes first, in CharacterCreation.vue.
// It floats at the bottom like a game's dialogue box: a flat card, a bold line, chunky buttons, one main one.
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { caps } from "../lobby/keys";
import { me } from "../session";
import Icon from "./lobby/house/Icon.vue";
import { welcomeWords as w } from "./words";

const emit = defineEmits<{
  // Whether it got as far as the keys.
  done: [];
}>();

const loggedIn = computed(() => !!me.value);
// A touch screen has no keys to show.
const keyboard = !window.matchMedia("(hover: none)").matches;
const steps = computed(() => ["city", "rent", "push", "knock", ...(keyboard ? ["keys"] : [])]);
const step = ref(0);
const current = computed(() => steps.value[step.value]);
const title = ref<HTMLElement | null>(null);

function go(to: number) {
  step.value = to;
  // Screen readers and keyboards land on the new step's title.
  requestAnimationFrame(() => title.value?.focus());
}

function next() {
  if (step.value === steps.value.length - 1) finish();
  else go(step.value + 1);
}

function finish() {
  emit("done");
}

function key(e: KeyboardEvent) {
  if (e.key === "Escape") finish();
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
          <h2 id="onboarding-title" ref="title" tabindex="-1">{{ w.cityTitle }}</h2>
          <p>{{ w.city }}</p>
        </template>
        <template v-else-if="current === 'rent'">
          <h2 id="onboarding-title" ref="title" tabindex="-1">{{ w.rentTitle }}</h2>
          <p>{{ w.rent }}</p>
        </template>
        <template v-else-if="current === 'push'">
          <h2 id="onboarding-title" ref="title" tabindex="-1">{{ w.pushTitle }}</h2>
          <p>{{ w.push }}</p>
        </template>
        <template v-else-if="current === 'knock'">
          <h2 id="onboarding-title" ref="title" tabindex="-1">{{ w.knockTitle }}</h2>
          <p>{{ w.knockBefore }} <span class="glow free" aria-hidden="true" />{{ w.knockAfter }}</p>
          <RouterLink v-if="!loggedIn" class="button login" to="/login"><Icon name="login" :size="20" />{{ w.logIn }}</RouterLink>
        </template>
        <template v-else-if="current === 'keys'">
          <h2 id="onboarding-title" ref="title" tabindex="-1">{{ w.keysTitle }}</h2>
          <ul class="keys">
            <li><span class="caps"><kbd v-for="k in [caps.w, caps.a, caps.s, caps.d]" :key="k">{{ k }}</kbd></span>{{ w.keysWalk }}</li>
            <li><span class="caps"><kbd>{{ caps.e }}</kbd></span>{{ w.keysUse }}</li>
            <li><span class="caps"><kbd>?</kbd></span>{{ w.keysAll }}</li>
          </ul>
        </template>
      </div>
    </Transition>

    <div class="foot">
      <div class="dots" aria-hidden="true">
        <span v-for="(s, i) in steps" :key="s" :class="{ on: i === step, done: i < step }" />
      </div>
      <button v-if="step > 0" class="second" @click="go(step - 1)">{{ w.back }}</button>
      <button v-else class="second" @click="finish">{{ w.skip }}</button>
      <button class="primary go" @click="next">{{ step === steps.length - 1 ? w.explore : w.next }}</button>
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
  border-radius: var(--r-xl);
  color: var(--text);
  background: var(--surface);
  box-shadow: var(--shadow);
  animation: menu-pop var(--dur-slow) var(--ease-pop);
}
@keyframes menu-pop {
  from { opacity: 0; transform: translateY(12px) scale(0.96); }
}
.body { display: grid; gap: 10px; }
h2 { margin: 0; font-size: 28px; line-height: 1.12; font-weight: 700; outline: none; }
p { margin: 0; font-size: 17px; line-height: 1.5; }
.keys { display: grid; gap: 8px; margin: 2px 0 0; padding: 0; list-style: none; font-size: 17px; font-weight: 600; }
.keys li { display: flex; align-items: center; gap: 12px; }
.caps { display: flex; gap: 4px; }
/* A free room's window, in the colour the city draws it (the same in day and night). */
.glow { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin: 0 5px 1px 2px; vertical-align: middle; }
.glow.free { background: var(--free); box-shadow: 0 0 10px var(--free); }
/* Logging in sits in the sentence's step as a soft accent button: "Start exploring" stays the one main action. */
.login { justify-self: start; gap: 8px; min-height: 50px; border-radius: var(--r-md); font-weight: 700; background: var(--accent-soft); color: var(--accent); }
.login:hover { background: var(--accent-soft); text-decoration: none; box-shadow: inset 0 0 0 2px var(--accent-fill); }
.foot { display: flex; align-items: center; gap: 10px; margin-top: 18px; }
/* How far along: dots, the current one a longer pill, as in every step flow. */
.dots { display: flex; gap: 6px; margin-right: auto; }
.dots span { width: 8px; height: 8px; border-radius: 4px; background: var(--border); transition: background-color 0.2s, width 0.2s; }
.dots span.done { background: var(--muted); }
.dots span.on { width: 22px; background: var(--accent-fill); }
/* Chunky buttons, as in a game's menu. */
.foot button { min-height: 50px; padding: 0 20px; border-radius: var(--r-md); font-size: 17px; font-weight: 600; white-space: nowrap; }
.foot .go { min-width: 120px; font-weight: 700; }
button:focus-visible, .login:focus-visible { outline: 3px solid var(--ring); outline-offset: 2px; }
.step-enter-active, .step-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.step-enter-from { opacity: 0; transform: translateY(6px); }
.step-leave-to { opacity: 0; transform: translateY(-6px); }
@media (prefers-reduced-motion: reduce) {
  .welcome-card { animation: none; }
  .step-enter-active, .step-leave-active, .dots span { transition: none; }
  .turn:active:not(:disabled) { transform: none; }
}
@media (max-width: 520px) {
  .welcome-card { padding: 20px 18px 14px; border-radius: var(--r-xl); }
  h2 { font-size: 24px; }
  p { font-size: 16px; }
  .foot button { padding: 0 16px; }
}
/* The sign's red line inside the edge, on the flat card. */
.welcome-card { border-radius: var(--r-md); box-shadow: inset 0 0 0 3px var(--panel-red), var(--shadow); }
</style>
