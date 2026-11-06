<script setup lang="ts">
// A few choices of which only one is on (which houses to show, say): an icon and one word each, on the same grey
// track as a panel's tabs, so it reads like them. It's a radio group, not tabs: it filters what's below rather
// than showing another part. Arrow keys move the choice, as in any radio group; Tab enters and leaves it.
import Icon from "../lobby/house/Icon.vue";
import type { IconName } from "../lobby/house/icons";

export interface Option {
  key: string;
  icon: IconName;
  word: string;
}

const props = defineProps<{ options: Option[]; modelValue: string; label: string }>();
const emit = defineEmits<{ "update:modelValue": [key: string] }>();

const els: HTMLButtonElement[] = [];

function onKey(e: KeyboardEvent, i: number) {
  const last = props.options.length - 1;
  const to = { ArrowRight: i === last ? 0 : i + 1, ArrowDown: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, ArrowUp: i === 0 ? last : i - 1, Home: 0, End: last }[e.key];
  if (to === undefined) return;
  e.preventDefault();
  emit("update:modelValue", props.options[to].key);
  els[to]?.focus();
}
</script>

<template>
  <div class="choice" role="radiogroup" :aria-label="label">
    <button
      v-for="(o, i) in options"
      :key="o.key"
      :ref="(el) => (els[i] = el as HTMLButtonElement)"
      type="button"
      role="radio"
      class="option"
      :aria-checked="modelValue === o.key"
      :tabindex="modelValue === o.key ? 0 : -1"
      @click="emit('update:modelValue', o.key)"
      @keydown="onKey($event, i)"
    >
      <Icon :name="o.icon" :size="18" />
      <span class="word">{{ o.word }}</span>
    </button>
  </div>
</template>

<style scoped>
/* One control: a grey rail, the chosen option lifted out in white (carte blanche's tabs). */
.choice { display: flex; gap: 4px; padding: 4px; border-radius: var(--tile-r); background: var(--sunken); min-width: 0; }
.option {
  flex: 1 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  background: none;
  color: var(--muted);
  box-shadow: none;
  font: 800 15px/1 var(--font);
  white-space: nowrap;
}
.option:hover:not(:disabled) { background: none; color: var(--text); }
.option[aria-checked="true"], .option[aria-checked="true"]:hover:not(:disabled) { background: var(--surface); color: var(--text); box-shadow: 0 2px 0 rgba(23, 21, 26, 0.14); }
.option:focus-visible { outline-offset: -3px; }
</style>
