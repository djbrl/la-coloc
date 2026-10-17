<script setup lang="ts">
// Chapter 3's moment: the room is yours. A card in the middle of the screen hands you the keys (a drawn key on a
// ring, with your room's name on its tag), says which room in which house, and what the room gives you. The keys
// jingle as it lands (the view plays the sound). One button, "Move in", and Enter presses it.
import { onMounted, ref } from "vue";
import { explain } from "../panel/words";
import { tutorialWords as w } from "./words";

defineProps<{ room: string; house: string; memoryMb?: number; cpus?: number }>();
const emit = defineEmits<{ next: [] }>();

const go = ref<HTMLButtonElement | null>(null);
onMounted(() => setTimeout(() => go.value?.focus({ preventScroll: true }), 0));

// Enter and Space press the focused button; they must not reach the engine, where Enter means "use what's in reach".
function onKey(e: KeyboardEvent) {
  if (e.key === "Enter" || e.key === " ") e.stopPropagation();
}
</script>

<template>
  <div class="layer">
    <section class="card" role="dialog" aria-modal="true" aria-labelledby="quest-keys-title" @keydown="onKey">
      <!-- The key on its ring, with a paper tag that carries the room's name. -->
      <svg class="key" viewBox="0 0 220 120" aria-hidden="true">
        <circle cx="40" cy="40" r="22" class="ring" />
        <g class="swing">
          <path d="M58 52l18 14" class="ring" />
          <circle cx="92" cy="74" r="18" class="bow" />
          <circle cx="92" cy="74" r="7" class="hole" />
          <path d="M110 74h82v10h-10v10h-12V84h-10v10h-12V84h-38z" class="blade" />
        </g>
        <g class="tag">
          <path d="M40 62l-6 20" class="string" />
          <rect x="4" y="80" width="88" height="30" rx="5" class="paper" />
          <circle cx="14" cy="95" r="3" class="punch" />
          <text x="54" y="99" text-anchor="middle" class="name">{{ room.length > 10 ? `${room.slice(0, 9)}…` : room }}</text>
        </g>
      </svg>
      <h2 id="quest-keys-title"><span class="sr-only">{{ w.keysTag }}. </span>{{ w.keysTitle }}</h2>
      <p>{{ w.keysLine(room, house) }}</p>
      <p class="soft">{{ explain.room(memoryMb ?? 256, cpus ?? 0.5) }}</p>
      <div class="nav">
        <button ref="go" type="button" class="primary go" @click="emit('next')">{{ w.moveIn }} <kbd>↵</kbd></button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.layer { position: absolute; inset: 0; z-index: 30; display: grid; place-items: center; padding: 16px; }
.card { width: min(440px, 100%); display: grid; gap: 10px; padding: 22px 26px 22px; border-radius: var(--r-xl); background: var(--surface); color: var(--text); box-shadow: var(--shadow); text-align: center; animation: menu-pop var(--dur-slow) var(--ease-pop); }
@keyframes menu-pop {
  from { opacity: 0; transform: translateY(12px) scale(0.95); }
}
.key { width: 200px; height: auto; margin: -4px auto 4px; overflow: visible; }
.ring { fill: none; stroke: var(--line-strong); stroke-width: 5; stroke-linecap: round; }
.bow, .blade { fill: var(--accent-fill); stroke: var(--accent-lip); stroke-width: 3; stroke-linejoin: round; }
.hole { fill: var(--surface); stroke: var(--accent-lip); stroke-width: 3; }
.string { stroke: var(--muted); stroke-width: 2; }
.paper { fill: var(--tile); stroke: var(--line-strong); stroke-width: 2; }
.punch { fill: var(--surface); stroke: var(--line-strong); stroke-width: 1.5; }
.name { font: 600 15px var(--mono); fill: var(--text); }
/* The key drops onto the card and swings a little, like it was just handed over. */
.swing { transform-origin: 40px 40px; animation: swing 900ms var(--ease) both; }
.tag { transform-origin: 40px 62px; animation: swing-tag 1100ms var(--ease) both; }
@keyframes swing {
  0% { transform: translateY(-30px) rotate(-30deg); opacity: 0; }
  40% { transform: translateY(0) rotate(10deg); opacity: 1; }
  70% { transform: rotate(-4deg); }
  100% { transform: rotate(0); }
}
@keyframes swing-tag {
  0% { transform: translateY(-30px) rotate(20deg); opacity: 0; }
  45% { transform: translateY(0) rotate(-8deg); opacity: 1; }
  75% { transform: rotate(3deg); }
  100% { transform: rotate(0); }
}
h2 { margin: 0; font-size: 40px; line-height: 1; letter-spacing: -0.035em; }
p { margin: 0; font-size: 17px; line-height: 1.45; }
.soft { color: var(--muted); font-size: 15px; }
.nav { display: flex; justify-content: center; margin-top: 10px; }
.go { min-height: 52px; min-width: 220px; padding: 0 24px; border-radius: var(--r-md); font-size: 19px; display: inline-flex; align-items: center; justify-content: center; gap: 10px; }
button:focus-visible { outline: 3px solid var(--accent-fill); outline-offset: 2px; }
@media (hover: none) {
  kbd { display: none; }
}
@media (max-width: 520px) {
  .card { padding: 18px 18px 18px; }
  h2 { font-size: 32px; }
  p { font-size: 16px; }
  .go { width: 100%; }
}
@media (prefers-reduced-motion: reduce) {
  .card, .swing, .tag { animation: none; }
}
</style>
