<script setup lang="ts">
// The row of big square buttons under a house's name: one icon and one word each. The parent decides which
// actions a viewer gets; this only draws them and reports which one was pressed.
import Icon from "./Icon.vue";
import type { IconName } from "./icons";

export interface Action {
  key: string;
  icon: IconName;
  // The one word under the icon.
  word: string;
  // The main thing to do next: filled with the accent colour.
  primary?: boolean;
  // A small count on the icon (chores waiting, notes on the fridge).
  badge?: number;
  // Something's late: the badge turns red.
  alert?: boolean;
  // A link instead of a button (log in).
  to?: string;
  // A switch-like action shows whether it's on.
  pressed?: boolean;
}

defineProps<{ actions: Action[] }>();
const emit = defineEmits<{ act: [key: string] }>();
</script>

<template>
  <div class="row">
    <template v-for="a in actions" :key="a.key">
      <RouterLink v-if="a.to" :to="a.to" class="tile" :class="{ primary: a.primary }">
        <span class="icon"><Icon :name="a.icon" /></span>
        <span class="word">{{ a.word }}</span>
      </RouterLink>
      <button
        v-else
        type="button"
        class="tile"
        :class="{ primary: a.primary }"
        :aria-pressed="a.pressed === undefined ? undefined : a.pressed"
        @click="emit('act', a.key)"
      >
        <span class="icon">
          <Icon :name="a.icon" />
          <span v-if="a.badge" class="badge" :class="{ alert: a.alert }" aria-hidden="true">{{ a.badge > 99 ? "99+" : a.badge }}</span>
        </span>
        <span class="word">{{ a.word }}</span>
        <span v-if="a.badge" class="sr-only">, {{ a.badge }} waiting</span>
      </button>
    </template>
  </div>
</template>

<style scoped>
.row { display: flex; flex-wrap: wrap; gap: 8px 4px; }
/* A tile is the icon's square plus its word; the whole thing is the button. */
.tile {
  display: grid;
  justify-items: center;
  gap: 6px;
  flex: 0 0 auto;
  width: 76px;
  min-height: 0;
  padding: 6px 2px;
  border-radius: 14px;
  background: none;
  color: var(--text);
  font-size: 12px;
  line-height: 1.2;
  text-decoration: none;
}
.tile:hover:not(:disabled) { background: none; text-decoration: none; }
.tile:hover .icon { background: var(--fill-hover); }
.tile.primary:hover .icon { background: var(--accent-fill-hover); }
.icon {
  position: relative;
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 18px;
  background: var(--fill);
  transition: background-color 0.15s var(--ease);
}
.primary .icon { background: var(--accent-fill); color: var(--on-accent); }
.primary .word { color: var(--accent); font-weight: 600; }
.word { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.badge {
  position: absolute;
  top: -5px;
  right: -5px;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: var(--accent-fill);
  color: var(--on-accent);
  font-size: 11px;
  font-weight: 600;
  line-height: 20px;
  text-align: center;
  box-shadow: 0 0 0 2px var(--bg);
}
.badge.alert { background: var(--danger); }
/* A switch that's on shows the accent ring; off, it's plain. */
.tile[aria-pressed="true"] .icon { box-shadow: inset 0 0 0 2px var(--accent-fill); color: var(--accent); }
@media (max-width: 400px) {
  .tile { width: 64px; }
  .icon { width: 52px; height: 52px; }
}
</style>
