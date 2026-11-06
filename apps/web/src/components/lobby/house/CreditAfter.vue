<script setup lang="ts">
// What paying does to your credit: what you have, and what's left. Short of it: how much, and what to do about it.
import { computed } from "vue";
import { me } from "../../../session";
import { shortBy } from "../../credit";
import { creditWords as w } from "../../words";
import Icon from "./Icon.vue";
import { fcfa } from "./server";

const props = defineProps<{ price: number }>();
const credit = computed(() => me.value?.credit);
const short = computed(() => shortBy(credit.value, props.price));
</script>

<template>
  <div v-if="credit !== undefined" class="after">
    <p class="sums" :aria-label="w.after(fcfa(credit), fcfa(Math.max(0, credit - price)))">
      <Icon name="coin" :size="20" /><span>{{ fcfa(credit) }}</span>
      <template v-if="!short"><span class="to" aria-hidden="true">→</span><strong>{{ fcfa(credit - price) }}</strong></template>
    </p>
    <p v-if="short" class="short" role="status"><strong>{{ w.short(fcfa(short)) }}</strong> {{ w.earnMore }}</p>
  </div>
</template>

<style scoped>
/* A row on the soft paper: your credit now, an arrow, what's left. Short of it: one line saying how much. */
.after { display: grid; gap: 6px; }
.sums { display: flex; align-items: center; gap: 8px; min-height: 40px; margin: 0; padding: 0 14px; border-radius: 12px; background: var(--tile); font-size: 15px; font-weight: 600; line-height: 22px; color: var(--muted); font-variant-numeric: tabular-nums; }
.sums strong { font-weight: 800; color: var(--text); }
.short { margin: 0; font-size: 13px; font-weight: 600; line-height: 18px; color: var(--muted); }
.short strong { color: var(--danger); }
</style>
