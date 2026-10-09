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
    <div ref="list" class="list" role="log" aria-live="polite" tabindex="0" aria-label="Messages">
      <p v-if="!messages.length" class="empty muted">No messages yet. Say hello.</p>
      <template v-for="m in messages" :key="m.id">
        <p v-if="!m.author" class="system">{{ m.body }}</p>
        <div v-else class="msg" :class="{ mine: m.author.login === me }">
          <Avatar v-if="m.author.login !== me" :person="m.author" :size="28" decorative />
          <div class="body">
            <p class="meta">
              <template v-if="m.author.login !== me">{{ m.author.name ?? m.author.login }} · </template>
              <span v-else class="sr-only">You · </span>{{ time(m.at) }}
            </p>
            <p class="bubble">{{ m.body }}</p>
          </div>
        </div>
      </template>
    </div>
    <form v-if="postUrl" class="compose" novalidate @submit.prevent="send">
      <input
        v-model="draft"
        :placeholder="placeholder ?? 'Message the house'"
        aria-label="Message"
        maxlength="2000"
        :aria-invalid="!!error"
        @input="error = ''"
      />
      <button class="primary" :disabled="sending">Send</button>
    </form>
    <p v-if="error" class="error small" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.chat { display: grid; gap: 16px; }
.list { display: grid; gap: 14px; align-content: start; max-height: 440px; overflow-y: auto; padding: 4px 2px; }
.empty { padding: 24px 0; }
.system { text-align: center; font-size: 13px; color: var(--muted); padding: 4px 0; }
.msg { display: flex; gap: 10px; align-items: flex-end; max-width: 85%; }
.msg.mine { margin-left: auto; justify-content: flex-end; }
.body { display: grid; gap: 4px; min-width: 0; }
.mine .body { justify-items: end; }
.meta { font-size: 12px; color: var(--muted); padding: 0 14px; }
.bubble { padding: 10px 16px; border-radius: 20px; background: var(--fill); white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.4; }
.mine .bubble { background: var(--accent-fill); color: var(--on-accent); }
.compose { display: flex; gap: 10px; }
.compose input { border-radius: 980px; padding-left: 20px; }
</style>
