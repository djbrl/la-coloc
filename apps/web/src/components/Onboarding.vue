<script setup lang="ts">
// The welcome, one idea per step, over the live lobby: what the city is, how the rent works, what a room does, and
// how you get one, with an invitation to log in for a visitor. Picking your look comes first, in CharacterCreation.vue.
// It floats at the bottom like the tutorial's cards, in carte blanche: an icon on its soft red tile, a title, one line,
// and at the foot the dots, Back (or Skip on the first step) and the one red Next, which Enter presses.
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { caps } from "../lobby/keys";
import { me } from "../session";
import Icon from "./lobby/house/Icon.vue";
import type { IconName } from "./lobby/house/icons";
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

// Each step's icon, on the head's tile.
const ICON: Record<string, IconName> = { city: "house", rent: "coin", push: "rocket", knock: "knock", keys: "keyboard" };

// Escape leaves; Enter moves on, unless the focus is on another button or a link, which Enter presses as usual.
function key(e: KeyboardEvent) {
  if (e.key === "Escape") finish();
  if (e.key !== "Enter" || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const el = e.target as HTMLElement | null;
  if (el?.closest?.("button, a, input, textarea")) return;
  e.preventDefault();
  e.stopPropagation();
  next();
}

onMounted(() => {
  window.addEventListener("keydown", key, true);
  requestAnimationFrame(() => title.value?.focus());
});
onBeforeUnmount(() => window.removeEventListener("keydown", key, true));
</script>

<template>
  <div class="welcome-card sign" role="dialog" aria-modal="false" aria-labelledby="onboarding-title">
    <div class="sign-frame">
      <Transition name="step" mode="out-in">
        <header :key="current" class="sign-band">
          <span class="chip"><Icon :name="ICON[current]" :size="22" /></span>
          <template v-if="current === 'city'">
            <h2 id="onboarding-title" ref="title" tabindex="-1">{{ w.cityTitle }}</h2>
            <p class="sign-sub lines">{{ w.city }}</p>
          </template>
          <template v-else-if="current === 'rent'">
            <h2 id="onboarding-title" ref="title" tabindex="-1">{{ w.rentTitle }}</h2>
            <p class="sign-sub lines">{{ w.rent }}</p>
          </template>
          <template v-else-if="current === 'push'">
            <h2 id="onboarding-title" ref="title" tabindex="-1">{{ w.pushTitle }}</h2>
            <p class="sign-sub lines">{{ w.push }}</p>
          </template>
          <template v-else-if="current === 'knock'">
            <h2 id="onboarding-title" ref="title" tabindex="-1">{{ w.knockTitle }}</h2>
            <p class="sign-sub lines">{{ w.knockBefore }} <span class="glow free" aria-hidden="true" />{{ w.knockAfter }}</p>
          </template>
          <template v-else-if="current === 'keys'">
            <h2 id="onboarding-title" ref="title" tabindex="-1">{{ w.keysTitle }}</h2>
          </template>
        </header>
      </Transition>

      <div class="sign-body body">
        <RouterLink v-if="current === 'knock' && !loggedIn" class="button login" to="/login"><Icon name="login" :size="20" />{{ w.logIn }}</RouterLink>
        <ul v-if="current === 'keys'" class="keys">
          <li><span class="caps"><kbd v-for="k in [caps.w, caps.a, caps.s, caps.d]" :key="k">{{ k }}</kbd></span>{{ w.keysWalk }}</li>
          <li><span class="caps"><kbd>{{ caps.e }}</kbd></span>{{ w.keysUse }}</li>
          <li><span class="caps"><kbd>?</kbd></span>{{ w.keysAll }}</li>
        </ul>
        <div class="foot">
          <span class="dots" aria-hidden="true"><i v-for="(s, i) in steps" :key="s" :class="{ on: i === step }" /></span>
          <button v-if="step > 0" class="second" @click="go(step - 1)">{{ w.back }}</button>
          <button v-else class="second" @click="finish">{{ w.skip }}</button>
          <button class="primary go" @click="next">{{ step === steps.length - 1 ? w.explore : w.next }}<kbd v-if="keyboard" aria-hidden="true">↵</kbd></button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Bottom centre, popping up, over the city (its own class name: the lobby's scoped `.sheet` would also reach it). */
.welcome-card { position: absolute; left: 50%; bottom: max(24px, env(safe-area-inset-bottom)); translate: -50% 0; z-index: 20; width: min(480px, calc(100vw - 32px)); animation: menu-pop var(--dur-slow) var(--ease-pop); }
@keyframes menu-pop {
  from { opacity: 0; transform: translateY(12px) scale(0.96); }
}
h2 { outline: none; }
.sign-sub.lines { white-space: normal; }
.body { display: grid; gap: 14px; }
/* The keys: soft tile rows, the caps then what they do. */
.keys { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.keys li { display: flex; align-items: center; gap: 12px; min-height: 48px; padding: 0 14px; border-radius: var(--tile-r); background: var(--tile); font-size: 15px; font-weight: 800; }
.caps { display: flex; gap: 4px; }
.caps kbd { min-width: 28px; height: 28px; background: var(--surface); }
/* A free room's window, in the colour the city draws it. */
.glow { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin: 0 5px 1px 2px; vertical-align: middle; }
.glow.free { background: var(--free); box-shadow: 0 0 8px var(--free); }
/* Logging in: a grey key in the step; Next stays the one red one. */
.login { justify-self: start; display: inline-flex; align-items: center; gap: 8px; }
.foot { display: flex; align-items: center; gap: 10px; }
.dots { display: flex; gap: 6px; margin-right: auto; }
.dots i { width: 8px; height: 8px; border-radius: 4px; background: var(--line); }
.dots i.on { width: 18px; background: var(--text); }
.foot .go { min-width: 140px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
.step-enter-active, .step-leave-active { transition: opacity 0.18s ease; }
.step-enter-from, .step-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .welcome-card { animation: none; }
  .step-enter-active, .step-leave-active { transition: none; }
}
</style>
