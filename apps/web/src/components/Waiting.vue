<script setup lang="ts">
// What a panel says when it can't load because the core is down: a calm "Waiting for the city…", one line of
// reassurance, and a "Try again" button. It's not an error dead end: the panel reloads by itself when the core is
// back (useWhenBack in the panel), and this button is only the impatient way. It fills the panel's body the way
// the other one-message states do (RoomPage's), so nothing scrolls.
import { onBeforeUnmount, ref } from "vue";
import { tryAgain } from "../core";
import { signalOff } from "./coreIcons";

withDefaults(defineProps<{ title?: string; line?: string }>(), { title: "Waiting for the city…", line: "It loads again by itself when the city is back." });
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
    <p class="said">{{ title }}</p>
    <p class="line">{{ line }}</p>
    <button type="button" class="chunk primary" :disabled="trying" @click="retry">{{ trying ? "Trying…" : "Try again" }}</button>
  </div>
</template>

<style scoped>
.waiting { margin: auto; display: grid; justify-items: center; align-content: center; gap: 10px; padding: 28px 16px; text-align: center; max-width: 360px; }
.icon { display: grid; place-items: center; width: 56px; height: 56px; border-radius: var(--r-lg); background: var(--fill); color: var(--muted); }
.said { font-size: 19px; font-weight: 600; line-height: 1.25; }
.line { font-size: 14px; line-height: 1.4; color: var(--muted); }
.chunk { margin-top: 6px; min-height: 44px; padding: 0 22px; font-size: 16px; font-weight: 600; }
</style>
