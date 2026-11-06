<script setup lang="ts">
// The City tab of the city board's window: the city's public room. Everyone reads its last hundred messages, visitors included; logged-in
// people write. It stays live through the city's stream (a "chat" ping, then a fetch with your own login, so the
// people you blocked stay hidden).
import { onBeforeUnmount, ref, watch } from "vue";
import { useWhenBack } from "../../core";
import { markCitySeen } from "../../cityNews";
import { boardSheet, chatSheet, openChat } from "../../conversations";
import { me } from "../../session";
import { openStream, type Stream } from "../../stream";
import type { Message } from "../../types";
import ChatPanel from "../ChatPanel.vue";
import { MAX_MESSAGE } from "./chat";
import { chatWords as w } from "./words";

const messages = ref<Message[]>([]);
let stream: Stream | null = null;
// The newest message already marked read.
let seen: string | null = null;

const url = (city: string) => `/api/cities/${encodeURIComponent(city)}`;

async function fetchRoom() {
  const city = chatSheet.city;
  try {
    const res = await fetch(`${url(city)}/chat`);
    if (!res.ok || city !== chatSheet.city) return;
    messages.value = ((await res.json()) as { messages: Message[] }).messages;
    // On screen, so read: the City tab's count clears. Once per newest message, not on every fetch.
    const last = messages.value.at(-1)?.id ?? "";
    if (last !== seen) {
      seen = last;
      void markCitySeen(city, "chat");
    }
  } catch {
    // Keep what we had.
  }
}

watch(
  () => chatSheet.city,
  (city) => {
    stream?.close();
    messages.value = [];
    seen = null;
    void fetchRoom();
    stream = openStream(`${url(city)}/stream`, { chat: () => void fetchRoom() });
  },
  { immediate: true },
);
useWhenBack(() => void fetchRoom());
onBeforeUnmount(() => stream?.close());
</script>

<template>
  <div class="room">
    <h3 class="sr-only">{{ w.cityTitle(chatSheet.city) }}</h3>
    <ChatPanel
      :messages="messages"
      :post-url="me ? `${url(chatSheet.city)}/chat` : null"
      :me="me?.login ?? null"
      :placeholder="w.sayCity(chatSheet.city)"
      :max-length="MAX_MESSAGE"
      tools
      @sent="fetchRoom"
      @changed="fetchRoom"
      @message="(login) => openChat('dm', { with: login })"
    />
    <p v-if="!me" class="visitor soft small">
      <RouterLink to="/login" @click="boardSheet.open = false">{{ w.logIn }}</RouterLink>
    </p>
  </div>
</template>

<style scoped>
.room { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 10px; }
.visitor { flex: none; margin: 0; text-align: center; }
</style>
