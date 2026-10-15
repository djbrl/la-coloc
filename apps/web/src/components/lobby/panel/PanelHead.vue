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
  <div class="panel-head">
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
.panel-head { display: flex; align-items: center; gap: 14px; min-width: 0; }
.lead { flex: none; }
.t { flex: 1 1 auto; min-width: 0; display: grid; gap: 6px; }
.name { display: flex; align-items: center; gap: 10px; min-width: 0; }
.title { min-width: 0; font-size: 28px; font-weight: 700; line-height: 1.1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.line { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 14px; color: var(--muted); }
.where { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.aside { flex: none; display: flex; gap: 8px; align-items: center; }
@media (max-width: 480px) {
  .name { display: flex; align-items: center; gap: 10px; min-width: 0; }
.title { min-width: 0; font-size: 22px; }
}
</style>
