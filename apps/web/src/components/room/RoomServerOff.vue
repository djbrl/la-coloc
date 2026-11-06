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
    <span class="off-icon"><Icon name="server" :size="22" /></span>
    <div class="off-said">
      <p class="off-title">{{ w.serverOff }}</p>
      <p class="off-why">{{ w.serverOffWhy }}</p>
    </div>
    <RouterLink v-if="data.house.chef || data.as === 'chef'" :to="`/houses/${data.house.id}`" class="chunk small">{{ w.connectServer }}</RouterLink>
  </div>
</template>

<style scoped>
/* One calm soft tile: the server's icon on white, what's wrong, and the chef's way forward. */
.off { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 12px; padding: 14px; border-radius: var(--tile-r); background: var(--tile); }
.off-icon { flex: none; display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; background: var(--surface); color: var(--muted); }
.off-said { flex: 1 1 180px; min-width: 0; display: grid; gap: 2px; }
.off-title { font: 800 16px/21px var(--font); }
.off-why { font: 600 14px/20px var(--font); color: var(--muted); }
</style>
