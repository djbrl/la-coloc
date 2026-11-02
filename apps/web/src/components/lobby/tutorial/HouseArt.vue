<script setup lang="ts">
// A little drawing of your first home, for the quest's big moments (the postcard you share, "Well done"): a
// two-storey house with a flat roof, a palm, the sun by day or the moon by night, and one window that is yours,
// lit once your project is online. Your room's name is on the plaque by the door. Drawn here in SVG with the
// site's colour tokens, so it follows day and night and nothing is downloaded.
import { computed } from "vue";

const props = withDefaults(defineProps<{ name?: string; lit?: boolean; label?: string }>(), { name: "", lit: false, label: "" });

// A long room name is cut so the plaque keeps its size.
const plaque = computed(() => (props.name.length > 12 ? `${props.name.slice(0, 11)}…` : props.name));
</script>

<template>
  <svg viewBox="0 0 200 150" class="art" :class="{ lit }" :role="label ? 'img' : undefined" :aria-label="label || undefined" :aria-hidden="label ? undefined : 'true'">
    <defs>
      <radialGradient id="quest-glow" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="var(--window-lit)" stop-opacity="0.75" />
        <stop offset="1" stop-color="var(--window-lit)" stop-opacity="0" />
      </radialGradient>
    </defs>
    <!-- The sun by day, the moon by night: the same circle, in the sky's colour. -->
    <circle cx="28" cy="26" r="11" class="sky-dot" />
    <!-- The ground. -->
    <path d="M6 141h188" class="ground" />
    <!-- The palm, behind the house's right edge. -->
    <path d="M168 141c2-22 1-44-5-62" class="trunk" />
    <path d="M163 80c-10-8-24-8-32-2 M163 80c-4-10-14-18-26-18 M163 80c4-12 14-18 26-16 M163 80c10-4 22 0 28 8 M163 80c2 10 10 18 18 22" class="leaves" />
    <!-- The house: walls, a flat roof with its parapet, a band of wax-print colour under it. -->
    <rect x="34" y="50" width="122" height="91" rx="2" class="wall" />
    <rect x="30" y="42" width="130" height="10" rx="2" class="roof" />
    <path d="M34 56h122" class="band" />
    <!-- Upstairs: three windows, yours in the middle, lit when your project is online. -->
    <circle v-if="lit" cx="95" cy="74" r="26" fill="url(#quest-glow)" class="glow" />
    <rect x="48" y="63" width="24" height="22" rx="2" class="win" />
    <rect x="83" y="63" width="24" height="22" rx="2" class="win mine" />
    <rect x="118" y="63" width="24" height="22" rx="2" class="win" />
    <path d="M95 63v22 M83 74h24" class="bars" />
    <!-- Downstairs: two windows and the door, with your room's name on the plaque above it. -->
    <rect x="48" y="104" width="24" height="20" rx="2" class="win" />
    <rect x="118" y="104" width="24" height="20" rx="2" class="win" />
    <rect x="84" y="108" width="22" height="33" rx="2" class="door" />
    <circle cx="101" cy="125" r="1.6" class="knob" />
    <g v-if="plaque">
      <rect x="70" y="93" width="50" height="11" rx="2" class="plaque" />
      <text x="95" y="101" text-anchor="middle" class="plaque-text">{{ plaque }}</text>
    </g>
  </svg>
</template>

<style scoped>
.art { display: block; width: 100%; height: auto; }
.sky-dot { fill: var(--sky-dot); }
.ground { stroke: var(--line-strong); stroke-width: 2; stroke-linecap: round; }
.trunk { fill: none; stroke: var(--roof); stroke-width: 4; stroke-linecap: round; }
.leaves { fill: none; stroke: var(--leaf); stroke-width: 5; stroke-linecap: round; }
.wall { fill: var(--wall); stroke: var(--line-strong); stroke-width: 1.5; }
.roof { fill: var(--roof); }
/* A wax-print band under the roof: the red, dashed like a printed border. */
.band { stroke: var(--accent-fill); stroke-width: 4; stroke-dasharray: 6 4; }
.win { fill: var(--window-off); stroke: var(--line-strong); stroke-width: 1.2; }
.lit .win.mine { fill: var(--window-lit); stroke: var(--accent-fill); animation: flicker 4s ease-in-out infinite; }
.bars { stroke: var(--line-strong); stroke-width: 1.4; }
.lit .bars { stroke: var(--accent-lip); }
.door { fill: var(--accent-fill); stroke: var(--accent-lip); stroke-width: 1.4; }
.knob { fill: var(--on-accent); }
.plaque { fill: var(--surface); stroke: var(--line-strong); stroke-width: 1; }
.plaque-text { font: 600 7px var(--num); fill: var(--text); }
.glow { animation: glow 4s ease-in-out infinite; }
@keyframes flicker {
  0%, 100% { opacity: 1; }
  47% { opacity: 0.88; }
  50% { opacity: 1; }
}
@keyframes glow {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.75; }
}
@media (prefers-reduced-motion: reduce) {
  .lit .win.mine, .glow { animation: none; }
}
</style>
