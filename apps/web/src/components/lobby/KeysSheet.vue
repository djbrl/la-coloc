<script setup lang="ts">
// Every key the lobby knows, as a game's controls screen: a floating card in the middle of the screen, the keys
// grouped by what they're for, each key cap on the left and what it does on the right. "?" opens it, Escape or
// Close shuts it; the lobby puts focus back on the stage afterwards. Nothing shows on a touch screen, where there
// are no keys.
import { computed, onMounted, ref } from "vue";
import { caps } from "../../lobby/keys";
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
      { keys: [caps.w, caps.a, caps.s, caps.d], does: w.walk },
      { keys: [w.shiftKey], does: w.dash },
      { keys: [caps.q, caps.r], does: w.turn, or: true },
    ],
  },
  {
    name: w.act,
    rows: [
      { keys: [caps.e], does: w.useOpen },
      { keys: ["]"], does: w.nextThing },
      { keys: ["["], does: w.previousThing },
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
    <section class="keys sign" role="dialog" aria-modal="true" :aria-label="w.theKeys" @keydown.esc.stop="emit('close')" @keydown="onKey">
      <div class="sign-frame">
      <header class="sign-band large"><h2>{{ w.theKeys }}</h2></header>
      <div class="sign-body inner">
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
      </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.veil { position: absolute; inset: 0; z-index: 40; display: grid; place-items: center; padding: 16px; background: var(--scrim); }
/* A red sign: a game's controls screen, popping in. */
.keys {
  display: flex;
  flex-direction: column;
  width: min(640px, 100%);
  max-height: calc(100dvh - 32px);
  animation: menu-pop var(--dur-slow) var(--ease-pop);
}
.sign-band { padding-right: 16px; }
.inner { display: grid; gap: 14px; overflow-y: auto; overscroll-behavior: contain; }
@keyframes menu-pop {
  from { opacity: 0; transform: translateY(10px) scale(0.94); }
}
/* Two columns of groups, each its name over its rows. */
.groups { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 20px; align-items: start; }
.group { display: grid; gap: 6px; }
h3 { margin: 0; font-size: 15px; color: var(--panel); }
/* One column for the caps, as wide as the group's widest combination, so the words line up beside them. */
ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 6px 14px; }
li { grid-column: 1 / -1; display: grid; grid-template-columns: subgrid; align-items: center; min-height: 32px; font-size: 16px; line-height: 1.2; }
.combo { display: inline-flex; align-items: center; gap: 4px; }
.join { font-size: 14px; font-weight: 800; color: var(--muted); }
.does { min-width: 0; font-weight: 600; }
kbd { min-width: 28px; height: 28px; padding: 0 7px; font-size: 14px; }
kbd.wide { min-width: 44px; }
/* Close: a ghost across the width, with its key. */
.close { display: inline-flex; align-items: center; justify-content: center; gap: 10px; background: transparent; box-shadow: var(--quiet-edge); }
.close:hover:not(:disabled) { background: var(--tile); }
.close:active { transform: translateY(1px); }
@media (max-width: 560px) {
  .groups { grid-template-columns: minmax(0, 1fr); }
}
@media (max-height: 640px) {
  .inner { gap: 10px; }
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
