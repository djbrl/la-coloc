<script setup lang="ts">
// The one place the page says "the city can't be reached". When the core (the API and its database) is down, a
// flat card floats at the top of the page, over everything but the settings pane and the modal dialogs: it says so,
// says the rooms keep running, counts down to the next automatic try, and has one button, "Try now". The page under
// it stays alive (the lobby keeps walking with what it already loaded), so the card only catches clicks on
// itself. "Hide" folds it into a small pill so it never blocks anything. When the core answers again it says "Back
// online" for a moment and goes; whatever was open reloads by itself (useWhenBack, in each panel).
//
// It is a polite status, not an alert: it never takes the focus and holds none. The countdown is drawn but hidden
// from screen readers (a number changing every second would be read out every second); they hear the sentence once.
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { core, retryNow } from "../core";
import { lobbyUi } from "../settings";
import { signalOff } from "./coreIcons";
import Icon from "./lobby/house/Icon.vue";
import { hudWords as w } from "./lobby/words";

const folded = ref(false);
// A new fall always opens the card again, even if the last one was hidden.
watch(
  () => core.since,
  () => (folded.value = false),
);

const down = computed(() => core.state === "down");
const back = computed(() => core.state === "up" && core.recovered);
const shown = computed(() => down.value || back.value);

const countdown = computed(() => {
  if (core.probing) return w.tryingNow;
  if (core.retryIn > 0) return w.tryingIn(core.retryIn);
  return w.tryingAgain;
});

// What a screen reader hears when the card appears; it doesn't change while it counts down.
const said = computed(() => (back.value ? `${w.backOnline}.` : `${w.downTitle}. ${w.downLine}`));

// The lobby's HUD at the top makes room for the card (its CSS reads --core-offset), so nothing is hidden under it.
const root = ref<HTMLElement | null>(null);
let watcher: ResizeObserver | null = null;
function publish() {
  const h = shown.value && root.value ? root.value.getBoundingClientRect().height : 0;
  document.documentElement.style.setProperty("--core-offset", h ? `${Math.round(h) + 8}px` : "0px");
}
onMounted(() => {
  if (typeof ResizeObserver !== "undefined" && root.value) {
    watcher = new ResizeObserver(publish);
    watcher.observe(root.value);
  }
  publish();
});
watch([shown, folded], () => requestAnimationFrame(publish), { flush: "post" });
onBeforeUnmount(() => {
  watcher?.disconnect();
  document.documentElement.style.removeProperty("--core-offset");
});
</script>

<template>
  <!-- The region stays in the page, so what lands in it is announced. Only the card inside catches the pointer. -->
  <div class="core-live" :class="{ clear: !lobbyUi.chrome, aside: lobbyUi.inside }" role="status" aria-live="polite">
    <span class="sr-only">{{ shown ? said : "" }}</span>
    <Transition name="core">
      <div v-if="shown" ref="root" class="core">
        <!-- Back online, for a moment. -->
        <div v-if="back" class="row">
          <span class="tile live" aria-hidden="true"><Icon name="tick" :size="22" /></span>
          <p class="title">{{ w.backOnline }}</p>
        </div>

        <!-- Folded: a small pill that opens it again. -->
        <button v-else-if="folded" type="button" class="fold" @click="folded = false">
          <span class="sign" aria-hidden="true" />
          {{ w.offline }}
          <span class="sr-only">{{ w.showDetails }}</span>
        </button>

        <div v-else class="full">
          <span class="tile" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path :d="signalOff" /></svg>
          </span>
          <div class="words">
            <p class="title" aria-hidden="true">{{ w.downTitle }}</p>
            <p class="line" aria-hidden="true">{{ w.downLine }}</p>
            <div class="act">
              <button type="button" class="primary" :disabled="core.probing" @click="retryNow()">{{ w.tryNow }}</button>
              <span class="count" aria-hidden="true">{{ countdown }}</span>
            </div>
          </div>
          <button type="button" class="hide" :aria-label="w.hide" :title="w.hide" @click="folded = true">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* Fixed under the top bar, centred; a house's window docked on the right moves it into the free left half. Above the
   bar (50), the HUD (10) and the window (60), below the coach (70), the settings pane (90) and any modal dialog (the
   browser's own top layer). It takes no space and no clicks itself. */
.core-live { position: fixed; z-index: 65; top: 56px; left: 50%; transform: translateX(-50%); width: min(420px, calc(100vw - 32px)); pointer-events: none; }
.core-live.clear { top: 12px; }
@media (min-width: 720px) {
  .core-live.aside { left: calc((100vw - 32px - min(600px, 48vw)) / 2); width: min(420px, calc(100vw - min(600px, 48vw) - 64px)); }
}
.core { pointer-events: auto; display: flex; justify-content: center; }
.full, .row { pointer-events: auto; width: 100%; display: flex; align-items: flex-start; gap: 12px; padding: 14px 14px 14px 14px; border-radius: var(--r-xl); background: var(--surface); color: var(--text); box-shadow: var(--shadow); }
.row { width: auto; align-items: center; padding: 10px 20px 10px 12px; border-radius: var(--r-pill); box-shadow: var(--lift); }
.tile { flex: none; display: grid; place-items: center; width: 44px; height: 44px; border-radius: var(--r-md); background: var(--warn-soft); color: var(--warn); }
.tile.live { width: 36px; height: 36px; border-radius: 50%; background: var(--live-soft); color: var(--live); }
.words { flex: 1 1 auto; min-width: 0; display: grid; gap: 4px; }
.title { margin: 0; font-size: 17px; font-weight: 700; line-height: 1.2; letter-spacing: -0.01em; }
.row .title { font-size: 16px; }
.line { margin: 0; font-size: 14px; line-height: 1.35; color: var(--muted); }
.act { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px; margin-top: 6px; }
.act .primary { min-height: 40px; padding: 0 20px; border-radius: var(--r-md); font-size: 15px; font-weight: 600; }
.count { font-size: 13px; color: var(--muted); font-variant-numeric: tabular-nums; }
.hide { flex: none; width: 36px; height: 36px; min-height: 0; padding: 0; display: grid; place-items: center; border-radius: 50%; background: var(--fill); color: var(--muted); }
.hide:hover:not(:disabled) { background: var(--fill-hover); color: var(--text); }
.fold { display: inline-flex; align-items: center; gap: 8px; min-height: 36px; padding: 0 16px; border-radius: var(--r-pill); background: var(--surface); color: var(--text); box-shadow: var(--lift); font-size: 14px; font-weight: 600; }
.fold:hover:not(:disabled) { background: var(--fill); }
.sign { width: 8px; height: 8px; border-radius: 50%; background: var(--warn); }
.core :is(button):focus-visible { outline: 3px solid var(--accent-fill); outline-offset: 2px; }

.core-enter-active { transition: opacity 0.22s var(--ease), transform var(--dur-slow) var(--ease-pop); }
.core-leave-active { transition: opacity 0.2s var(--ease), transform 0.2s var(--ease); }
.core-enter-from, .core-leave-to { opacity: 0; transform: translateY(-8px); }
@media (prefers-reduced-motion: reduce) {
  .core-enter-active, .core-leave-active { transition: none; }
}
:global(.reduce-motion) .core-enter-active, :global(.reduce-motion) .core-leave-active { transition: none; }
@media (max-width: 520px) {
  .core-live { width: calc(100vw - 32px); }
  .line { font-size: 13px; }
}
</style>
