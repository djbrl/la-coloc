<script setup lang="ts">
// One question per screen: progress dots, then the current step, sliding forward or back.
// The parent renders the step's content in the slot, switching on the same `step` number.
import { onMounted, ref, watch } from "vue";

const props = withDefaults(defineProps<{ step: number; total: number; focusOnMount?: boolean; center?: boolean }>(), { focusOnMount: false, center: false });
const dir = ref<"forward" | "back">("forward");
const root = ref<HTMLElement | null>(null);

watch(
  () => props.step,
  (now, before) => (dir.value = now >= before ? "forward" : "back"),
);

// Keyboard and screen reader users land on the new step: its first field, or else its heading.
function focusStep(el: Element) {
  const target = el.querySelector<HTMLElement>("[data-autofocus]") ?? el.querySelector<HTMLElement>("h1, h2, h3");
  if (!target) return;
  if (!target.matches("input, textarea, select, button, a")) target.tabIndex = -1;
  target.focus({ preventScroll: true });
}

onMounted(() => {
  if (props.focusOnMount && root.value) focusStep(root.value);
});
</script>

<template>
  <div ref="root" class="steps" :class="{ center }">
    <div
      v-if="total > 1"
      class="dots"
      role="progressbar"
      aria-valuemin="1"
      :aria-valuemax="total"
      :aria-valuenow="step"
      :aria-valuetext="`Step ${step} of ${total}`"
    >
      <span v-for="i in total" :key="i" class="d" :class="{ on: i === step, done: i < step }" />
    </div>
    <Transition :name="`step-${dir}`" mode="out-in" @after-enter="focusStep">
      <div :key="step" class="step">
        <slot />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.steps { display: grid; gap: 28px; }
.dots { display: flex; gap: 8px; }
.center .dots { justify-content: center; }
.center .step { text-align: center; justify-items: center; }
.d { width: 8px; height: 8px; border-radius: 50%; background: var(--border); transition: background-color 0.2s, width 0.2s; }
.d.done { background: var(--muted); }
.d.on { width: 22px; border-radius: 4px; background: var(--accent-fill); }
.step { display: grid; gap: 20px; min-width: 0; }
</style>
