<script setup lang="ts">
// The end of the quest: "Welcome home". Your house drawn with your window lit and your name on the door, the eight
// stamps all filled, your address, and what comes next. One way on: the city (it marks the quest done on your
// profile). Your room is in the top bar's house link from then on.
import { onMounted, ref } from "vue";
import { bare } from "../panel/words";
import HouseArt from "./HouseArt.vue";
import QuestTracker from "./QuestTracker.vue";
import { type Chapter, CHAPTERS } from "./tutorial";
import { tutorialWords as w } from "./words";

defineProps<{ first: string | null; room: string | null; url: string | null; busy: boolean; error?: string }>();
const emit = defineEmits<{ finish: [] }>();
const all: Chapter[] = [...CHAPTERS];

const go = ref<HTMLButtonElement | null>(null);
onMounted(() => setTimeout(() => go.value?.focus({ preventScroll: true }), 0));

function onKey(e: KeyboardEvent) {
  if (e.key === "Enter" || e.key === " ") e.stopPropagation();
}
</script>

<template>
  <div class="layer">
    <section class="card" role="dialog" aria-modal="true" aria-labelledby="quest-home-title" @keydown="onKey">
      <div class="art"><HouseArt :name="room ?? ''" lit /></div>
      <h2 id="quest-home-title">{{ first ? w.homeTitle(first) : w.homeTitlePlain }}</h2>
      <QuestTracker :stamps="all" :current="null" full />
      <p>{{ w.homeLine }}</p>
      <p v-if="url" class="address">{{ bare(url) }}</p>
      <p class="soft">{{ w.homeNext }}</p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div class="nav">
        <button ref="go" type="button" class="primary go" :disabled="busy" @click="emit('finish')">{{ w.intoCity }}</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.layer { position: absolute; inset: 0; z-index: 30; display: grid; place-items: center; padding: 16px; }
.card { width: min(500px, 100%); display: grid; gap: 12px; padding: 22px 26px; border-radius: var(--r-xl); background: var(--surface); color: var(--text); box-shadow: var(--shadow); text-align: center; animation: menu-pop var(--dur-slow) var(--ease-pop); }
@keyframes menu-pop {
  from { opacity: 0; transform: translateY(12px) scale(0.95); }
}
.art { width: 200px; margin: -6px auto -2px; }
h2 { margin: 0; font-size: 38px; line-height: 1.02; letter-spacing: -0.035em; }
p { margin: 0; font-size: 17px; line-height: 1.45; }
.address { font: 600 15px/1.3 var(--mono); color: var(--accent); overflow-wrap: anywhere; }
.soft { color: var(--muted); font-size: 15px; }
.error { color: var(--danger); font-size: 15px; }
.nav { display: flex; align-items: center; gap: 10px; margin-top: 8px; }

.go { flex: 1 1 auto; min-height: 52px; padding: 0 24px; border-radius: var(--r-md); font-size: 19px; }
button:focus-visible { outline: 3px solid var(--accent-fill); outline-offset: 2px; }
@media (max-width: 520px) {
  .card { padding: 18px; gap: 10px; }
  .art { width: 150px; }
  h2 { font-size: 28px; }
  p { font-size: 15px; }
  .nav { flex-direction: column-reverse; align-items: stretch; }
}
@media (prefers-reduced-motion: reduce) {
  .card { animation: none; }
}
</style>
