<script setup lang="ts">
// Who you are in the city, before anything else: at first login, and again after the demo restarts. A welcome first
// (CreationDoor.vue), then pick a look with the camera on your character, then you're given your credit to settle in
// (CreditAward.vue). Saved on the last step: until then, coming back starts it over, and when it's saved LobbyView
// lets the quest begin.
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { CHARACTERS } from "../lobby/assets";
import { play } from "../lobby/sound";
import { me, sendJSON } from "../session";
import CreationDoor from "./CreationDoor.vue";
import CreditAward from "./CreditAward.vue";
import Icon from "./lobby/house/Icon.vue";
import { welcomeWords as w } from "./words";

const emit = defineEmits<{
  // Preview a look in the lobby.
  character: [name: string];
}>();

const step = ref<"door" | "look" | "award">("door");
const look = ref(0);
const saving = ref(false);
const error = ref("");
const main = ref<HTMLButtonElement | null>(null);

function turn(by: number) {
  look.value = (look.value + by + CHARACTERS.length) % CHARACTERS.length;
  emit("character", CHARACTERS[look.value]);
}

function go(to: "look" | "award") {
  error.value = "";
  step.value = to;
  nextTick(() => main.value?.focus());
}

// Past the welcome, and your character is there.
function enter() {
  play("arrive");
  go("look");
}

async function save() {
  saving.value = true;
  error.value = "";
  const res = await sendJSON("PATCH", "/api/me", { avatar: CHARACTERS[look.value] });
  saving.value = false;
  if (!res.ok) {
    error.value = res.message;
    return;
  }
  if (me.value) me.value.avatar = CHARACTERS[look.value];
}

function key(e: KeyboardEvent) {
  if (step.value === "look" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
    e.preventDefault();
    e.stopPropagation();
    turn(e.key === "ArrowLeft" ? -1 : 1);
  }
}

onMounted(() => {
  emit("character", CHARACTERS[look.value]);
  window.addEventListener("keydown", key, true);
});
onBeforeUnmount(() => window.removeEventListener("keydown", key, true));
</script>

<template>
  <CreationDoor v-if="step === 'door'" @next="enter" />
  <div v-else-if="step === 'look'" class="creation" role="dialog" aria-modal="false" aria-labelledby="creation-title">
    <h2 id="creation-title">{{ w.lookTitle }}</h2>
    <!-- Like a game's character select: arrows either side of the count (the arrow keys work too). -->
    <div class="picker">
      <button type="button" class="turn" :aria-label="w.previousLook" @click="turn(-1)"><Icon name="back" :size="24" /></button>
      <span class="count" aria-live="polite">{{ w.count(look + 1, CHARACTERS.length) }}</span>
      <button type="button" class="turn" :aria-label="w.nextLook" @click="turn(1)"><Icon name="next" :size="24" /></button>
    </div>
    <div class="foot">
      <button ref="main" type="button" class="primary go" @click="go('award')">{{ w.thisIsMe }}</button>
    </div>
  </div>
  <CreditAward v-else-if="step === 'award'" :amount="me?.credit ?? 0" :saving="saving" :error="error" @go="save" @back="go('look')" />
</template>

<style scoped>
/* A flat card at the bottom, your character above it, like a game's character select. */
.creation {
  position: absolute;
  left: 50%;
  bottom: max(24px, env(safe-area-inset-bottom));
  translate: -50% 0;
  z-index: 20;
  display: grid;
  gap: 12px;
  width: min(480px, calc(100vw - 32px));
  padding: 22px;
  border-radius: var(--r-xl);
  color: var(--text);
  background: var(--surface);
  box-shadow: var(--shadow);
  animation: menu-pop var(--dur-slow) var(--ease-pop);
}
@keyframes menu-pop {
  from { opacity: 0; transform: translateY(12px) scale(0.96); }
}
h2 { margin: 0; font-size: 26px; line-height: 1.15; font-weight: 700; }
.picker { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 6px; border-radius: var(--r-lg); background: var(--tile); }
.turn { width: 56px; height: 56px; min-height: 0; padding: 0; display: grid; place-items: center; border-radius: var(--r-md); background: var(--surface); color: var(--text); box-shadow: var(--lift); }
.turn:hover:not(:disabled) { background: var(--surface); color: var(--accent); }
.turn:active:not(:disabled) { transform: translateY(2px); }
.count { flex: 1; font-size: 17px; font-weight: 700; text-align: center; font-variant-numeric: tabular-nums; }
.foot { display: flex; gap: 8px; }
.foot .primary { flex: 1 1 0; }
@media (prefers-reduced-motion: reduce) {
  .creation { animation: none; }
}
</style>
