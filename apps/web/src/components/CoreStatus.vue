<script setup lang="ts">
// The one place the page says the city can't be reached: a small key in the top bar's row, the same height as the
// bar's own keys, with a dot, one word and "Retry". The page under it stays alive (the lobby keeps walking with what
// it already loaded). When the core answers again it says "Back online" for a moment and goes; whatever was open
// reloads by itself (useWhenBack, in each panel).
//
// It is a polite status, not an alert: it never takes the focus and holds none.
import { computed, onBeforeUnmount, watch } from "vue";
import { core, retryNow } from "../core";
import { lobbyUi } from "../settings";
import Icon from "./lobby/house/Icon.vue";
import { hudWords as w } from "./lobby/words";

defineProps<{ float: boolean }>();

const down = computed(() => core.state === "down");
const back = computed(() => core.state === "up" && core.recovered);
const shown = computed(() => down.value || back.value);

// What a screen reader hears when it appears.
const said = computed(() => (back.value ? w.backOnline : w.offline));

// Under 1000px the bar's row has no room, so it stands under the search key: the HUD's top line steps down for it.
const NARROW = 1000;
const ROW = 52;
function publish() {
  const room = shown.value && window.innerWidth < NARROW ? ROW : 0;
  document.documentElement.style.setProperty("--core-offset", `${room}px`);
}
watch(shown, publish, { immediate: true });
onBeforeUnmount(() => document.documentElement.style.removeProperty("--core-offset"));
</script>

<template>
  <!-- The region stays in the page, so what lands in it is announced. Only the key inside catches the pointer. -->
  <div class="core-live" :class="{ float, clear: !lobbyUi.chrome, aside: lobbyUi.inside }" role="status" aria-live="polite">
    <span class="sr-only">{{ shown ? said : "" }}</span>
    <Transition name="core">
      <div v-if="shown" class="core" :class="{ back }">
        <Icon v-if="back" class="tick" name="tick" :size="20" />
        <span v-else class="dot" aria-hidden="true" />
        <span class="word" aria-hidden="true">{{ said }}</span>
        <button v-if="!back" type="button" class="primary retry" :disabled="core.probing" @click="retryNow()">{{ w.tryNow }}</button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* Centred in the top bar's row, at the height of the bar's keys (App.vue): 40 in a page's bar, 62 over the city. Above
   the bar (50), the HUD (10) and the window (60), below the coach (70), the settings pane (90) and any modal dialog. */
.core-live { --key: 40px; position: fixed; z-index: 65; top: 8px; left: 50%; transform: translateX(-50%); pointer-events: none; }
.core-live.float { --key: 62px; top: 24px; }
.core { pointer-events: auto; display: flex; align-items: center; gap: 10px; height: var(--key); padding: 0 8px 0 16px; border-radius: var(--r-md); background: var(--surface); color: var(--text); box-shadow: var(--lift); white-space: nowrap; }
.core.back { padding-right: 16px; }
.dot { flex: none; width: 10px; height: 10px; border-radius: 50%; background: var(--warn); }
.tick { flex: none; color: var(--live); }
.word { font-size: 16px; font-weight: 700; }
.retry { min-height: 0; height: calc(var(--key) - 12px); padding: 0 14px; border-radius: var(--r-md); font-size: 15px; font-weight: 700; }
.retry:focus-visible { outline: 3px solid var(--ring); outline-offset: 2px; }
/* A house's window docked on the right: it keeps to the free left half. */
@media (min-width: 1000px) {
  .core-live.aside { left: calc((100vw - 32px - min(600px, 48vw)) / 2); }
}
/* No room in the row: under the search key, at the left. */
@media (max-width: 999px) {
  .core-live, .core-live.float { --key: 44px; top: 94px; left: 24px; transform: none; }
  .core-live:not(.float) { top: 64px; left: 16px; }
}
@media (max-width: 520px) {
  .core-live.float { top: 66px; left: 12px; }
}

.core-enter-active { transition: opacity 0.22s var(--ease), transform var(--dur-slow) var(--ease-pop); }
.core-leave-active { transition: opacity 0.2s var(--ease), transform 0.2s var(--ease); }
.core-enter-from, .core-leave-to { opacity: 0; transform: translateY(-8px); }
@media (prefers-reduced-motion: reduce) {
  .core-enter-active, .core-leave-active { transition: none; }
}
:global(.reduce-motion) .core-enter-active, :global(.reduce-motion) .core-leave-active { transition: none; }
</style>
