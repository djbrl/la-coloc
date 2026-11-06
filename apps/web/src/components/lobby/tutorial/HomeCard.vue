<script setup lang="ts">
// The end of the quest: a plain card in the middle of the screen, "Well done", one line, and one way on: the city,
// which says its own welcome (this marks the quest done on your profile). No drawing: the card's own design carries
// it (Jib, 6 11). Your room is in the top bar's house link from then on.
import { onMounted, ref } from "vue";
import Icon from "../house/Icon.vue";
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
    <section class="card sign" role="dialog" aria-modal="true" aria-labelledby="quest-home-title" aria-describedby="quest-home-line" @keydown="onKey">
      <div class="sign-frame">
        <header class="sign-band">
          <span class="chip"><Icon name="check" :size="22" /></span>
          <h2 id="quest-home-title">{{ first ? w.homeTitle(first) : w.homeTitlePlain }}</h2>
          <p id="quest-home-line" class="sign-sub lines">{{ w.homeLine }}</p>
        </header>
        <div class="sign-body body">
          <p v-if="error" class="error" role="alert">{{ error }}</p>
          <button ref="go" type="button" class="primary go" :disabled="busy" @click="emit('finish')">{{ w.intoCity }}<kbd aria-hidden="true">↵</kbd></button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.layer { position: absolute; inset: 0; z-index: 30; display: grid; place-items: center; padding: 16px; }
.card { width: min(460px, 100%); animation: menu-pop var(--dur-slow) var(--ease-pop); }
@keyframes menu-pop {
  from { opacity: 0; transform: translateY(12px) scale(0.95); }
}
.sign-sub.lines { white-space: normal; }
.body { display: grid; gap: 14px; }
.error { margin: 0; color: var(--danger); font-size: 15px; }
.go { width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
@media (prefers-reduced-motion: reduce) {
  .card { animation: none; }
}
</style>
