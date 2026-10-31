<script setup lang="ts">
// A panel's head: its picture (a house drawing, a face), its name, and one line under it: the state's coloured dot,
// then a sentence that says the state in words, and where or what. The `aside` slot holds a small action at the
// head's right (Edit, Copy invite). With a state and nothing to say (a house that's simply running), the dot sits
// beside the name instead of on a line of its own.
import StatusDot from "./StatusDot.vue";
import type { State } from "./words";

defineProps<{ title: string; state?: State | null; line?: string | null }>();
</script>

<template>
  <div class="panel-head sign-band large" :class="{ 'has-lead': $slots.lead }">
    <span v-if="$slots.lead" class="lead"><slot name="lead" /></span>
    <div class="t">
      <div class="name">
        <h2 class="title">{{ title }}</h2>
        <StatusDot v-if="state && !line && !$slots.line" :state="state" />
      </div>
      <p v-if="line || $slots.line" class="line">
        <StatusDot v-if="state" :state="state" />
        <span v-if="line" class="where">{{ line }}</span>
        <slot name="line" />
      </p>
    </div>
    <span v-if="$slots.aside" class="aside"><slot name="aside" /></span>
  </div>
</template>

<style scoped>
/* The title band of a large sign: always 88px, the name at 34, one line under it or none. On the band's right, room
   for the X the window around it draws (Inside.vue). A panel a level down leaves room on its left for the back key. */
.panel-head { flex-direction: row; align-items: center; justify-content: flex-start; gap: 12px; padding-left: calc(16px + var(--band-lead, 0px)); }
.lead { flex: none; display: grid; place-items: center; }
.t { flex: 1 1 auto; min-width: 0; display: grid; gap: 2px; }
.name { display: flex; align-items: center; gap: 10px; min-width: 0; }
.title { min-width: 0; font-size: 34px; line-height: 1.08; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.line { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 16px; line-height: 1.2; }
.where { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* On the band, a dot wears a white ring so green still reads on red. */
.panel-head :deep(.status-dot) { box-shadow: 0 0 0 2px var(--on-panel); }
.aside { flex: none; display: flex; gap: 8px; align-items: center; }
.aside :deep(button), .aside :deep(a.button) { min-height: 46px; padding: 0 14px; background: var(--surface); color: var(--panel); box-shadow: none; font-size: 15px; }
@media (max-width: 480px) {
  .title { font-size: 26px; }
}
</style>
