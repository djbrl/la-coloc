<script setup lang="ts">
// The window every lobby card sits in: a dark frame, the wall with its name and X, and a sill for what you can do. It
// reads like a game's interaction menu rather than a web page: a few facts, then the buttons (one lit, the others dark).
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
.card :deep(.sign-sub .status-dot) { display: inline-block; margin-left: 6px; vertical-align: -1px; box-shadow: 0 0 0 2px var(--surface); }
.card :deep(p) { margin: 0; font-size: 16px; line-height: 1.25; }
.card :deep(.soft) { color: var(--muted); }
.card :deep(.small) { font-size: 14px; }
.card :deep(.line) { display: block; }
.card :deep(.error) { color: var(--danger); font-size: 14px; }

/* The menu: the main action as a wide button, then the others as equal tiles in a row. */
/* It stays in view when the facts above it have to scroll. */
.card :deep(.menu) { position: sticky; bottom: -14px; display: grid; gap: 8px; margin: 4px -16px -14px; padding: 12px 14px; }
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
  font: 500 16px/1.1 var(--font);
  text-decoration: none;
  cursor: pointer;
  transition: background-color var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease);
}
/* The main one, a lit tube, 54px tall. */
.card :deep(.big.primary) { min-height: 54px; background: var(--accent-fill); color: var(--on-accent); box-shadow: var(--tube); font-size: 18px; }
.card :deep(.big:hover:not(:disabled)) { background: var(--fill-hover); text-decoration: none; }
.card :deep(.big.primary:hover:not(:disabled)) { background: var(--accent-fill-hover); box-shadow: var(--tube-hot); }
.card :deep(.big:active:not(:disabled)) { transform: translateY(1px); }
.card :deep(.big:disabled) { opacity: 0.5; cursor: not-allowed; }
/* A tube that's off: no glow, no promise. */
.card :deep(.big.primary:disabled) { background: transparent; color: var(--text); box-shadow: var(--quiet-edge); }
/* A tile: an icon and its word. */
.card :deep(.tile) { flex: 1 1 auto; padding: 0 10px; font-size: 15px; }
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
