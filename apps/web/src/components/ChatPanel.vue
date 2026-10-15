<script setup lang="ts">
// A chat: the house's living room, or a knock's thread. Messages arrive through the page's live stream;
// this only shows them and sends new ones. Placed in a column with a fixed height (a panel's body), it fills
// what's left: the messages scroll inside it and the composer stays at the bottom. On a page that grows, it grows.
import { nextTick, ref, watch } from "vue";
import { useWhenBack } from "../core";
import { postJSON } from "../session";
import type { Message } from "../types";
import Avatar from "./Avatar.vue";
import { commonWords as w } from "./words";

const props = defineProps<{ messages: Message[]; postUrl: string | null; me: string | null; placeholder?: string }>();

const draft = ref("");
const sending = ref(false);
const error = ref("");
// "The city isn't answering": it's stale once the city is back, so it goes (the draft stays, to be sent again).
const errorDown = ref(false);
useWhenBack(() => {
  if (errorDown.value) error.value = "";
});
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
  // Never twice: Enter while the last message is still on its way does nothing.
  if (sending.value) return;
  error.value = "";
  if (!draft.value.trim()) {
    error.value = w.writeFirst;
    return;
  }
  if (!props.postUrl) return;
  sending.value = true;
  const res = await postJSON(props.postUrl, { body: draft.value });
  sending.value = false;
  // What you typed stays until the city has it: a message that couldn't be sent is still in the box.
  if (res.ok) draft.value = "";
  else error.value = res.message;
  errorDown.value = !res.ok && !!res.down;
}
</script>

<template>
  <div class="chat">
    <div ref="list" class="list" role="log" aria-live="polite" tabindex="0" :aria-label="w.messages">
      <p v-if="!messages.length" class="empty muted">{{ w.noMessages }}</p>
      <template v-for="m in messages" :key="m.id">
        <p v-if="!m.author" class="system">{{ m.body }}</p>
        <div v-else class="msg" :class="{ mine: m.author.login === me }">
          <Avatar v-if="m.author.login !== me" :person="m.author" :size="28" decorative />
          <div class="body">
            <p class="meta">
              <template v-if="m.author.login !== me">{{ m.author.name ?? m.author.login }} · </template>
              <span v-else class="sr-only">{{ w.you }} · </span>{{ time(m.at) }}
            </p>
            <p class="bubble">{{ m.body }}</p>
          </div>
        </div>
      </template>
    </div>
    <form v-if="postUrl" class="compose" novalidate @submit.prevent="send">
      <input
        v-model="draft"
        :placeholder="placeholder ?? w.messageHouse"
        :aria-label="w.message"
        maxlength="2000"
        :aria-invalid="!!error"
        @input="error = ''"
      />
      <button class="primary" :disabled="sending">{{ w.send }}</button>
    </form>
    <p v-if="error" class="error small" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.chat { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 12px; }
.list { position: relative; flex: 1 1 auto; min-height: 120px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; overscroll-behavior: contain; padding: 4px 2px; }
/* Few messages sit at the bottom, by the composer, the way a chat reads. */
.list > :first-child { margin-top: auto; }
.empty { padding: 24px 0; text-align: center; }
.system { text-align: center; font-size: 13px; color: var(--muted); padding: 4px 0; }
.msg { flex: none; display: flex; gap: 10px; align-items: flex-end; max-width: 85%; }
.msg.mine { margin-left: auto; justify-content: flex-end; }
.body { display: grid; gap: 4px; min-width: 0; }
.mine .body { justify-items: end; }
.meta { font-size: 12px; color: var(--muted); padding: 0 14px; }
.bubble { padding: 10px 16px; border-radius: 20px; background: var(--fill); white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.4; }
.mine .bubble { background: var(--accent-fill); color: var(--on-accent); }
.compose { flex: none; display: flex; gap: 10px; }
.compose input { flex: 1 1 auto; min-width: 0; border-radius: 980px; padding-left: 20px; }
/* "Send" stays one word on one line, however narrow the panel. */
.compose button { flex: none; white-space: nowrap; }
.chat > .error { flex: none; }
</style>
