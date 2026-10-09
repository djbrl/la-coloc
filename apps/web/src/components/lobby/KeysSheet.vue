<script setup lang="ts">
// Every key the lobby knows, on a glass panel in the middle of the screen. "?" opens it, Escape or Close shuts it;
// the lobby puts focus back on the stage afterwards. Nothing shows on a touch screen, where there are no keys.
import { onMounted, ref } from "vue";

const emit = defineEmits<{ close: [] }>();
const closeButton = ref<HTMLButtonElement | null>(null);

const rows: { keys: string[]; does: string }[] = [
  { keys: ["W", "A", "S", "D"], does: "walk" },
  { keys: ["Tab"], does: "next thing" },
  { keys: ["Shift", "Tab"], does: "previous thing" },
  { keys: ["E"], does: "use, open" },
  { keys: ["Shift"], does: "dash" },
  { keys: ["Q", "R"], does: "turn the view" },
  { keys: ["1", "2"], does: "react" },
  { keys: ["F"], does: "find a house" },
  { keys: ["T"], does: "travel to another city" },
  { keys: ["M"], does: "the map" },
  { keys: ["Esc"], does: "close" },
  { keys: ["?"], does: "this list" },
];

// A moment later, not at once: the "?" key press that opened us must not land in here.
onMounted(() => setTimeout(() => closeButton.value?.focus({ preventScroll: true }), 0));

// Enter presses Close, and must not also reach the lobby, which would read it as E.
function onKey(e: KeyboardEvent) {
  if (e.key === "Enter") e.stopPropagation();
}
</script>

<template>
  <!-- The veil dims the city; a click on it (not on the panel) closes. -->
  <div class="veil" @click.self="emit('close')">
    <section class="keys" role="dialog" aria-modal="true" aria-label="The keys" @keydown.esc.stop="emit('close')" @keydown="onKey">
      <h2>The keys</h2>
      <ul>
        <li v-for="r in rows" :key="r.does">
          <span class="combo"><kbd v-for="k in r.keys" :key="k">{{ k }}</kbd></span>
          <span class="does">{{ r.does }}</span>
        </li>
      </ul>
      <button ref="closeButton" class="close" @click="emit('close')">Close</button>
    </section>
  </div>
</template>

<style scoped>
.veil { position: absolute; inset: 0; z-index: 40; display: grid; place-items: center; background: rgba(0, 0, 0, 0.35); }
.keys {
  width: min(360px, calc(100vw - 32px));
  max-height: calc(100dvh - 64px);
  overflow-y: auto;
  padding: 22px 24px 18px;
  border-radius: 22px;
  color: #f5f5f7;
  background: rgba(28, 24, 44, 0.82);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.3);
  display: grid;
  gap: 14px;
}
h2 { margin: 0; font-size: 24px; font-weight: 600; letter-spacing: -0.02em; color: #fff; }
ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
li { display: flex; align-items: center; gap: 12px; font-size: 15px; }
.combo { display: inline-flex; gap: 4px; min-width: 112px; }
.does { color: rgba(245, 245, 247, 0.85); }
kbd { font: 600 11px/1 -apple-system, BlinkMacSystemFont, sans-serif; padding: 4px 6px; min-width: 20px; text-align: center; border-radius: 5px; background: rgba(255, 255, 255, 0.14); border: 1px solid rgba(255, 255, 255, 0.18); color: #fff; }
.close { justify-self: start; border: 0; border-radius: 980px; padding: 8px 18px; min-height: 40px; font-size: 15px; font-weight: 500; background: #fff; color: #1d1d1f; cursor: pointer; }
.close:hover:not(:disabled) { background: #e8e8ed; }
.close:focus-visible { outline: 3px solid #6eb4ff; outline-offset: 2px; }
/* No keyboard, no keys to list. */
@media (hover: none) {
  .veil { display: none; }
}
</style>
