<script setup lang="ts">
// The end of the quest, like a game's chapter screen: "Well done", your house drawn with your window lit and your name
// on the door, your address, and one way on: the city, which says its own welcome (this marks the quest done on your
// profile). Your room is in the top bar's house link from then on.
import { onMounted, ref } from "vue";
import { bare } from "../panel/words";
import HouseArt from "./HouseArt.vue";
import { tutorialWords as w } from "./words";

defineProps<{ first: string | null; room: string | null; url: string | null; busy: boolean; error?: string }>();
const emit = defineEmits<{ finish: [] }>();

const go = ref<HTMLButtonElement | null>(null);
onMounted(() => setTimeout(() => go.value?.focus({ preventScroll: true }), 0));

function onKey(e: KeyboardEvent) {
  if (e.key === "Enter" || e.key === " ") e.stopPropagation();
}
</script>

<template>
  <div class="layer">
    <section class="card" role="dialog" aria-modal="true" aria-labelledby="quest-home-title" @keydown="onKey">
      <div class="hero">
        <div class="art"><HouseArt :name="room ?? ''" lit /></div>
        <span class="sticker done"><span class="w">{{ w.homeSticker }}</span></span>
      </div>
      <div class="body">
        <h2 id="quest-home-title">{{ first ? w.homeTitle(first) : w.homeTitlePlain }}</h2>
        <p>{{ w.homeLine }}</p>
        <p v-if="url" class="address">{{ bare(url) }}</p>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <div class="nav">
          <button ref="go" type="button" class="primary go" :disabled="busy" @click="emit('finish')">{{ w.intoCity }}</button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.layer { position: absolute; inset: 0; z-index: 30; display: grid; place-items: center; padding: 16px; }
.card { width: min(480px, 100%); overflow: hidden; border-radius: var(--r-md); background: var(--surface); color: var(--text); box-shadow: var(--shadow); animation: menu-pop var(--dur-slow) var(--ease-pop); }
@keyframes menu-pop {
  from { opacity: 0; transform: translateY(12px) scale(0.95); }
}
/* The picture: your house on a flat blue sky, a band of sand under it, the sticker slapped on the corner. */
.hero { position: relative; display: grid; justify-items: center; padding-top: 18px; background: linear-gradient(var(--panel-blue) calc(100% - 22px), var(--wall) 0); }
.art { width: 250px; margin-bottom: 9px; }
.done { position: absolute; top: 14px; left: 14px; padding: 5px 12px 6px 10px; }
.done .w { font-size: 15px; }
.body { display: grid; gap: 8px; padding: 18px 24px 22px; }
h2 { margin: 0; font-size: 44px; line-height: 1; }
p { margin: 0; font-size: 17px; line-height: 1.45; }
.address { font: 600 15px/1.3 var(--num); color: var(--accent); overflow-wrap: anywhere; }
.soft { color: var(--muted); font-size: 15px; }
.error { color: var(--danger); font-size: 15px; }
.nav { display: flex; align-items: center; gap: 10px; margin-top: 10px; }

.go { flex: 1 1 auto; min-height: 60px; padding: 0 24px; border-radius: var(--r-md); font-size: 19px; }
button:focus-visible { outline: 3px solid var(--ring); outline-offset: 2px; }
@media (max-width: 520px) {
  .art { width: 180px; }
  .body { padding: 14px 18px 18px; }
  h2 { font-size: 32px; }
  p { font-size: 15px; }
  .nav { flex-direction: column-reverse; align-items: stretch; }
}
@media (prefers-reduced-motion: reduce) {
  .card { animation: none; }
}
</style>
