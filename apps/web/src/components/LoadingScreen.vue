<script setup lang="ts">
// The city's loading screen, like a game's: a still of the city by day behind (rendered from our own scene,
// public/loading/*.webp, ~80 KB each), and on a red sign the city's name, its greeting and what it means, then the
// progress as a row of windows lighting up one by one. When we can't yet say which city you're heading for, the sign
// says the site's name and what it is. A still rather than a live render: nothing here costs a frame.
import { computed } from "vue";
import { language } from "../i18n";
import { styleFor } from "../lobby/cityStyle";
import { hudWords as w } from "./lobby/words";

const props = withDefaults(defineProps<{ progress?: number | null; leaving?: boolean }>(), { progress: null, leaving: false });

// The city you're arriving in, if the address says (?city=Kigali); we have a picture of some, any of them otherwise.
const PICTURES = ["dakar", "kigali", "marrakech", "tunis"];
const city = new URLSearchParams(location.search).get("city");
const known = PICTURES.find((p) => p === city?.toLowerCase());
const picture = `url("/loading/${known ?? PICTURES[Math.floor(Math.random() * PICTURES.length)]}.webp")`;

const greeting = computed(() => (city ? styleFor(city).greeting : null));
const meaning = computed(() => {
  const g = greeting.value;
  if (!g) return "";
  return language.lang === "fr" ? w.loadingMeaning(g.fr.meaning, g.fr.language) : w.loadingMeaning(g.meaning, g.language);
});

// Eight windows. With no number to show, one window at a time lights up, walking along the row.
const WINDOWS = 8;
const lit = computed(() => (props.progress === null ? 0 : Math.round(props.progress * WINDOWS)));
</script>

<template>
  <div class="loading" :class="{ leaving: props.leaving }" role="status" aria-live="polite">
    <div class="city" :style="{ backgroundImage: picture }" aria-hidden="true" />
    <div class="card sign">
      <div class="sign-frame">
        <header class="sign-band title"><p class="name">{{ city ?? "La Coloc" }}</p></header>
        <div class="sign-body">
          <template v-if="greeting">
            <p class="hello">{{ greeting.text }}</p>
            <p class="means">{{ meaning }}</p>
          </template>
          <p v-else class="means">{{ w.pitch }}</p>
          <div
            class="windows"
            :class="{ unknown: props.progress === null }"
            role="progressbar"
            :aria-label="props.progress === null ? w.loading : w.loadingPercent(Math.round(props.progress * 100))"
            :aria-valuemin="0"
            :aria-valuemax="WINDOWS"
            :aria-valuenow="props.progress === null ? undefined : lit"
          >
            <span v-for="i in WINDOWS" :key="i" class="window" :class="{ on: i <= lit }" :style="{ '--i': i }" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* The city by day fills the screen; the sky colour shows while the picture loads. The sign holds the words. */
.loading {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: grid;
  align-items: end;
  justify-items: center;
  padding: 16px 16px 12vh;
  overflow: hidden;
  background: #cfe2f2;
  transition: opacity 0.6s var(--ease);
}
.loading.leaving { opacity: 0; pointer-events: none; }
.city { position: absolute; inset: 0; background: center / cover no-repeat; }
.card { position: relative; width: min(620px, 100%); }
.title { height: auto; padding: 10px 16px; }
.name { margin: 0; font: 400 68px/1.08 var(--display); text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hello { font-size: 36px; font-weight: 800; line-height: 1.1; }
.means { margin-top: 2px; font-size: 18px; line-height: 1.25; }
.windows { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 5px; margin-top: 14px; padding: 5px; background: var(--ink); }
.window { height: 42px; background: #3a3640; transition: background-color var(--dur) var(--ease); }
.window.on { background: var(--lit-window); }
/* No number yet: the light walks along the row. */
.unknown .window { animation: walk 1.6s steps(1) infinite; animation-delay: calc(var(--i) * 0.2s); }
@keyframes walk {
  0%, 12% { background: var(--lit-window); }
  13%, 100% { background: #3a3640; }
}
@media (max-width: 520px) {
  .name { font-size: clamp(36px, 13vw, 68px); }
  .hello { font-size: 28px; }
  .window { height: 28px; }
}
@media (prefers-reduced-motion: reduce) {
  .unknown .window { animation: none; }
  .unknown .window:nth-child(-n + 3) { background: var(--lit-window); }
  .loading, .window { transition: none; }
}
</style>
