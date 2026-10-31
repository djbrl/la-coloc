<script setup lang="ts">
// The one row of tabs in a panel: one word each (an icon on a phone), with a count when something waits there. It's the
// only way to move between a panel's parts (no second row of buttons doing the same). Arrow keys, Home and End
// move between tabs, as in any tab list. With a single tab there's nothing to pick, and it draws nothing.
import Icon from "../house/Icon.vue";
import type { IconName } from "../house/icons";

export interface Tab {
  key: string;
  icon: IconName;
  word: string;
  badge?: number;
  // Something's late or wrong there: the count turns red.
  alert?: boolean;
}

const props = defineProps<{ tabs: Tab[]; modelValue: string; label: string }>();
const emit = defineEmits<{ "update:modelValue": [key: string] }>();

const els: HTMLButtonElement[] = [];

function onKey(e: KeyboardEvent, i: number) {
  const last = props.tabs.length - 1;
  const to = { ArrowRight: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, Home: 0, End: last }[e.key];
  if (to === undefined) return;
  e.preventDefault();
  emit("update:modelValue", props.tabs[to].key);
  els[to]?.focus();
}
</script>

<template>
  <div v-if="tabs.length > 1" class="panel-tabs" role="tablist" :aria-label="label">
    <button
      v-for="(t, i) in tabs"
      :id="`tab-${t.key}`"
      :key="t.key"
      :ref="(el) => (els[i] = el as HTMLButtonElement)"
      type="button"
      role="tab"
      class="tab"
      :aria-selected="modelValue === t.key"
      :aria-controls="`tabpanel-${t.key}`"
      :tabindex="modelValue === t.key ? 0 : -1"
      @click="emit('update:modelValue', t.key)"
      @keydown="onKey($event, i)"
    >
      <span class="ic">
        <Icon :name="t.icon" :size="18" />
        </span>
      <span class="word">{{ t.word }}</span>
      <span v-if="t.badge" class="badge" :class="{ alert: t.alert }" aria-hidden="true">{{ t.badge > 99 ? "99+" : t.badge }}</span>
      <span v-if="t.badge" class="sr-only">, {{ t.badge }}</span>
    </button>
  </div>
</template>

<style scoped>
/* Words on the white, the chosen one on ink. No track, no line under them. */
.panel-tabs {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  scrollbar-width: none;
  flex: none;
}
.panel-tabs::-webkit-scrollbar { display: none; }
.tab {
  flex: 1 1 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 46px;
  padding: 0 6px;
  border-radius: var(--r-sm);
  background: none;
  color: var(--text);
  font: 800 17px/1 var(--font);
  white-space: nowrap;
}
.tab:hover:not(:disabled) { background: var(--tile); }
.tab[aria-selected="true"], .tab[aria-selected="true"]:hover:not(:disabled) { background: var(--text); color: var(--surface); }
.tab:focus-visible { outline-offset: -3px; }
.ic { display: none; }
/* A count: the yellow chip, something waits there. Red when it's late. */
.badge {
  flex: none;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border-radius: 10px;
  background: var(--sticker);
  color: var(--ink);
  font: 800 13px/20px var(--font);
  text-align: center;
}
.badge.alert { background: var(--danger); color: var(--on-danger); }
@media (max-width: 480px) {
  .ic { display: inline-grid; }
  .word { display: none; }
  .tab { padding: 0 12px; }
}
</style>
