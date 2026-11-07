<script setup lang="ts">
// The city's loading screen: plain red, and in the middle a white window with the city's name (the site's, when we
// can't yet say which city you're heading for), its greeting, and the progress as a row of windows lighting up one by
// one. Nothing here costs a frame.
import { computed } from "vue";
import { styleFor } from "../lobby/cityStyle";
import { hudWords as w } from "./lobby/words";

const props = withDefaults(defineProps<{ progress?: number | null; leaving?: boolean }>(), { progress: null, leaving: false });

// The city you're arriving in, if the address says (?city=Kigali).
const city = new URLSearchParams(location.search).get("city");
const greeting = computed(() => (city ? styleFor(city).greeting : null));

// Eight windows. With no number to show, one window at a time lights up, walking along the row.
const WINDOWS = 8;
const lit = computed(() => (props.progress === null ? 0 : Math.round(props.progress * WINDOWS)));
</script>

<template>
  <div class="loading" :class="{ leaving: props.leaving }" role="status" aria-live="polite">
    <div class="card">
      <img class="mark" src="/logo.svg" alt="" width="56" height="59" />
      <p class="name">{{ city ?? "La Coloc" }}</p>
      <p v-if="greeting" class="hello">{{ greeting.text }}</p>
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
</template>

<style scoped>
/* Over the whole page, the top bar too: only "Offline" (65) stays above it. */
.loading {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 16px;
  background: var(--panel-red);
  transition: opacity 0.6s var(--ease);
}
.loading.leaving { opacity: 0; pointer-events: none; }
.card { width: min(520px, 100%); padding: 20px; border-radius: 15px; background: var(--surface); color: var(--text); text-align: center; box-shadow: var(--shadow); }
.mark { display: block; width: 56px; height: 59px; margin: 4px auto 12px; }
.name { margin: 0; font: 400 52px/1.08 var(--brand); text-transform: uppercase; color: var(--panel-red); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hello { margin: 2px 0 0; font-size: 20px; font-weight: 700; line-height: 1.2; }
.windows { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 5px; margin-top: 16px; padding: 5px; border-radius: var(--r-md); background: var(--ink); }
.window { height: 36px; border-radius: 2px; background: #3a3640; transition: background-color var(--dur) var(--ease); }
.window.on { background: var(--lit-window); }
/* No number yet: the light walks along the row. */
.unknown .window { animation: walk 1.6s steps(1) infinite; animation-delay: calc(var(--i) * 0.2s); }
@keyframes walk {
  0%, 12% { background: var(--lit-window); }
  13%, 100% { background: #3a3640; }
}
@media (max-width: 520px) {
  .name { font-size: clamp(34px, 11vw, 52px); }
  .window { height: 26px; }
}
@media (prefers-reduced-motion: reduce) {
  .unknown .window { animation: none; }
  .unknown .window:nth-child(-n + 3) { background: var(--lit-window); }
  .loading, .window { transition: none; }
}
</style>
