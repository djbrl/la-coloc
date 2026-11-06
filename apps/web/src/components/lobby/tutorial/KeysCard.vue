<script setup lang="ts">
// Chapter 3's moment: the room is yours. A card in the middle of the screen hands you the keys (a drawn key on a
// ring, with your room's name on its tag), says which room in which house, and what the room gives you. The keys
// jingle as it lands (the view plays the sound). One button, "Move in", and Enter presses it.
//
// In the quest the first rent comes first, so nobody forgets that a house is a real server people pay for: your share,
// how you'd pay, and one press. It's a simulation and it says so: nothing is sent anywhere, and the keys follow.
import { nextTick, onMounted, ref, watch } from "vue";
import { play } from "../../../lobby/sound";
import { fcfa } from "../house/server";
import { explain } from "../panel/words";
import { tutorialWords as w } from "./words";

const props = defineProps<{
  room: string;
  house: string;
  memoryMb?: number;
  cpus?: number;
  // The first rent to pay before the keys: your share, the server's whole cost, and how people pay there.
  rent?: { share: number; total: number; operators: string[] } | null;
}>();
const emit = defineEmits<{ next: [] }>();

// The key's paper tag holds about eight characters of the monospace beside its punch hole: a longer name ends in an
// ellipsis there (the line under the key, and its hover, carry the whole name).
const TAG_CHARS = 8;
const tagName = (room: string) => (room.length > TAG_CHARS ? `${room.slice(0, TAG_CHARS - 1)}…` : room);

const go = ref<HTMLButtonElement | null>(null);
const focusGo = () => setTimeout(() => go.value?.focus({ preventScroll: true }), 0);
onMounted(focusGo);

// The rent: unpaid, being "sent" for a moment, then the keys.
const stage = ref<"rent" | "paying" | "keys">(props.rent ? "rent" : "keys");
const operator = ref(props.rent?.operators[0] ?? "");
const PAYING_MS = 1100;
function pay() {
  stage.value = "paying";
  window.setTimeout(() => {
    stage.value = "keys";
    play("keys");
  }, PAYING_MS);
}
watch(stage, async (now) => {
  if (now !== "keys") return;
  await nextTick();
  focusGo();
});

// Enter and Space press the focused button; they must not reach the engine, where Enter means "use what's in reach".
function onKey(e: KeyboardEvent) {
  if (e.key === "Enter" || e.key === " ") e.stopPropagation();
}
</script>

<template>
  <div class="layer">
    <section v-if="stage !== 'keys'" class="card" role="dialog" aria-modal="true" aria-labelledby="quest-rent-title" @keydown="onKey">
      <h2 id="quest-rent-title" class="rent-title">{{ w.rentTitle }}</h2>
      <p class="amount"><strong>{{ fcfa(rent!.share) }}</strong> <span>{{ w.rentMonth }}</span></p>
      <p class="soft">{{ w.rentWhy(fcfa(rent!.total)) }}</p>
      <div class="ops" role="radiogroup" :aria-label="w.rentHow">
        <button v-for="o in rent!.operators" :key="o" type="button" role="radio" :aria-checked="operator === o" :disabled="stage === 'paying'" @click="operator = o">{{ o }}</button>
      </div>
      <div class="nav">
        <button ref="go" type="button" class="primary go" :disabled="stage === 'paying'" @click="pay">{{ stage === "paying" ? w.rentPaying(operator) : w.rentPay(fcfa(rent!.share)) }}</button>
      </div>
      <p class="mock">{{ w.rentMock }}</p>
    </section>
    <section v-else class="card" role="dialog" aria-modal="true" aria-labelledby="quest-keys-title" @keydown="onKey">
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
          <text x="56" y="99" text-anchor="middle" class="name">{{ tagName(room) }}</text>
        </g>
      </svg>
      <h2 id="quest-keys-title"><span class="sr-only">{{ w.keysTag }}. </span>{{ w.keysTitle }}</h2>
      <!-- "Room <name>, <house>.": a long name shortens to an ellipsis in its box; the whole of it is in the text (for a
           screen reader) and on hover. -->
      <p class="where">{{ w.keysRoom }} <span class="room-name" :title="room">{{ room }}</span>{{ w.keysAt(house) }}</p>
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
.name { font: 600 15px var(--num); fill: var(--text); }
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
h2 { margin: 0; font-size: 40px; line-height: 1; }
p { margin: 0; font-size: 17px; line-height: 1.45; }
.soft { color: var(--muted); font-size: 15px; }
.card > * { min-width: 0; }
.room-name { display: inline-block; max-width: 70%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: bottom; }
.rent-title { font-size: 30px; }
.amount { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: center; gap: 2px 8px; color: var(--muted); }
.amount strong { font: 400 44px/1.05 var(--display); color: var(--panel-red); white-space: nowrap; }
/* How you'd pay: words on the white, the chosen one on ink, as the panel's tabs. */
.ops { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; }
.ops button { min-height: 44px; padding: 0 12px; background: none; box-shadow: none; color: var(--text); font: 800 15px/1 var(--font); }
.ops button:hover:not(:disabled) { background: var(--tile); }
.ops button[aria-checked="true"], .ops button[aria-checked="true"]:hover:not(:disabled) { background: var(--text); color: var(--surface); }
.mock { color: var(--muted); font-size: 14px; line-height: 1.3; }
.nav { display: flex; justify-content: center; margin-top: 10px; }
.go { min-height: 60px; min-width: 220px; padding: 0 24px; border-radius: var(--r-md); font-size: 19px; display: inline-flex; align-items: center; justify-content: center; gap: 10px; }
button:focus-visible { outline: 3px solid var(--ring); outline-offset: 2px; }
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
/* The sign's red line inside the edge, on the flat card. */
.card { border-radius: var(--r-md); box-shadow: inset 0 0 0 3px var(--panel-red), var(--shadow); }
</style>
