<script setup lang="ts">
// Settings, as a sheet that slides in: how the city shows, how it looks, how it moves, and two ways to start
// over (the tutorial, and, when this server allows it, the whole demo). Each control reads as a sentence, so
// nothing needs a label.
import { nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { config, loadConfig, loadMe, me, postJSON } from "../session";
import { settings, settingsPane } from "../settings";

const route = useRoute();
const router = useRouter();
const panel = ref<HTMLElement | null>(null);
let opener: Element | null = null;
// "Reset the demo city" asks once more inline; this is whether it's asking.
const confirming = ref(false);

// "Looks like: the system / day / night": the site's light or dark look, or the system's choice.
const themes: { value: typeof settings.theme; word: string }[] = [
  { value: "system", word: "the system" },
  { value: "light", word: "day" },
  { value: "dark", word: "night" },
];

watch(
  () => settingsPane.open,
  async (open) => {
    if (open) {
      opener = document.activeElement;
      // What this server allows is asked once, the first time the pane opens.
      if (!config.value) void loadConfig();
      await nextTick();
      panel.value?.focus();
      window.addEventListener("keydown", onKey);
    } else {
      window.removeEventListener("keydown", onKey);
      confirming.value = false;
      (opener as HTMLElement | null)?.focus?.();
    }
  },
);
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") close();
}

function close() {
  settingsPane.open = false;
}

function goHome() {
  if (route.path !== "/") router.push("/");
}

function replayWelcome() {
  settings.welcomed = false;
  close();
  goHome();
}

// ---- The tutorial again ----

// The server forgets your tutorial room and your "done" mark, your profile is read again, and the lobby is told
// to start the tutorial (it watches `tutorialRequested`).
const tutorialBusy = ref(false);
const tutorialError = ref("");
async function takeTutorialAgain() {
  tutorialBusy.value = true;
  tutorialError.value = "";
  const res = await postJSON("/api/tutorial/reset", {});
  tutorialBusy.value = false;
  if (!res.ok) {
    tutorialError.value = res.message;
    return;
  }
  await loadMe();
  settingsPane.tutorialRequested = Date.now();
  close();
  goHome();
}

// ---- Reset the demo ----

// After the inline question: the server resets the demo city, this browser forgets its settings, lamps and tours,
// and the page reloads from the start.
const resetBusy = ref(false);
const resetError = ref("");
async function resetDemo() {
  resetBusy.value = true;
  resetError.value = "";
  const res = await postJSON("/api/demo/reset", {});
  if (!res.ok) {
    resetBusy.value = false;
    resetError.value = res.message;
    return;
  }
  try {
    for (const key of ["coloc.settings", "coloc.lamps", "coloc.tours"]) localStorage.removeItem(key);
  } catch {
    // No storage to clear: the reload is a fresh start all the same.
  }
  location.reload();
}
</script>

<template>
  <Transition name="fade">
    <div v-if="settingsPane.open" class="scrim" @click="close" />
  </Transition>
  <Transition name="slide">
    <aside v-if="settingsPane.open" ref="panel" class="pane" role="dialog" aria-modal="true" aria-labelledby="settings-title" tabindex="-1">
      <div class="top">
        <h2 id="settings-title">Settings</h2>
        <button class="close" aria-label="Close settings" @click="close">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
        </button>
      </div>

      <section>
        <p class="lead">Show the city as</p>
        <div class="segmented" role="radiogroup" aria-label="Show the city as">
          <button role="radio" :aria-checked="settings.view === 'lobby'" :class="{ on: settings.view === 'lobby' }" @click="settings.view = 'lobby'">a place to walk</button>
          <button role="radio" :aria-checked="settings.view === 'list'" :class="{ on: settings.view === 'list' }" @click="settings.view = 'list'">a list</button>
        </div>
      </section>

      <section>
        <p class="lead">Looks like</p>
        <div class="segmented" role="radiogroup" aria-label="Looks like">
          <button v-for="t in themes" :key="t.value" role="radio" :aria-checked="settings.theme === t.value" :class="{ on: settings.theme === t.value }" @click="settings.theme = t.value">{{ t.word }}</button>
        </div>
      </section>

      <section>
        <button class="row" role="switch" :aria-checked="settings.quality === 'high'" @click="settings.quality = settings.quality === 'high' ? 'low' : 'high'">
          <span>
            <span class="lead">Sharper graphics</span>
            <span class="sub">Shadows and lamplight. Turn off on a slow computer or to save battery.</span>
          </span>
          <span class="switch" :class="{ on: settings.quality === 'high' }" aria-hidden="true" />
        </button>
        <button class="row" role="switch" :aria-checked="settings.reduceMotion" @click="settings.reduceMotion = !settings.reduceMotion">
          <span>
            <span class="lead">Calmer motion</span>
            <span class="sub">No camera glide and no strolling flatmates.</span>
          </span>
          <span class="switch" :class="{ on: settings.reduceMotion }" aria-hidden="true" />
        </button>
        <button class="row" role="switch" :aria-checked="settings.sound" @click="settings.sound = !settings.sound">
          <span>
            <span class="lead">Sounds</span>
            <span class="sub">Little sounds for doors, lamps and friends. Off is fine too.</span>
          </span>
          <span class="switch" :class="{ on: settings.sound }" aria-hidden="true" />
        </button>
      </section>

      <section class="links">
        <button class="link" @click="replayWelcome">Watch the welcome again, and change your look ›</button>
        <template v-if="me">
          <button class="link" :disabled="tutorialBusy" @click="takeTutorialAgain">Take the tutorial again ›</button>
          <p v-if="tutorialError" class="sub error" role="alert">{{ tutorialError }}</p>
        </template>
      </section>

      <!-- Only when the server says the demo may be reset: the whole city goes back to its seed. -->
      <section v-if="config?.demoReset" class="reset">
        <button v-if="!confirming" class="link danger" @click="confirming = true">Reset the demo city ›</button>
        <template v-else>
          <p class="lead">Everything goes back to the start. Reset?</p>
          <div class="choice">
            <button class="danger-fill" :disabled="resetBusy" @click="resetDemo">Reset</button>
            <button :disabled="resetBusy" @click="confirming = false">Keep</button>
          </div>
          <p v-if="resetError" class="sub error" role="alert">{{ resetError }}</p>
        </template>
      </section>
    </aside>
  </Transition>
