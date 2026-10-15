<script setup lang="ts">
// The flat card every lobby card sits in: the site's surface, lifted by a shadow. It reads like a game's
// interaction menu rather than a web page: a short bold heading, a few facts, then chunky buttons (one primary,
// the others as icon tiles) and a round close button in the corner. It floats over the city without blocking it
// (no scrim, no focus trap), pops in, lands focus on its main action when it opens, and keeps Enter to itself:
// Enter presses the focused button, and must not also reach the lobby, which would read it as E.
import { onMounted, ref } from "vue";

defineProps<{ label: string }>();
const root = ref<HTMLElement | null>(null);

// A moment later, not at once: a click's own focus (on the stage) lands after we mount and would win.
// The main action (the primary button) if there is one, else the first menu button, else anything you can press.
onMounted(() =>
  setTimeout(() => {
    const el = [".primary", ".big", "button, a"].map((s) => root.value?.querySelector<HTMLElement>(s)).find(Boolean);
    el?.focus({ preventScroll: true });
  }, 0),
);

function onKey(e: KeyboardEvent) {
  if (e.key === "Enter") e.stopPropagation();
}
</script>

<template>
  <section ref="root" class="card" role="dialog" :aria-label="label" @keydown="onKey">
    <slot />
  </section>
</template>

<style scoped>
.card {
  position: relative;
  width: min(380px, calc(100vw - 32px));
  max-height: calc(100dvh - 200px);
  overflow-y: auto;
  padding: 18px 18px 16px;
  border-radius: var(--r-xl);
  color: var(--text);
  background: var(--surface);
  box-shadow: var(--shadow);
  display: grid;
  gap: 12px;
  animation: card-pop var(--dur-slow) var(--ease-pop);
}
@keyframes card-pop {
  from { opacity: 0; transform: translateY(10px) scale(0.95); }
}
/* The cards fill the slot, so their shared styles live here, reached with :deep. */
.card :deep(h2) { margin: 0; padding-right: 44px; font-size: 26px; line-height: 1.05; overflow-wrap: anywhere; }
.card :deep(p) { margin: 0; font-size: 15px; line-height: 1.4; }
.card :deep(.soft) { color: var(--muted); }
.card :deep(.small) { font-size: 13px; }
.card :deep(.line) { display: block; }
.card :deep(.error) { color: var(--danger); font-size: 14px; }

/* The round close button in the top corner. */
.card :deep(.x) {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 34px;
  height: 34px;
  min-height: 0;
  padding: 0;
  display: grid;
  place-items: center;
  border-radius: var(--r-sm);
  background: none;
  color: var(--muted);
  box-shadow: inset 0 0 0 1px var(--line);
}
.card :deep(.x:hover:not(:disabled)) { background: var(--fill-hover); color: var(--text); }

/* The menu: the main action as a wide button, then the others as equal icon tiles in a row. */
.card :deep(.menu) { display: grid; gap: 8px; margin-top: 2px; }
.card :deep(.tiles) { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 8px; }
.card :deep(.big) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 50px;
  padding: 0 18px;
  border: 0;
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--quiet-edge);
  font-size: 16px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  transition: background-color var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease);
}
/* Every menu button is a key with a lip: the quiet ones a grey edge, the main one the orange. Pressed, it sinks. */
.card :deep(.big.primary) { background: var(--accent-fill); color: var(--on-accent); box-shadow: 0 var(--lip) 0 var(--accent-lip); font-family: var(--display); font-size: 17px; font-weight: 700; }
.card :deep(.big:hover:not(:disabled)) { background: var(--tile); text-decoration: none; }
.card :deep(.big.primary:hover:not(:disabled)) { background: var(--accent-fill-hover); }
.card :deep(.big:active:not(:disabled)) { transform: translateY(1px); box-shadow: inset 0 0 0 1px var(--border), 0 1px 0 var(--line-strong); }
.card :deep(.big.primary:active:not(:disabled)) { transform: translateY(calc(var(--lip) - var(--lip-pressed))); box-shadow: 0 var(--lip-pressed) 0 var(--accent-lip); }
/* A tile: the icon over its one word. */
.card :deep(.tile) { flex-direction: column; gap: 4px; min-height: 62px; padding: 8px 6px; font-size: 13px; }
.card :deep(.big svg) { flex: none; }
.card :deep(:is(button, a):focus-visible) { outline: 3px solid var(--accent-fill); outline-offset: 2px; }
@media (max-width: 520px) {
  .card { width: 100%; max-height: 60dvh; border-radius: var(--r-xl) var(--r-xl) 0 0; padding-bottom: max(16px, env(safe-area-inset-bottom)); }
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
