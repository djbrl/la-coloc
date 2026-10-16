<script setup lang="ts">
// A chat: the house's living room, a knock's thread, a direct conversation, a city's room, or a post's replies.
// Messages arrive through the page's live stream (or a nudge, and the parent fetches); this only shows them and
// sends new ones. Placed in a column with a fixed height (a panel's body), it fills what's left: the messages scroll
// inside it and the composer stays at the bottom. On a page that grows, it grows.
//
// Everything said is plain text: Vue writes it as text, and only http(s) addresses become links (linkParts), which
// open in a new tab without telling the site where you came from.
//
// `tools`: someone else's message gets a "…" with Message, Report and Block. `removable`: your own get a Delete
// (the parent deletes, on `remove`).
import { nextTick, ref, watch } from "vue";
import { useWhenBack } from "../core";
import { block, blockedLogins, report, unblock } from "../conversations";
import { postJSON } from "../session";
import type { Message } from "../types";
import Avatar from "./Avatar.vue";
import { linkParts } from "./chat/chat";
import { chatWords as cw } from "./chat/words";
import Icon from "./lobby/house/Icon.vue";
import { knockLine } from "./said";
import { commonWords as w } from "./words";

// `start`: begins a message for you and puts the cursor after it (reaching out to a flatmate from their card: "Awa, ").
// A new `n` starts it again.
const props = withDefaults(
  defineProps<{
    messages: Message[];
    postUrl: string | null;
    me: string | null;
    placeholder?: string;
    start?: { text: string; n: number } | null;
    maxLength?: number;
    tools?: boolean;
    removable?: boolean;
    // What an empty chat says (default: "No messages yet. Say hello.").
    empty?: string;
  }>(),
  { maxLength: 2000, placeholder: undefined, start: null, empty: undefined },
);
// `sent`: a message went (fetch again). `message`: write to this person. `remove`: delete your message.
// `changed`: you blocked or unblocked someone (what's shown may change).
const emit = defineEmits<{ sent: []; message: [login: string]; remove: [id: string]; changed: [] }>();

const draft = ref("");
const sending = ref(false);
const error = ref("");
// "The city isn't answering": it's stale once the city is back, so it goes (the draft stays, to be sent again).
const errorDown = ref(false);
useWhenBack(() => {
  if (errorDown.value) error.value = "";
});
const list = ref<HTMLElement | null>(null);
const input = ref<HTMLInputElement | null>(null);
watch(
  () => props.start?.n,
  async () => {
    if (!props.start) return;
    if (!draft.value.startsWith(props.start.text)) draft.value = props.start.text + draft.value;
    await nextTick();
    input.value?.focus({ preventScroll: true });
    input.value?.setSelectionRange(draft.value.length, draft.value.length);
  },
  { immediate: true },
);

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
  if (res.ok) {
    draft.value = "";
    emit("sent");
  } else error.value = res.message;
  errorDown.value = !res.ok && !!res.down;
}

// A message's tools: the one open, a report sent, and "Block them?" waiting for a second press.
const menuFor = ref<string | null>(null);
const reported = ref(new Set<string>());
const sureBlock = ref(false);
const toolError = ref("");
async function toggleMenu(id: string) {
  menuFor.value = menuFor.value === id ? null : id;
  sureBlock.value = false;
  toolError.value = "";
  // The last message's tools open under it: bring them into view.
  await nextTick();
  list.value?.querySelector(".tools")?.scrollIntoView({ block: "nearest" });
}
async function doReport(m: Message) {
  const sent = await report("message", m.id);
  if (sent.ok) reported.value = new Set([...reported.value, m.id]);
  else toolError.value = sent.message;
}
async function doBlock(login: string) {
  if (blockedLogins.value.includes(login)) {
    const sent = await unblock(login);
    if (!sent.ok) toolError.value = sent.message;
    else emit("changed");
    return;
  }
  if (!sureBlock.value) {
    sureBlock.value = true;
    return;
  }
  const sent = await block(login);
  if (!sent.ok) toolError.value = sent.message;
  else {
    menuFor.value = null;
    emit("changed");
  }
}
const nameOf = (m: Message) => m.author?.name ?? m.author?.login ?? "";
</script>

