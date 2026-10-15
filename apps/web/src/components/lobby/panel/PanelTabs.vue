<script setup lang="ts">
// The one row of tabs in a panel: an icon and one word each, with a count when something waits there. It's the
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
        <span v-if="t.badge" class="badge" :class="{ alert: t.alert }" aria-hidden="true">{{ t.badge > 99 ? "99+" : t.badge }}</span>
      </span>
      <span class="word">{{ t.word }}</span>
      <span v-if="t.badge" class="sr-only">, {{ t.badge }}</span>
    </button>
  </div>
</template>

<style scoped>
/* A sunken track; the chosen tab lifted out on the surface with a hairline and a small lip, like a pressed-out key.
   Icons sit beside their word, so the row stays one line on a 600px panel with six tabs. */
.panel-tabs {
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: var(--r-md);
  background: var(--fill);
  overflow-x: auto;
  scrollbar-width: none;
  flex: none;
}
.panel-tabs::-webkit-scrollbar { display: none; }
.tab {
  flex: 1 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 10px;
  border-radius: var(--r-sm);
  background: none;
  color: var(--muted);
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
}
.tab:hover:not(:disabled) { background: none; color: var(--text); }
.tab[aria-selected="true"] { background: var(--surface); color: var(--text); font-weight: 600; box-shadow: 0 0 0 1px var(--hairline), 0 1px 0 var(--line-strong); }
.tab[aria-selected="true"] .ic { color: var(--accent); }
.tab:focus-visible { outline-offset: -2px; }
.ic { position: relative; display: inline-grid; }
/* A count sits on the icon's corner: leave it room so it doesn't touch the word. */
.ic:has(.badge) { margin-right: 6px; }
.badge {
  position: absolute;
  top: -7px;
  right: -9px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: var(--r-sm);
  background: var(--accent-fill);
  color: var(--on-accent);
  box-shadow: 0 0 0 2px var(--fill);
  font: 500 10px/16px var(--mono);
  text-align: center;
}
.badge.alert { background: var(--danger); color: var(--on-danger); }
.tab[aria-selected="true"] .badge { box-shadow: 0 0 0 2px var(--surface); }
@media (max-width: 480px) {
  .word { display: none; }
  .tab { padding: 0 12px; }
}
</style>
