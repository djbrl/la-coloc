<script setup lang="ts">
// The city's skyline, for its welcome card: flat blocks of houses against the sun, every lit window someone's project.
// Drawn here in SVG with the site's colours, so nothing is downloaded.
const BLOCKS = [
  { x: 0, y: 66, w: 46, h: 54, fill: "var(--ink)" },
  { x: 40, y: 44, w: 40, h: 76, fill: "var(--panel-blue)" },
  { x: 78, y: 72, w: 52, h: 48, fill: "var(--ink)" },
  { x: 126, y: 30, w: 44, h: 90, fill: "var(--panel-green)" },
  { x: 168, y: 58, w: 58, h: 62, fill: "var(--ink)" },
  { x: 222, y: 40, w: 38, h: 80, fill: "var(--panel-blue)" },
  { x: 258, y: 70, w: 62, h: 50, fill: "var(--ink)" },
];
// Which windows are on: a fixed scatter, so the drawing is the same every time.
const LIT = new Set([1, 4, 5, 9, 12, 16, 17, 22, 25, 27, 30, 33, 38, 41]);
const windows = BLOCKS.flatMap((b) => {
  const out: { x: number; y: number }[] = [];
  for (let y = b.y + 8; y < 112; y += 14) for (let x = b.x + 7; x < b.x + b.w - 9; x += 12) out.push({ x, y });
  return out;
}).map((w, i) => ({ ...w, lit: LIT.has(i % 44) }));
</script>

<template>
  <svg viewBox="0 0 320 120" class="art" aria-hidden="true" preserveAspectRatio="xMidYMax slice">
    <circle cx="232" cy="38" r="26" fill="var(--sticker)" />
    <rect v-for="(b, i) in BLOCKS" :key="i" :x="b.x" :y="b.y" :width="b.w" :height="b.h" :fill="b.fill" />
    <rect v-for="(w, i) in windows" :key="i" :x="w.x" :y="w.y" width="6" height="8" :fill="w.lit ? 'var(--window-lit)' : 'rgba(255, 255, 255, 0.12)'" />
  </svg>
</template>

<style scoped>
.art { display: block; width: 100%; height: 100%; }
</style>