</template>

<style scoped>
.scrim { position: fixed; inset: 0; z-index: 90; background: var(--scrim); }
.pane { position: fixed; top: 0; right: 0; bottom: 0; z-index: 100; width: min(400px, 100vw); padding: 24px 24px 32px; overflow-y: auto; display: grid; align-content: start; gap: 28px; background: var(--surface); color: var(--text); box-shadow: var(--shadow); outline: none; }
.top { display: flex; align-items: center; justify-content: space-between; }
h2 { margin: 0; font-size: 28px; font-weight: 600; letter-spacing: -0.02em; }
.close { width: 36px; height: 36px; border-radius: 50%; border: 0; display: grid; place-items: center; background: var(--fill); color: inherit; cursor: pointer; padding: 0; }
section { display: grid; gap: 4px; }
.lead { display: block; font-size: 17px; font-weight: 500; margin: 0 0 8px; }
.sub { display: block; font-size: 14px; line-height: 1.4; color: var(--muted); }
.error { color: var(--danger); margin: 0; }
/* A segmented control: one column per choice, the chosen one raised on the surface. */
.segmented { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; padding: 3px; border-radius: 12px; background: var(--fill); }
.segmented button { border: 0; border-radius: 9px; min-height: 40px; background: none; color: inherit; font-size: 15px; cursor: pointer; }
.segmented button.on { background: var(--surface); box-shadow: 0 1px 4px rgba(0, 0, 0, 0.14); font-weight: 500; }
.row { display: flex; align-items: center; gap: 16px; justify-content: space-between; text-align: left; width: 100%; padding: 14px 0; border: 0; border-bottom: 1px solid var(--hairline); background: none; color: inherit; font: inherit; cursor: pointer; }
.row .lead { margin: 0 0 2px; }
.switch { flex: none; position: relative; width: 51px; height: 31px; border-radius: 31px; background: var(--fill-hover); transition: background 0.2s; }
.switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 27px; height: 27px; border-radius: 50%; background: #fff; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2); transition: transform 0.2s; }
.switch.on { background: var(--live); }
.switch.on::after { transform: translateX(20px); }
.links { gap: 0; }
.link { justify-self: start; border: 0; background: none; padding: 8px 0; color: var(--accent); font-size: 17px; cursor: pointer; text-align: left; }
.link.danger { color: var(--danger); }
/* The reset question: a short line, then Reset in red beside Keep. */
.reset { padding-top: 20px; border-top: 1px solid var(--hairline); }
.choice { display: flex; gap: 10px; }
.choice button { min-height: 40px; padding: 0 20px; font-size: 15px; }
.danger-fill { background: var(--danger); color: #fff; }
.danger-fill:hover:not(:disabled) { background: var(--danger); opacity: 0.9; }
/* Our own hovers and sizes, so the site's general button style doesn't reshape these controls. */
.close { min-height: 36px; }
.close:hover:not(:disabled) { background: var(--fill-hover); }
.segmented button { padding: 0 12px; }
.segmented button:hover:not(:disabled):not(.on) { background: color-mix(in srgb, currentColor 6%, transparent); }
.segmented button.on:hover { background: var(--surface); }
.row:hover:not(:disabled), .link:hover:not(:disabled) { background: none; }
button:focus-visible { outline: 3px solid var(--accent-fill); outline-offset: 2px; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.25s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.slide-enter-active, .slide-leave-active { transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1); }
.slide-enter-from, .slide-leave-to { transform: translateX(100%); }
@media (prefers-reduced-motion: reduce) {
  .fade-enter-active, .fade-leave-active, .slide-enter-active, .slide-leave-active, .switch, .switch::after { transition: none; }
}
</style>
