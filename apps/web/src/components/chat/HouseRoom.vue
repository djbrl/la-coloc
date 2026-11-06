<script setup lang="ts">
// The House tab: your house's living room, the same channel as the house window's Channel tab, with the same rule
// (flatmates only: the API sends the channel to them alone). Live through the house's own stream.
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useWhenBack } from "../../core";
import { openChat } from "../../conversations";
import { me } from "../../session";
import { openStream, type Stream } from "../../stream";
import type { HouseView, Message } from "../../types";
import ChatPanel from "../ChatPanel.vue";
import { chatWords as w } from "./words";

const houses = computed(() => me.value?.houses ?? []);
const picked = ref<string | null>(null);
const houseId = computed(() => (picked.value && houses.value.some((h) => h.id === picked.value) ? picked.value : (houses.value[0]?.id ?? null)));
const messages = ref<Message[]>([]);
const houseName = computed(() => houses.value.find((h) => h.id === houseId.value)?.name ?? "");
let stream: Stream | null = null;
// The house shown: the chat sheet's header offers its "…" (Mute, Report) for it.
const emit = defineEmits<{ house: [house: { id: string; name: string } | null] }>();
watch([houseId, houseName], ([id, name]) => emit("house", id ? { id, name } : null), { immediate: true });

async function fetchHouse() {
  const id = houseId.value;
  if (!id) return;
  try {
    const res = await fetch(`/api/houses/${encodeURIComponent(id)}`);
    if (!res.ok || id !== houseId.value) return;
    messages.value = ((await res.json()) as HouseView).channel ?? [];
  } catch {
    // Keep what we had.
  }
}

watch(
  houseId,
  (id) => {
    stream?.close();
    stream = null;
    messages.value = [];
    if (!id) return;
    void fetchHouse();
    stream = openStream(`/api/houses/${encodeURIComponent(id)}/stream`, {
      house: (e) => {
        if (id === houseId.value) messages.value = (JSON.parse(e.data) as HouseView).channel ?? [];
      },
    });
  },
  { immediate: true },
);
useWhenBack(() => void fetchHouse());
onBeforeUnmount(() => stream?.close());
</script>

<template>
  <div class="house">
    <h3 class="sr-only">{{ w.houseTitle(houseName) }}</h3>
    <div v-if="houses.length > 1" class="segmented picks" role="radiogroup" :aria-label="w.pickHouse">
      <button v-for="h in houses" :key="h.id" type="button" role="radio" :aria-checked="houseId === h.id" @click="picked = h.id">{{ h.name }}</button>
    </div>
    <ChatPanel
      v-if="houseId"
      :messages="messages"
      :post-url="`/api/houses/${encodeURIComponent(houseId)}/messages`"
      :me="me?.login ?? null"
      tools
      @sent="fetchHouse"
      @changed="fetchHouse"
      @message="(login) => openChat('dm', { with: login })"
    />
  </div>
</template>

<style scoped>
.house { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 10px; }
.picks { flex: none; flex-wrap: wrap; }
</style>
