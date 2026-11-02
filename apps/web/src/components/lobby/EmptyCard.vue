<script setup lang="ts">
// An empty plot: nobody lives here, so you could start a coloc on it.
import { computed } from "vue";
import { me } from "../../session";
import Icon from "./house/Icon.vue";
import LobbyCard from "./LobbyCard.vue";
import { cardWords as w } from "./words";

const props = defineProps<{ plot: { key: string; lot: "shop" | "tower" | "trees"; x: number; z: number } }>();
const emit = defineEmits<{ rent: []; close: [] }>();

const title = computed(() => w.emptyTitle[props.plot.lot]);
</script>

<template>
  <LobbyCard :label="w.emptyLabel" :title="title" :close-name="w.close" @close="emit('close')">
    <div class="menu sill">
      <button v-if="me" class="big primary" @click="emit('rent')"><Icon name="plus" :size="20" /> {{ w.startHere }}</button>
      <RouterLink v-else to="/login" class="big primary"><Icon name="login" :size="20" /> {{ w.logInToStart }}</RouterLink>
    </div>
  </LobbyCard>
</template>
