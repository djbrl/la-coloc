<script setup lang="ts">
// An empty plot: nobody lives here, so you could start a coloc on it.
import { computed } from "vue";
import { me } from "../../session";
import Icon from "./house/Icon.vue";
import LobbyCard from "./LobbyCard.vue";
import { explain } from "./panel/words";
import { cardWords as w } from "./words";

const props = defineProps<{ plot: { key: string; lot: "shop" | "tower" | "trees"; x: number; z: number } }>();
const emit = defineEmits<{ rent: []; close: [] }>();

const title = computed(() => w.emptyTitle[props.plot.lot]);
</script>

<template>
  <LobbyCard :label="w.emptyLabel">
    <h2>{{ title }}</h2>
    <button class="x" :aria-label="w.close" @click="emit('close')">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" /></svg>
    </button>
    <p class="soft small lead">{{ w.nobodyYet }}</p>
    <p>{{ w.couldStand }} {{ explain.house }}</p>
    <div class="menu">
      <button v-if="me" class="big primary" @click="emit('rent')"><Icon name="plus" :size="20" /> {{ w.startHere }}</button>
      <RouterLink v-else to="/login" class="big primary"><Icon name="login" :size="20" /> {{ w.logInToStart }}</RouterLink>
    </div>
  </LobbyCard>
</template>

<style scoped>
.lead { margin-top: -6px; }
</style>
