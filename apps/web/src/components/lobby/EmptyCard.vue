<script setup lang="ts">
// An empty plot: nobody lives here, so you could start a coloc on it.
import { computed } from "vue";
import { me } from "../../session";
import LobbyCard from "./LobbyCard.vue";

const props = defineProps<{ plot: { key: string; lot: "shop" | "tower" | "trees"; x: number; z: number } }>();
const emit = defineEmits<{ rent: []; close: [] }>();

const word = computed(() => ({ shop: "shop", tower: "tower", trees: "lot" })[props.plot.lot]);
</script>

<template>
  <LobbyCard label="An empty plot">
    <h2>Nobody's here.</h2>
    <p>An empty {{ word }}. A house could stand here: a server a few devs rent together, with a room each.</p>
    <div class="actions">
      <button v-if="me" class="pill" @click="emit('rent')">Start a coloc here</button>
      <RouterLink v-else to="/login">Log in to start a coloc here ›</RouterLink>
      <button class="link quiet" @click="emit('close')">Close</button>
    </div>
  </LobbyCard>
</template>
