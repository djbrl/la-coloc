<script setup lang="ts">
// The sign every lobby card sits in: a red title band with its X, a white body. It reads like a game's interaction
// menu rather than a web page: a few facts, then chunky buttons (one primary, the others as tiles).
// It floats over the city without blocking it
// (no scrim, no focus trap), pops in, lands focus on its main action when it opens, and keeps Enter to itself:
// Enter presses the focused button, and must not also reach the lobby, which would read it as E.
import { onMounted, ref } from "vue";

// `label` names the dialog for a screen reader; `title` and `sub` are on the band (a large band on a house's card).
defineProps<{ label: string; title: string; sub?: string; large?: boolean; closeName: string }>();
const emit = defineEmits<{ close: [] }>();
const root = ref<HTMLElement | null>(null);

// A moment later, not at once: a click's own focus (on the stage) lands after we mount and would win.
// The main action (the primary button) if you can press it, else the first menu button, else anything you can press.
onMounted(() =>
  setTimeout(() => {
    const el = [".primary:not(:disabled)", ".big:not(:disabled)", "button, a"].map((s) => root.value?.querySelector<HTMLElement>(s)).find(Boolean);
    el?.focus({ preventScroll: true });
  }, 0),
);

function onKey(e: KeyboardEvent) {
  if (e.key === "Enter") e.stopPropagation();
}
</script>

<template>
  <section ref="root" class="card sign" role="dialog" :aria-label="label" @keydown="onKey">
    <div class="sign-frame">
      <header class="sign-band" :class="{ large }">
        <h2>{{ title }}</h2>
        <p v-if="sub || $slots.sub" class="sign-sub"><slot name="sub">{{ sub }}</slot></p>
        <button class="sign-x" :aria-label="closeName" @click="emit('close')"><span aria-hidden="true">X</span></button>
      </header>
      <div class="sign-body card-body"><slot /></div>
    </div>
  </section>
</template>

<style scoped>
.card {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(var(--card-width, 380px), calc(100vw - 32px));
  max-height: calc(100dvh - 200px);
  animation: card-pop var(--dur-slow) var(--ease-pop);
}
.card-body { display: grid; align-content: start; gap: 10px; overflow-y: auto; overscroll-behavior: contain; }
@keyframes card-pop {
  from { opacity: 0; transform: translateY(10px) scale(0.95); }
}
/* The cards fill the slot, so their shared styles live here, reached with :deep. */
.card :deep(.sign-sub .status-dot) { display: inline-block; margin-left: 6px; vertical-align: -1px; box-shadow: 0 0 0 2px var(--on-panel); }
.card :deep(p) { margin: 0; font-size: 16px; line-height: 1.25; }
.card :deep(.soft) { color: var(--muted); }
.card :deep(.small) { font-size: 14px; }
.card :deep(.line) { display: block; }
.card :deep(.error) { color: var(--danger); font-size: 14px; }

/* The menu: the main action as a wide button, then the others as equal tiles in a row. */
.card :deep(.menu) { display: grid; gap: 8px; margin-top: 2px; }
.card :deep(.tiles) { display: flex; flex-wrap: wrap; gap: 8px; }
.card :deep(.big) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 50px;
  padding: 0 14px;
  border: 0;
  border-radius: var(--r-md);
  background: transparent;
  color: var(--text);
  box-shadow: var(--quiet-edge);
  font: 400 18px/1.1 var(--display);
  text-decoration: none;
  cursor: pointer;
  transition: background-color var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease);
}
/* The main one, in the sign's red and 60px tall. Pressed, it sinks a little. */
.card :deep(.big.primary) { min-height: 60px; background: var(--accent-fill); color: var(--on-accent); box-shadow: none; font-size: 24px; }
.card :deep(.big:hover:not(:disabled)) { background: var(--tile); text-decoration: none; }
.card :deep(.big.primary:hover:not(:disabled)) { background: var(--accent-fill-hover); }
.card :deep(.big:active:not(:disabled)) { transform: translateY(1px); }
.card :deep(.big:disabled) { opacity: 0.42; cursor: not-allowed; }
/* A tile: an icon and its word. The first of them is on ink, as the mockups' Message. */
.card :deep(.tile) { flex: 1 1 auto; padding: 0 10px; font-size: 15px; }
.card :deep(.tile:first-child:not(:disabled)), .card :deep(.tile:first-child:not(:disabled):hover) { background: var(--text); color: var(--surface); box-shadow: none; }
.card :deep(.big svg) { flex: none; }
@media (max-width: 520px) {
  .card { width: 100%; max-height: 74dvh; padding-bottom: max(7px, env(safe-area-inset-bottom)); }
}
@media (hover: none) {
  .card :deep(kbd) { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .card { animation: none; }
  .card :deep(.big) { transition: none; }
  .card :deep(.big:active:not(:disabled)) { transform: none; }
}
</style>