<template>
  <div class="chat">
    <div ref="list" class="list" role="log" aria-live="polite" tabindex="0" :aria-label="w.messages">
      <p v-if="!messages.length" class="empty muted">{{ empty ?? w.noMessages }}</p>
      <template v-for="m in messages" :key="m.id">
        <p v-if="!m.author" class="system">{{ knockLine(m) }}</p>
        <div v-else class="msg" :class="{ mine: m.author.login === me }" @keydown.esc.stop="menuFor = null">
          <Avatar v-if="m.author.login !== me" :person="m.author" :size="28" decorative />
          <div class="body">
            <p class="meta">
              <template v-if="m.author.login !== me">{{ nameOf(m) }} · </template>
              <span v-else class="sr-only">{{ w.you }} · </span>{{ time(m.at) }}
            </p>
            <p class="bubble"><template v-for="(part, i) in linkParts(m.body)" :key="i"><a v-if="part.href" :href="part.href" target="_blank" rel="noopener noreferrer nofollow ugc">{{ part.text }}</a><template v-else>{{ part.text }}</template></template></p>
            <!-- A message's tools, under it while open: one row of small keys. -->
            <div v-if="menuFor === m.id" class="tools">
              <template v-if="m.author.login !== me">
                <button type="button" class="tool" @click="emit('message', m.author.login)"><Icon name="chat" :size="15" />{{ cw.message }}</button>
                <span v-if="reported.has(m.id)" class="note" role="status">{{ cw.reported }}</span>
                <button v-else type="button" class="tool" @click="doReport(m)"><Icon name="flag" :size="15" />{{ cw.report }}</button>
                <button type="button" class="tool" :class="{ sure: sureBlock }" :aria-label="blockedLogins.includes(m.author.login) ? cw.unblock : cw.blockName(nameOf(m))" @click="doBlock(m.author.login)">
                  <Icon name="block" :size="15" />{{ blockedLogins.includes(m.author.login) ? cw.unblock : sureBlock ? cw.blockSure : cw.block }}
                </button>
              </template>
              <button v-else type="button" class="tool" :aria-label="cw.removeName" @click="emit('remove', m.id)"><Icon name="trash" :size="15" />{{ cw.remove }}</button>
              <span v-if="toolError" class="note error" role="alert">{{ toolError }}</span>
            </div>
          </div>
          <button
            v-if="me && ((tools && m.author.login !== me) || (removable && m.author.login === me))"
            type="button"
            class="msg-more"
            :aria-label="cw.more(nameOf(m))"
            :aria-expanded="menuFor === m.id"
            @click="toggleMenu(m.id)"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 12h.01M12 12h.01M18 12h.01" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" /></svg>
          </button>
        </div>
      </template>
    </div>
    <form v-if="postUrl" class="compose" novalidate @submit.prevent="send">
      <input
        ref="input"
        v-model="draft"
        :placeholder="placeholder ?? w.messageHouse"
        :aria-label="w.message"
        :maxlength="maxLength"
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
.bubble { padding: 10px 16px; border-radius: var(--r-xl); background: var(--fill); white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.4; }
.bubble a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
.mine .bubble { background: var(--accent-fill); color: var(--on-accent); }
/* The "…" beside a message: quiet until the pointer is on the message or it holds the focus. */
.msg-more { flex: none; align-self: center; width: 28px; height: 28px; min-height: 0; padding: 0; display: grid; place-items: center; border-radius: var(--r-xs); background: none; color: var(--muted); box-shadow: none; opacity: 0; transition: opacity var(--dur-fast) var(--ease); }
.mine .msg-more { order: -1; }
.msg:hover .msg-more, .msg-more:focus-visible, .msg-more[aria-expanded="true"] { opacity: 1; }
.msg-more:hover:not(:disabled) { background: var(--fill); color: var(--text); }
@media (hover: none) {
  .msg-more { opacity: 0.7; }
}
.tools { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 0 6px; }
.tool { display: inline-flex; align-items: center; gap: 5px; min-height: 30px; padding: 0 10px; border-radius: var(--r-sm); background: var(--surface); box-shadow: inset 0 0 0 1px var(--line); font-size: 13px; font-weight: 600; color: var(--text); }
.tool:hover:not(:disabled) { background: var(--fill); }
.tool.sure { background: var(--danger-soft); color: var(--danger); box-shadow: none; }
.note { font-size: 12.5px; color: var(--muted); }
.note.error { color: var(--danger); }
.compose { flex: none; display: flex; gap: 10px; }
.compose input { flex: 1 1 auto; min-width: 0; border-radius: var(--r-pill); padding-left: 20px; }
/* "Send" stays one word on one line, however narrow the panel. */
.compose button { flex: none; white-space: nowrap; }
.chat > .error { flex: none; }
</style>
