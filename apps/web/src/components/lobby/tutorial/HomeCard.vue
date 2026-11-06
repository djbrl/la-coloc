<script setup lang="ts">
// The end of the quest: a plain card in the middle of the screen, "Well done", one line, and one way on: the city,
// which says its own welcome (this marks the quest done on your profile). No drawing: the card's own design carries
// it (Jib, 6 11). Your room is in the top bar's house link from then on.
import { onMounted, ref } from "vue";
import { tutorialWords as w } from "./words";

defineProps<{ first: string | null; busy: boolean; error?: string }>();
const emit = defineEmits<{ finish: [] }>();

const go = ref<HTMLButtonElement | null>(null);
onMounted(() => setTimeout(() => go.value?.focus({ preventScroll: true }), 0));

function onKey(e: KeyboardEvent) {
  if (e.key === "Enter" || e.key === " ") e.stopPropagation();
}
</script>

<template>
  <div class="layer">
    <section class="card" role="dialog" aria-modal="true" aria-labelledby="quest-home-title" aria-describedby="quest-home-line" @keydown="onKey">
      <h2 id="quest-home-title">{{ first ? w.homeTitle(first) : w.homeTitlePlain }}</h2>
      <p id="quest-home-line">{{ w.homeLine }}</p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div class="nav">
        <button ref="go" type="button" class="primary go" :disabled="busy" @click="emit('finish')">{{ w.intoCity }}</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.layer { position: absolute; inset: 0; z-index: 30; display: grid; place-items: center; padding: 16px; }
.card { width: min(440px, 100%); display: grid; gap: 8px; padding: 22px 24px; border-radius: var(--r-md); background: var(--surface); color: var(--text); box-shadow: inset 0 0 0 3px var(--panel-red), var(--shadow); animation: menu-pop var(--dur-slow) var(--ease-pop); }
.card > * { min-width: 0; overflow-wrap: anywhere; }
@keyframes menu-pop {
  from { opacity: 0; transform: translateY(12px) scale(0.95); }
}
h2 { margin: 0; font-size: 40px; line-height: 1.05; }
p { margin: 0; font-size: 17px; line-height: 1.45; }
.error { color: var(--danger); font-size: 15px; }
.nav { display: flex; margin-top: 10px; }
.go { flex: 1 1 auto; min-height: 60px; padding: 0 24px; border-radius: var(--r-md); font-size: 19px; }
button:focus-visible { outline: 3px solid var(--ring); outline-offset: 2px; }
@media (max-width: 520px) {
  .card { padding: 18px; }
  h2 { font-size: 32px; }
  p { font-size: 15px; }
}
@media (prefers-reduced-motion: reduce) {
  .card { animation: none; }
}
</style>
