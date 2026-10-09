<script setup lang="ts">
// Settings, as a sheet that slides in: how the city shows, how it looks, how it moves. Each control reads as a
// sentence, so nothing needs a label.
import { nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { settings, settingsPane } from "../settings";

const route = useRoute();
const router = useRouter();
const panel = ref<HTMLElement | null>(null);
let opener: Element | null = null;

watch(
  () => settingsPane.open,
  async (open) => {
    if (open) {
      opener = document.activeElement;
      await nextTick();
      panel.value?.focus();
      window.addEventListener("keydown", onKey);
    } else {
      window.removeEventListener("keydown", onKey);
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

function replayWelcome() {
  settings.welcomed = false;
  close();
  if (route.path !== "/") router.push("/");
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
      </section>

      <section>
        <button class="link" @click="replayWelcome">Watch the welcome again, and change your look ›</button>
      </section>
    </aside>
  </Transition>
</template>

<style scoped>
.scrim { position: fixed; inset: 0; z-index: 90; background: rgba(0, 0, 0, 0.32); }
.pane { position: fixed; top: 0; right: 0; bottom: 0; z-index: 100; width: min(400px, 100vw); padding: 24px 24px 32px; overflow-y: auto; display: grid; align-content: start; gap: 28px; background: var(--bg, #fff); color: var(--text, #1d1d1f); box-shadow: -20px 0 60px rgba(0, 0, 0, 0.18); outline: none; }
.top { display: flex; align-items: center; justify-content: space-between; }
h2 { margin: 0; font-size: 28px; font-weight: 600; letter-spacing: -0.02em; }
.close { width: 36px; height: 36px; border-radius: 50%; border: 0; display: grid; place-items: center; background: color-mix(in srgb, currentColor 8%, transparent); color: inherit; cursor: pointer; padding: 0; }
section { display: grid; gap: 4px; }
.lead { display: block; font-size: 17px; font-weight: 500; margin: 0 0 8px; }
.sub { display: block; font-size: 14px; line-height: 1.4; color: var(--muted, #6e6e73); }
.segmented { display: grid; grid-template-columns: 1fr 1fr; padding: 3px; border-radius: 12px; background: color-mix(in srgb, currentColor 8%, transparent); }
.segmented button { border: 0; border-radius: 9px; min-height: 40px; background: none; color: inherit; font-size: 15px; cursor: pointer; }
.segmented button.on { background: var(--bg, #fff); box-shadow: 0 1px 4px rgba(0, 0, 0, 0.14); font-weight: 500; }
.row { display: flex; align-items: center; gap: 16px; justify-content: space-between; text-align: left; width: 100%; padding: 14px 0; border: 0; border-bottom: 1px solid var(--border, #d2d2d7); background: none; color: inherit; font: inherit; cursor: pointer; }
.row .lead { margin: 0 0 2px; }
.switch { flex: none; position: relative; width: 51px; height: 31px; border-radius: 31px; background: color-mix(in srgb, currentColor 18%, transparent); transition: background 0.2s; }
.switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 27px; height: 27px; border-radius: 50%; background: #fff; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2); transition: transform 0.2s; }
.switch.on { background: #34c759; }
.switch.on::after { transform: translateX(20px); }
.link { justify-self: start; border: 0; background: none; padding: 8px 0; color: var(--accent, #0071e3); font-size: 17px; cursor: pointer; text-align: left; }
/* Our own hovers and sizes, so the site's general button style doesn't reshape these controls. */
.close { min-height: 36px; }
.close:hover:not(:disabled) { background: color-mix(in srgb, currentColor 14%, transparent); }
.segmented button { padding: 0 12px; }
.segmented button:hover:not(:disabled):not(.on) { background: color-mix(in srgb, currentColor 6%, transparent); }
.segmented button.on:hover { background: var(--bg, #fff); }
.row:hover:not(:disabled), .link:hover:not(:disabled) { background: none; }
button:focus-visible { outline: 3px solid var(--accent, #0071e3); outline-offset: 2px; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.25s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.slide-enter-active, .slide-leave-active { transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1); }
.slide-enter-from, .slide-leave-to { transform: translateX(100%); }
@media (prefers-reduced-motion: reduce) {
  .fade-enter-active, .fade-leave-active, .slide-enter-active, .slide-leave-active, .switch, .switch::after { transition: none; }
}
</style>
