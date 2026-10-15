<script setup lang="ts">
// Every key the lobby knows, as a game's controls screen: a floating card in the middle of the screen, the keys
// grouped by what they're for, each key cap on the left and what it does on the right. "?" opens it, Escape or
// Close shuts it; the lobby puts focus back on the stage afterwards. Nothing shows on a touch screen, where there
// are no keys.
import { computed, onMounted, ref } from "vue";
import { hudWords as w } from "./words";

const emit = defineEmits<{ close: [] }>();
const closeButton = ref<HTMLButtonElement | null>(null);

// `or`: keys that each do it on their own (Q or R), rather than together. The keys only work while the city itself
// has the focus (click it, or Tab to it after the buttons); Tab moves between the buttons as on any page.
interface Control {
  keys: string[];
  does: string;
  or?: boolean;
}
// Computed, so the words follow the language chosen now (words.ts).
const groups = computed((): { name: string; rows: Control[] }[] => [
  {
    name: w.move,
    rows: [
      { keys: ["W", "A", "S", "D"], does: w.walk },
      { keys: [w.shiftKey], does: w.dash },
      { keys: ["Q", "R"], does: w.turn, or: true },
    ],
  },
  {
    name: w.act,
    rows: [
      { keys: ["E"], does: w.useOpen },
      { keys: ["]"], does: w.nextThing },
      { keys: ["["], does: w.previousThing },
      { keys: ["1", "2"], does: w.react, or: true },
    ],
  },
  {
    name: w.go,
    rows: [
      { keys: ["F"], does: w.findHouse },
      { keys: ["T"], does: w.travel },
      { keys: ["M"], does: w.theMap },
    ],
  },
  {
    name: w.menus,
    rows: [
      { keys: [w.escKey], does: w.closeKey },
      { keys: ["?"], does: w.thisList },
    ],
  },
]);

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
    <section class="keys" role="dialog" aria-modal="true" :aria-label="w.theKeys" @keydown.esc.stop="emit('close')" @keydown="onKey">
      <h2>{{ w.theKeys }}</h2>
      <div class="groups">
        <section v-for="g in groups" :key="g.name" class="group" :aria-label="g.name">
          <h3>{{ g.name }}</h3>
          <ul>
            <li v-for="r in g.rows" :key="r.does">
              <span class="combo">
                <template v-for="(k, i) in r.keys" :key="k">
                  <span v-if="i > 0 && (r.or || r.keys.length === 2)" class="join" aria-hidden="true">{{ r.or ? "/" : "+" }}</span>
                  <kbd :class="{ wide: k.length > 2 }">{{ k }}</kbd>
                </template>
              </span>
              <span class="does">{{ r.does }}</span>
            </li>
          </ul>
        </section>
      </div>
      <button ref="closeButton" class="close" @click="emit('close')">{{ w.close }}<kbd aria-hidden="true">{{ w.escKey }}</kbd></button>
    </section>
  </div>
</template>

<style scoped>
.veil { position: absolute; inset: 0; z-index: 40; display: grid; place-items: center; padding: 16px; background: var(--scrim); }
/* A flat card, big corners, a quick pop: a game's controls screen. */
.keys {
  width: min(600px, 100%);
  max-height: calc(100dvh - 32px);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 24px 24px 20px;
  border-radius: 28px;
  color: var(--text);
  background: var(--surface);
  box-shadow: var(--shadow);
  display: grid;
  gap: 16px;
  animation: menu-pop 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.2);
}
@keyframes menu-pop {
  from { opacity: 0; transform: translateY(10px) scale(0.94); }
}
h2 { margin: 0; font-size: 28px; font-weight: 700; line-height: 1.1; letter-spacing: -0.02em; }
/* Two columns of groups, each group a soft tile with its name over its rows. */
.groups { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; align-items: start; }
.group { display: grid; gap: 8px; padding: 12px 14px 14px; border-radius: 18px; background: var(--tile); }
h3 { margin: 0; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
/* One column for the caps, as wide as the group's widest combination, so the words line up beside them. */
ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 8px 14px; }
li { grid-column: 1 / -1; display: grid; grid-template-columns: subgrid; align-items: center; min-height: 32px; font-size: 15px; line-height: 1.25; }
.combo { display: inline-flex; align-items: center; gap: 4px; }
.join { font-size: 12px; font-weight: 600; color: var(--muted); }
.does { min-width: 0; font-weight: 500; }
/* A key cap: raised on the surface, with a thicker bottom edge, like a real key. */
kbd {
  display: inline-grid;
  place-items: center;
  min-width: 28px;
  height: 28px;
  padding: 0 7px;
  border-radius: 7px;
  border: 1px solid var(--border);
  border-bottom-width: 3px;
  background: var(--surface);
  color: var(--text);
  font: 700 12px/1 var(--font);
}
kbd.wide { min-width: 44px; }
/* Close: a chunky button across the width, with its key. */
.close { display: inline-flex; align-items: center; justify-content: center; gap: 10px; min-height: 50px; border-radius: 14px; font-size: 17px; font-weight: 700; }
.close kbd { height: 22px; min-width: 0; padding: 0 6px; border-bottom-width: 2px; font-size: 11px; background: var(--surface); }
.close:active { transform: scale(0.98); }
.close:focus-visible { outline: 3px solid var(--accent-fill); outline-offset: 2px; }
@media (max-width: 560px) {
  .groups { grid-template-columns: minmax(0, 1fr); }
}
@media (max-height: 640px) {
  .keys { padding-top: 18px; gap: 12px; }
  .group { padding: 10px 12px 12px; }
  li { min-height: 28px; }
}
/* No keyboard, no keys to list. */
@media (hover: none) {
  .veil { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .keys { animation: none; }
  .close:active { transform: none; }
}
</style>
