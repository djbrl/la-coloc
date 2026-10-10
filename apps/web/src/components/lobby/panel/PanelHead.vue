<script setup lang="ts">
// A panel's head: its picture (a house drawing, a face), its name, and one line under it with the state pill and
// a few words of where/what. The `aside` slot holds a small action at the head's right (Edit, Copy invite).
import StatusPill from "./StatusPill.vue";
import type { State } from "./words";

defineProps<{ title: string; state?: State | null; line?: string | null }>();
</script>

<template>
  <div class="panel-head">
    <span v-if="$slots.lead" class="lead"><slot name="lead" /></span>
    <div class="t">
      <h2 class="title">{{ title }}</h2>
      <p class="line">
        <StatusPill v-if="state" :state="state" />
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
.title { font-size: 28px; font-weight: 700; line-height: 1.1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.line { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 14px; color: var(--muted); }
.where { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.aside { flex: none; display: flex; gap: 8px; align-items: center; }
@media (max-width: 480px) {
  .title { font-size: 22px; }
}
</style>
