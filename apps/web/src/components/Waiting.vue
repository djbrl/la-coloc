<script setup lang="ts">
// What a panel says when it can't load because the core is down: a calm "Waiting for the city…", one line of
// reassurance, and a "Try again" button. It's not an error dead end: the panel reloads by itself when the core is
// back (useWhenBack in the panel), and this button is only the impatient way. It fills the panel's body the way
// the other one-message states do (RoomPage's), so nothing scrolls.
import { onBeforeUnmount, ref } from "vue";
import { tryAgain } from "../core";
import { signalOff } from "./coreIcons";
import { commonWords as w } from "./words";

// Without a title or a line, it says the usual wait (words.ts), in the language chosen now.
const props = defineProps<{ title?: string; line?: string }>();
const emit = defineEmits<{ retry: [] }>();

// `retry` is asked only when the core is up (so it's the panel's own problem): while the core is down, the button asks
// the core, and the panel reloads when it answers (the panel's useWhenBack).
// A press shows "Trying…" for a moment, so it's seen to have done something (and can't be pressed twice in a row).
const trying = ref(false);
let timer = 0;
function retry() {
  if (trying.value) return;
  trying.value = true;
  void tryAgain(() => emit("retry"));
  timer = window.setTimeout(() => (trying.value = false), 900);
}
onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <div class="waiting" role="status">
    <span class="icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path :d="signalOff" /></svg>
    </span>
    <p class="said">{{ props.title ?? w.waiting }}</p>
    <p class="line">{{ props.line ?? w.waitingLine }}</p>
    <button type="button" class="chunk primary" :disabled="trying" @click="retry">{{ trying ? w.trying : w.tryAgain }}</button>
  </div>
</template>

<style scoped>
/* A calm wait in the middle of the card: the sign in a grey tile, one line at 17, one muted line, one red button. */
.waiting { margin: auto; display: grid; justify-items: center; align-content: center; gap: 8px; padding: 28px 16px; text-align: center; max-width: 360px; }
.icon { display: grid; place-items: center; width: 44px; height: 44px; margin-bottom: 4px; border-radius: 12px; background: var(--tile); color: var(--muted); }
.icon svg { width: 22px; height: 22px; }
.said { font-size: 17px; font-weight: 800; line-height: 22px; }
.line { font-size: 13px; font-weight: 600; line-height: 18px; color: var(--muted); }
.chunk { margin-top: 8px; padding-left: 22px; padding-right: 22px; }
</style>
