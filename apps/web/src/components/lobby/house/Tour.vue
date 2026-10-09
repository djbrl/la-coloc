<script setup lang="ts">
// The first time you step inside a house: four short cards at the bottom of the panel, Next or Skip. Seen once
// per browser; the list of tours already seen lives in localStorage under "coloc.tours".
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import Icon from "./Icon.vue";
import type { IconName } from "./icons";

const props = defineProps<{
  // The last card depends on who's looking: the chef of a house in the making, a flatmate, or a visitor.
  last: "chef" | "flatmate" | "visitor";
}>();
const emit = defineEmits<{ done: [] }>();

const KEY = "coloc.tours";
const NAME = "house";

// The tours this browser has finished or skipped. Storage can be missing or blocked: then every tour shows.
function seen(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
function markSeen() {
  try {
    localStorage.setItem(KEY, JSON.stringify([...new Set([...seen(), NAME])]));
  } catch {
    // No storage: the tour will show again next time, which is fine.
  }
}

const open = ref(!seen().includes(NAME));
const step = ref(0);
const next = ref<HTMLButtonElement | null>(null);

const ending: Record<typeof props.last, { icon: IconName; text: string }> = {
  chef: { icon: "server", text: "Your next step: rent the server." },
  flatmate: { icon: "door", text: "Open your room to deploy." },
  visitor: { icon: "knock", text: "Knock on a free room to apply." },
};
const steps = computed((): { icon: IconName; text: string }[] => [
  { icon: "house", text: "A house is a server a few devs share." },
  { icon: "window", text: "Each room is one flatmate's app, live when they push." },
  { icon: "check", text: "Chores are rent: you review your flatmates' pull requests." },
  ending[props.last],
]);
const current = computed(() => steps.value[step.value]);
const isLast = computed(() => step.value === steps.value.length - 1);

function finish() {
  markSeen();
  open.value = false;
  emit("done");
}
function forward() {
  if (isLast.value) finish();
  else step.value++;
}

// Escape skips, but only while the tour has focus: elsewhere it still closes the sheet.
function onKey(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  e.preventDefault();
  e.stopPropagation();
  finish();
}

// The sheet takes focus when it opens; the tour takes it a moment later, so Enter walks the steps.
let timer = 0;
onMounted(() => {
  if (open.value) timer = window.setTimeout(() => next.value?.focus({ preventScroll: true }), 80);
});
onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <div v-if="open" class="tour" role="dialog" aria-label="How a house works" @keydown="onKey">
    <span class="icon" aria-hidden="true"><Icon :name="current.icon" :size="22" /></span>
    <p class="text" aria-live="polite">{{ current.text }}</p>
    <div class="dots" aria-hidden="true">
      <span v-for="(s, i) in steps" :key="i" class="d" :class="{ on: i === step }" />
    </div>
    <div class="nav">
      <button type="button" class="link quiet" @click="finish">Skip</button>
      <button ref="next" type="button" class="primary go" @click="forward">{{ isLast ? "Got it" : "Next" }}</button>
    </div>
  </div>
</template>

<style scoped>
/* Sits at the bottom of the panel while the page scrolls under it. */
.tour {
  position: sticky;
  bottom: 12px;
  z-index: 2;
  display: grid;
  grid-template-columns: auto 1fr auto;
  grid-template-areas: "icon text nav" "icon dots nav";
  align-items: center;
  column-gap: 14px;
  row-gap: 6px;
  padding: 12px 14px;
  border-radius: 18px;
  background: var(--text);
  color: var(--bg);
  box-shadow: var(--shadow);
}
.icon { grid-area: icon; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; background: var(--accent-fill); color: var(--on-accent); }
.text { grid-area: text; font-size: 15px; line-height: 1.33; }
.dots { grid-area: dots; display: flex; gap: 5px; }
.d { width: 6px; height: 6px; border-radius: 50%; background: var(--muted); }
.d.on { width: 16px; border-radius: 3px; background: var(--bg); }
.nav { grid-area: nav; display: flex; align-items: center; gap: 10px; }
.quiet { color: var(--muted); font-size: 14px; }
.go { min-height: 40px; padding: 0 18px; font-size: 15px; }
@media (max-width: 480px) {
  .tour { grid-template-columns: auto 1fr; grid-template-areas: "icon text" "dots nav"; }
  .nav { justify-content: flex-end; }
}
</style>
