<script setup lang="ts">
import type { FridgeNote } from "../types";

defineProps<{ notes: FridgeNote[] }>();

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
// A note's tone shows as a coloured dot; the words stay readable.
const dot = { info: "", warning: "warn", danger: "danger", thanks: "live" } as const;
</script>

<template>
  <div class="fridge">
    <h2>The fridge door.</h2>
    <p class="muted intro">Notes the house leaves on its own: hogging, skipped reviews, thanks.</p>
    <p v-if="!notes.length" class="muted">No notes yet. Quiet house.</p>
    <ul v-else class="rows">
      <li v-for="n in notes" :key="n.id">
        <span class="dot" :class="dot[n.tone]" aria-hidden="true" />
        <span class="text">{{ n.text }}<template v-if="n.count > 1"> <span class="muted">(×{{ n.count }})</span></template></span>
        <time class="end muted small" :datetime="n.at">{{ time(n.at) }}</time>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.fridge { display: grid; gap: 8px; align-content: start; min-width: 0; }
.intro { margin-bottom: 16px; }
.rows > li { flex-wrap: nowrap; align-items: baseline; font-size: 15px; }
.text { flex: 1; min-width: 0; overflow-wrap: anywhere; }
</style>
