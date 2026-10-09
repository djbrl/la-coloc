<script setup lang="ts">
// A chat: the house's living room, or a knock's thread. Messages arrive through the page's live stream;
// this only shows them and sends new ones.
import { nextTick, ref, watch } from "vue";
import { postJSON } from "../session";
import type { Message } from "../types";
import Avatar from "./Avatar.vue";

const props = defineProps<{ messages: Message[]; postUrl: string | null; me: string | null; placeholder?: string }>();

const draft = ref("");
const sending = ref(false);
const error = ref("");
const list = ref<HTMLElement | null>(null);

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

// Follow the conversation: scroll to the newest message when one arrives.
watch(
  () => props.messages.length,
  async () => {
    await nextTick();
    list.value?.scrollTo({ top: list.value.scrollHeight });
  },
  { immediate: true },
);

async function send() {
  error.value = "";
  if (!draft.value.trim()) {
    error.value = "Write something first.";
    return;
  }
  if (!props.postUrl) return;
  sending.value = true;
  const res = await postJSON(props.postUrl, { body: draft.value });
  sending.value = false;
  if (res.ok) draft.value = "";
  else error.value = res.message;
}
</script>

<template>
  <div class="chat">
    <div ref="list" class="list" role="log" aria-live="polite">
      <p v-if="!messages.length" class="empty muted">No messages yet. Say hello.</p>
      <template v-for="m in messages" :key="m.id">
        <p v-if="!m.author" class="system">{{ m.body }}</p>
        <div v-else class="msg" :class="{ mine: m.author.login === me }">
          <Avatar :person="m.author" :size="24" />
          <div class="bubble">
            <span class="meta"><strong>{{ m.author.name ?? m.author.login }}</strong> · {{ time(m.at) }}</span>
            <p>{{ m.body }}</p>
          </div>
        </div>
      </template>
    </div>
    <form v-if="postUrl" class="compose" @submit.prevent="send">
      <input v-model="draft" :placeholder="placeholder ?? 'Message the house'" aria-label="Message" maxlength="2000" @input="error = ''" />
      <button class="primary" :disabled="sending">Send</button>
    </form>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.chat { display: grid; gap: 8px; }
.list { display: grid; gap: 8px; align-content: start; max-height: 360px; overflow-y: auto; padding: 10px; border: 1px solid var(--border); border-radius: 12px; background: var(--sunken); }
.empty { margin: 0; font-size: 13px; }
.system { margin: 2px 0; text-align: center; font-size: 12px; color: var(--muted); }
.msg { display: flex; gap: 8px; align-items: flex-start; }
.bubble { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 6px 10px; min-width: 0; }
.msg.mine .bubble { background: var(--accent-soft); border-color: transparent; }
.meta { font-size: 12px; color: var(--muted); }
.meta strong { color: var(--text); font-weight: 600; }
.bubble p { margin: 2px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.compose { display: flex; gap: 6px; }
.error { margin: 0; font-size: 13px; color: var(--danger); }
</style>
