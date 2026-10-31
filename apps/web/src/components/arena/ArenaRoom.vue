<script setup lang="ts">
// The arena's own chat room, built like the city's (chat/CityRoom.vue) on the same ChatPanel: everyone reads, logged-in
// people write, under the same rules, blocks and limits. It stays live on the city's stream, which the arena store
// already listens to: each "arena" word bumps its `tick`, and the room fetches again with your own login, so the
// people you blocked stay hidden.
import { onMounted, ref, watch } from "vue";
import { useWhenBack } from "../../core";
import { openChat } from "../../conversations";
import { me } from "../../session";
import type { Message } from "../../types";
import ChatPanel from "../ChatPanel.vue";
import { MAX_MESSAGE } from "../chat/chat";
import { arena, arenaUrl } from "./store";
import { arenaWords as w } from "./words";

const props = defineProps<{ city: string }>();
const messages = ref<Message[]>([]);
const chatUrl = () => `${arenaUrl(props.city)}/chat`;

async function fetchRoom() {
  const city = props.city;
  try {
    const res = await fetch(chatUrl());
    if (!res.ok || city !== props.city) return;
    messages.value = ((await res.json()) as { messages: Message[] }).messages;
  } catch {
    // Keep what we had.
  }
}

onMounted(() => void fetchRoom());
watch(
  () => props.city,
  () => {
    messages.value = [];
    void fetchRoom();
  },
);
watch(() => arena.tick, () => void fetchRoom());
useWhenBack(() => void fetchRoom());
</script>

<template>
  <div class="room">
    <h3 class="sr-only">{{ w.roomTitle(city) }}</h3>
    <ChatPanel
      :messages="messages"
      :post-url="me ? chatUrl() : null"
      :me="me?.login ?? null"
      :placeholder="w.sayRoom"
      :max-length="MAX_MESSAGE"
      tools
      @sent="fetchRoom"
      @changed="fetchRoom"
      @message="(login) => openChat('dm', { with: login })"
    />
    <p v-if="!me" class="visitor">
      {{ w.logInToTalk }} <RouterLink to="/login">{{ w.logInWord }}</RouterLink>
    </p>
  </div>
</template>

<style scoped>
.room { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 10px; }
.visitor { flex: none; margin: 0; text-align: center; font-size: 14px; color: var(--muted); }
</style>
