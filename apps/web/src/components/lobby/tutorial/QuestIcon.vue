<script lang="ts">
// The quest's icons: one per chapter (the stamps on the tracker), and the few its cards use. Simple strokes on a
// 24px grid, drawn by hand like the house's icons (house/icons.ts), so nothing is downloaded and no brand mark is
// copied (GitHub and WhatsApp are named in words, never drawn). Decorative: a word or a hidden name carries the
// meaning.
export const questIcons = {
  // The chapters.
  arrive: "M8 3.5c1.6 0 2.4 1.7 2.4 3.8S9.6 11 8 11 5.6 9.4 5.6 7.3 6.4 3.5 8 3.5z M6.8 14h2.6 M16 8.5c1.6 0 2.4 1.7 2.4 3.8S17.6 16 16 16s-2.4-1.6-2.4-3.7.8-3.8 2.4-3.8z M14.8 19h2.6",
  find: "M12 21s-6-5.6-6-10.5a6 6 0 0 1 12 0C18 15.4 12 21 12 21z M12 8.3a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4z",
  keys: "M15 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z M11 12.9L3.5 20.5 M6 18l2.2 2.2 M8.3 15.7l2 2 M16.5 7.5h.01",
  project: "M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5z M3.5 7.5L12 12l8.5-4.5 M12 12v9",
  launch: "M12 2.8c3 2 4.6 5.6 4.4 9.8L14.2 16H9.8l-2.2-3.4C7.4 8.4 9 4.8 12 2.8z M12 8.2a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z M9.8 16l-2 4.2 3-1.4 M14.2 16l2 4.2-3-1.4",
  open: "M14 4h6v6 M20 4l-9 9 M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  share: "M18 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M6 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M18 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M8.2 10.8l7.6-4.4 M8.2 13.2l7.6 4.4",
  house: "M3 11l9-8 9 8 M5 9.5V21h14V9.5 M10 21v-6h4v6",
  // The cards.
  page: "M6 3h9l4 4v14H6z M15 3v4h4 M9.5 12.5h6 M9.5 16h4",
  repo: "M6 3.5v11 M6 14.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M18 9.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M18 9.5c0 4.5-5 4-12 5.5",
  copy: "M9 9h10v11H9z M5 15V4h10",
  chat: "M20 11.5a8 8 0 0 1-11.7 7.1L4 20l1.2-4A8 8 0 1 1 20 11.5z M9 10h.01 M12 10h.01 M15 10h.01",
  phone: "M8 2.5h8a1 1 0 0 1 1 1v17a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-17a1 1 0 0 1 1-1z M11 18.5h2",
  tick: "M5 12.5l4.5 4.5L19 7.5",
  close: "M6 6l12 12M18 6L6 18",
  back: "M15 6l-6 6 6 6",
  people: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M3 20c.6-3.4 3-5.5 6-5.5s5.4 2.1 6 5.5 M16 4.3a3.5 3.5 0 0 1 0 6.4 M17.5 14.7c1.8.7 3.1 2.6 3.5 5.3",
  reviews: "M9 11l3 3 8-8 M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9",
  search: "M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z M15.5 15.5L20 20",
  lock: "M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  news: "M9 3h6 M10 3v6l-4 5h12l-4-5V3 M12 14v7",
} as const;
export type QuestIconName = keyof typeof questIcons;
</script>

<script setup lang="ts">
withDefaults(defineProps<{ name: QuestIconName; size?: number }>(), { size: 20 });
</script>

<template>
  <svg viewBox="0 0 24 24" :width="size" :height="size" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <path :d="questIcons[name]" />
  </svg>
</template>

<style scoped>
svg { flex: none; display: block; }
</style>
