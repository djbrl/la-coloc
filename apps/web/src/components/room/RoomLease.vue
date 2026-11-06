<script setup lang="ts">
// The room's Lease tab, for whoever lives here: your part of this month's bill, how many rooms you rent in this house,
// and ending the lease. The API does the rest (apps/api/src/houses/leases.service.ts): the room is free at once, and
// the rent stays as it is until the end of the month. One confirm step, since a room's project goes with its lease.
import { nextTick, ref, watch } from "vue";
import { loadMe, sendJSON } from "../../session";
import type { RoomManage } from "../../types";
import { dayName } from "../lobby/house/exchange";
import Icon from "../lobby/house/Icon.vue";
import { fcfa } from "../lobby/house/server";
import UiNote, { loud, type Note } from "../UiNote.vue";
import { roomWords as w } from "./words";

const props = defineProps<{ lease: NonNullable<RoomManage["lease"]>; base: string }>();
// `flow`: the confirm step is up, with its own two keys: the panel's foot steps aside meanwhile.
const emit = defineEmits<{ left: []; flow: [on: boolean] }>();

const sure = ref(false);
watch(sure, (on) => emit("flow", on));
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
  <div class="lease">
    <!-- The same numbers as the Overview's, in tiles. -->
    <ul class="stats">
      <li v-if="lease.share !== null" class="stat"><strong>{{ fcfa(lease.share) }}</strong><span>{{ w.lease.share }}</span></li>
      <li class="stat"><strong>{{ lease.rooms }}</strong><span>{{ w.lease.rooms(lease.rooms) }}</span></li>
    </ul>
    <div v-if="sure" ref="flow" class="flow">
      <h3>{{ w.lease.sure }}</h3>
      <p class="tiny">{{ w.lease.until(dayName(lease.until)) }}</p>
      <UiNote v-if="note" :note="note" />
      <div class="flow-nav">
        <button type="button" class="chunk" data-autofocus :disabled="busy" @click="sure = false">{{ w.lease.keepIt }}</button>
        <button type="button" class="chunk danger" :disabled="busy" @click="end"><Icon name="door" :size="18" />{{ w.lease.endIt }}</button>
      </div>
    </div>
    <!-- Quiet: it's the tab's one action, but nobody's here to be nudged into it. -->
    <button v-else type="button" class="chunk small end" @click="ask"><Icon name="door" :size="16" />{{ w.lease.end }}</button>
  </div>
</template>

<style scoped>
.lease { display: grid; gap: 16px; align-content: start; }
.end { justify-self: start; }
.flow { display: grid; gap: 10px; }
.tiny { font: 600 14px/20px var(--font); color: var(--muted); }
</style>
