<script setup lang="ts">
// The house's server isn't connected: nothing can go online, so the room says only that, with the way forward for
// the chef. The Overview and Code tabs both stop here.
import Icon from "../lobby/house/Icon.vue";
import type { RoomManage } from "../../types";
import { roomWords as w } from "./words";

defineProps<{ data: Pick<RoomManage, "house" | "as"> }>();
</script>

<template>
  <div class="off">
    <span class="off-icon"><Icon name="server" :size="24" /></span>
    <div class="off-said">
      <p class="off-title">{{ w.serverOff }}</p>
      <p class="off-why">{{ w.serverOffWhy }}</p>
    </div>
    <RouterLink v-if="data.house.chef || data.as === 'chef'" :to="`/houses/${data.house.id}`" class="chunk small">{{ w.connectServer }}</RouterLink>
  </div>
</template>

<style scoped>
/* One calm block. */
.off { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 12px; padding: 14px; border-radius: var(--r-md); background: var(--tile); }
.off-icon { flex: none; display: grid; place-items: center; width: 44px; height: 44px; border-radius: var(--r-sm); background: var(--surface); color: var(--muted); }
.off-said { flex: 1 1 180px; min-width: 0; }
.off-title { font-size: 17px; font-weight: 800; line-height: 1.2; }
.off-why { font-size: 14px; color: var(--muted); }
</style>
