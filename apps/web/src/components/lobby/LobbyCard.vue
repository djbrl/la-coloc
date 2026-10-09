<script setup lang="ts">
// The glass panel every lobby card sits in. It floats over the city without blocking it (no scrim, no focus
// trap), lands focus on its first action when it opens, and keeps Enter to itself: Enter presses the focused
// button, and must not also reach the lobby, which would read it as E.
import { onMounted, ref } from "vue";

defineProps<{ label: string }>();
const root = ref<HTMLElement | null>(null);

// A moment later, not at once: a click's own focus (on the stage) lands after we mount and would win.
onMounted(() => setTimeout(() => root.value?.querySelector<HTMLElement>("button, a")?.focus({ preventScroll: true }), 0));

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
  width: min(380px, calc(100vw - 32px));
  max-height: calc(100dvh - 200px);
  overflow-y: auto;
  padding: 18px 20px 14px;
  border-radius: 20px;
  color: #f5f5f7;
  background: rgba(28, 24, 44, 0.78);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.3);
  display: grid;
  gap: 10px;
}
/* The cards fill the slot, so their shared text styles live here, reached with :deep. */
.card :deep(h2) { margin: 0; font-size: 24px; line-height: 1.15; font-weight: 600; letter-spacing: -0.02em; color: #fff; }
.card :deep(p) { margin: 0; font-size: 16px; line-height: 1.4; }
.card :deep(.soft) { color: rgba(245, 245, 247, 0.72); }
.card :deep(.small) { font-size: 14px; }
.card :deep(.line) { display: block; }
.card :deep(.actions) { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 18px; margin-top: 4px; }
.card :deep(a) { color: #6eb4ff; text-decoration: none; font-size: 15px; min-height: 36px; display: inline-flex; align-items: center; }
.card :deep(button.link) { border: 0; background: none; padding: 0; min-height: 36px; color: #6eb4ff; font-size: 15px; cursor: pointer; }
.card :deep(button.link.quiet) { color: rgba(245, 245, 247, 0.7); }
.card :deep(.pill) { border: 0; border-radius: 980px; padding: 10px 18px; min-height: 40px; font-size: 15px; font-weight: 500; background: #fff; color: #1d1d1f; cursor: pointer; }
.card :deep(.error) { color: #ff8a80; font-size: 14px; }
/* Our own hovers: the site's button styles are for light pages, not this dark glass. */
.card :deep(button.link:hover:not(:disabled)) { background: none; color: #fff; text-decoration: none; }
.card :deep(.pill:hover:not(:disabled)) { background: #e8e8ed; }
.card :deep(a:hover) { text-decoration: underline; }
.card :deep(:is(button, a):focus-visible) { outline: 3px solid #6eb4ff; outline-offset: 2px; }
@media (max-width: 520px) {
  .card { width: 100%; max-height: 60dvh; border-radius: 20px 20px 0 0; padding-bottom: max(14px, env(safe-area-inset-bottom)); }
}
</style>
