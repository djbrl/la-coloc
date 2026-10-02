<script setup lang="ts">
import type { FridgeNote } from "../types";

defineProps<{ notes: FridgeNote[] }>();

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
</script>

<template>
  <div class="fridge">
    <h2>The fridge door</h2>
    <p v-if="!notes.length" class="empty">No notes yet. Quiet house.</p>
    <p v-for="n in notes" :key="n.id" class="note" :class="n.tone">
      <span class="time">{{ time(n.at) }}</span> {{ n.text }}
    </p>
  </div>
</template>

<style scoped>
h2 { font-size: 16px; margin: 0 0 8px; }
.empty { color: var(--muted); margin: 0; }
.note { margin: 0 0 6px; padding: 8px 10px; border-radius: 8px; font-size: 13px; border: 1px solid var(--border); background: var(--surface); }
.note.warning { color: var(--warn); }
.note.danger { color: var(--danger); }
.note.thanks { color: var(--live); }
.time { opacity: 0.7; margin-right: 4px; }
</style>
