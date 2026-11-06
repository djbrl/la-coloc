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
/* Carte blanche's head: the picture (a house drawing, a face) in the icon's place, the name at 22, one muted line under
   it with the state's dot. The X (and the back key, a level down) are drawn by the window around it (Inside.vue): the
   head leaves room for them on the right, and on the left for the back key. */
.panel-head { display: flex; flex-direction: row; align-items: flex-start; justify-content: flex-start; gap: 14px; min-height: 80px; padding-left: calc(20px + var(--band-lead, 0px)); padding-right: 72px; }
.lead { flex: none; display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; background: var(--tile); overflow: hidden; }
.t { flex: 1 1 auto; min-width: 0; display: grid; gap: 4px; padding-top: 1px; }
.name { display: flex; align-items: center; gap: 10px; min-width: 0; }
.title { min-width: 0; font-size: 22px; line-height: 28px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.line { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 15px; font-weight: 600; line-height: 21px; color: var(--muted); }
.where { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.panel-head :deep(.status-dot) { width: 10px; height: 10px; }
.aside { flex: none; display: flex; gap: 8px; align-items: center; }
.aside :deep(button), .aside :deep(a.button) { min-height: 40px; padding: 0 12px var(--lip); font-size: 14px; }
</style>
