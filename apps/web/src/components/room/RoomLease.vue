<script setup lang="ts">
// The room's Lease tab, for whoever lives here: your part of this month's bill, how many rooms you rent in this house,
// and ending the lease. The API does the rest (apps/api/src/houses/leases.service.ts): the room is free at once, and
// the rent stays as it is until the end of the month. One confirm step, since a room's project goes with its lease.
import { nextTick, ref } from "vue";
import { loadMe, sendJSON } from "../../session";
import type { RoomManage } from "../../types";
import { dayName } from "../lobby/house/exchange";
import Icon from "../lobby/house/Icon.vue";
import { fcfa } from "../lobby/house/server";
import UiNote, { loud, type Note } from "../UiNote.vue";
import { roomWords as w } from "./words";

const props = defineProps<{ lease: NonNullable<RoomManage["lease"]>; base: string }>();
const emit = defineEmits<{ left: [] }>();

const sure = ref(false);
const busy = ref(false);
const note = ref<Note | null>(null);
const flow = ref<HTMLElement | null>(null);

// The confirm step opens on its way back, so a stray Enter keeps the room.
async function ask() {
  sure.value = true;
  await nextTick();
  flow.value?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
}

async function end() {
  busy.value = true;
  note.value = null;
  const res = await sendJSON("POST", `${props.base}/leave`, {});
  busy.value = false;
  if (!res.ok) {
    note.value = loud(res.message);
    return;
  }
  void loadMe();
  emit("left");
}
</script>

<template>
  <ul class="stats">
    <li v-if="lease.share !== null"><strong>{{ fcfa(lease.share) }}</strong> {{ w.lease.share }}</li>
    <li><strong>{{ lease.rooms }}</strong> {{ w.lease.rooms(lease.rooms) }}</li>
  </ul>
  <div v-if="sure" ref="flow" class="flow">
    <h3>{{ w.lease.sure }}</h3>
    <p class="tiny">{{ w.lease.until(dayName(lease.until)) }}</p>
    <UiNote v-if="note" :note="note" />
    <div class="flow-nav">
      <button type="button" class="chunk" data-autofocus :disabled="busy" @click="sure = false">{{ w.lease.keepIt }}</button>
      <button type="button" class="chunk" :disabled="busy" @click="end"><Icon name="door" :size="18" />{{ w.lease.endIt }}</button>
    </div>
  </div>
  <button v-else type="button" class="chunk end" @click="ask"><Icon name="door" :size="18" />{{ w.lease.end }}</button>
</template>

<style scoped>
/* The same numbers as the Overview's. */
.stats { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); gap: 8px; }
.stats li { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 6px; min-height: 58px; padding: 8px 12px; border-radius: var(--r-md); background: var(--tile); font-size: 14px; color: var(--muted); }
.stats strong { font-size: 16px; font-weight: 800; color: var(--text); white-space: nowrap; }
/* Quiet: it's the tab's one action, but nobody's here to be nudged into it. */
.end { align-self: flex-start; }
.flow { display: grid; gap: 10px; }
.tiny { font-size: 14px; color: var(--muted); }
</style>
