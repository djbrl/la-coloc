<script setup lang="ts">
// The yellow sticker that says a house has free rooms: "1 ROOM FREE", the same on a house's card and in its rooms.
import { cardWords as w } from "./words";

defineProps<{ n: number }>();
</script>

<template>
  <span class="sticker" role="img" :aria-label="w.freeName(n)">
    <span class="n" aria-hidden="true">{{ n }}</span>
    <span class="w" aria-hidden="true">{{ w.freeTop(n) }}<br />{{ w.freeBottom(n) }}</span>
  </span>
</template>
