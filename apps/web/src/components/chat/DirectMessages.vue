<script setup lang="ts">
// The Messages tab: your conversations as dense rows (a face, a name, the last line, and how many you haven't read),
// the most recent first; or, once one is picked, the conversation itself, with its composer. A new message comes
// as a nudge on the lobby's live line (chatPing), and the open conversation fetches itself again.
import { computed, nextTick, ref, watch } from "vue";
import { useWhenBack } from "../../core";
import { block, chatPing, chatSheet, conversations, loadConversations, unblock } from "../../conversations";
import { me } from "../../session";
import { refusalText } from "../../refusals";
import type { Conversation } from "../../types";
import Avatar from "../Avatar.vue";
import ChatPanel from "../ChatPanel.vue";
import Icon from "../lobby/house/Icon.vue";
import { noteWhen } from "../lobby/house/notes";
import ListRow from "../lobby/panel/ListRow.vue";
import { MAX_MESSAGE } from "./chat";
import { chatWords as w } from "./words";

const open = ref<Conversation | null>(null);
const error = ref("");
const sure = ref(false);
const listEl = ref<HTMLElement | null>(null);

async function fetchOpen() {
  const login = chatSheet.with;
  if (!login) {
    open.value = null;
    return;
  }
  try {
    const res = await fetch(`/api/chat/dm/${encodeURIComponent(login)}`);
    const data = await res.json().catch(() => ({}));
    if (chatSheet.with !== login) return;
    if (!res.ok) {
      error.value = typeof data.message === "string" ? refusalText(data) : "";
      return;
    }
    error.value = "";
    open.value = data as Conversation;
    // Opening it read it: the count on the button drops.
    void loadConversations();
  } catch {
    // The core's own card says it can't be reached.
  }
}

watch(
  () => chatSheet.with,
  (login, before) => {
    sure.value = false;
    if (login !== before) open.value = null;
    void fetchOpen();
    if (!login) void loadConversations();
  },
  { immediate: true },
);
watch(chatPing, () => void fetchOpen());
useWhenBack(() => void (chatSheet.with ? fetchOpen() : loadConversations()));

async function back() {
  chatSheet.with = null;
  await nextTick();
  listEl.value?.querySelector<HTMLElement>("button")?.focus();
}

const name = computed(() => open.value?.with.name ?? open.value?.with.login ?? chatSheet.with ?? "");
const first = computed(() => name.value.split(" ")[0]);

async function toggleBlock() {
  const c = open.value;
  if (!c) return;
  if (!c.blocked && !sure.value) {
    sure.value = true;
    return;
  }
  sure.value = false;
  const sent = c.blocked ? await unblock(c.with.login) : await block(c.with.login);
  if (!sent.ok) error.value = sent.message;
  await fetchOpen();
}
</script>

<template>
  <div class="dm">
    <!-- One conversation. -->
    <template v-if="chatSheet.with">
      <div class="head">
        <button type="button" class="icon-key" :aria-label="w.back" @click="back"><Icon name="back" :size="18" /></button>
        <Avatar v-if="open" :person="open.with" :size="30" decorative />
        <h3 :aria-label="w.with(name)">{{ name }}</h3>
        <button
          v-if="open && !open.with.example"
          type="button"
          class="icon-key"
          :class="{ sure, on: open.blocked }"
          :aria-label="open.blocked ? w.unblock : sure ? w.blockSure : w.blockName(name)"
          :title="open.blocked ? w.unblock : sure ? w.blockSure : w.block"
          @click="toggleBlock"
        >
          <Icon name="block" :size="18" />
          <span v-if="sure || open.blocked" class="word">{{ open.blocked ? w.unblock : w.blockSure }}</span>
        </button>
      </div>
      <p v-if="error" class="error small" role="alert">{{ error }}</p>
      <p v-else-if="open && !open.canWrite && open.why" class="soft small">{{ open.with.example ? w.whyExample : open.blocked ? w.whyBlocked : w.whyTheirs }}</p>
      <ChatPanel
        v-if="open"
        :messages="open.messages"
        :post-url="open.canWrite ? `/api/chat/dm/${encodeURIComponent(open.with.login)}` : null"
        :me="me?.login ?? null"
        :placeholder="w.writeTo(first)"
        :max-length="MAX_MESSAGE"
        :start="{ text: '', n: 0 }"
        tools
        @sent="fetchOpen"
        @changed="fetchOpen"
      />
    </template>

    <!-- The list. -->
    <template v-else>
      <p v-if="!conversations.items.length" class="soft empty">{{ w.noConversations }}</p>
      <ul v-else ref="listEl" class="lines">
        <ListRow v-for="c in conversations.items" :key="c.with.login" :title="c.with.name ?? c.with.login" class="entry" :class="{ unread: c.unread > 0 }">
          <template #lead><Avatar :person="c.with" :size="34" decorative /></template>
          <span class="sub">{{ c.last.mine ? w.you : "" }}{{ c.last.body }}</span>
          <template #meta>
            <span>{{ noteWhen(c.last.at) }}</span>
          </template>
          <template #end>
            <span v-if="c.unread" class="count" role="img" :aria-label="w.unread(c.unread)">{{ c.unread > 9 ? "9+" : c.unread }}</span>
            <button type="button" class="open" :aria-label="w.with(c.with.name ?? c.with.login)" @click="chatSheet.with = c.with.login"><Icon name="next" :size="16" /></button>
          </template>
        </ListRow>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.dm { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 10px; }
.head { flex: none; display: flex; align-items: center; gap: 10px; }
.head h3 { flex: 1; min-width: 0; margin: 0; font-size: 17px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.icon-key { flex: none; display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-width: 34px; height: 34px; min-height: 0; padding: 0 8px; border-radius: var(--r-sm); background: none; color: var(--muted); box-shadow: inset 0 0 0 1px var(--line); font-size: 13px; font-weight: 600; }
.icon-key:hover:not(:disabled) { background: var(--fill); color: var(--text); }
.icon-key.sure { background: var(--danger-soft); color: var(--danger); box-shadow: none; }
.icon-key.on { color: var(--danger); }
.empty { margin: 0; padding: 8px 2px; }
.lines { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; list-style: none; margin: 0; padding: 2px; display: grid; gap: 6px; align-content: start; }
.lines :deep(.list-row) { min-height: 54px; padding: 8px 10px; gap: 10px; }
/* Unread: the name and the last line in full weight. */
.entry.unread :deep(.title) { font-weight: 800; }
.entry.unread .sub { color: var(--text); }
.count { min-width: 18px; height: 18px; padding: 0 5px; border-radius: var(--r-pill); background: var(--accent-fill); color: var(--on-accent); font: 700 11px/18px var(--font); text-align: center; }
.open { width: 32px; padding: 0 !important; justify-content: center; background: none; box-shadow: none; color: var(--muted); }
/* The whole row answers a click, not only the arrow. */
.entry { position: relative; cursor: pointer; }
.entry .open::after { content: ""; position: absolute; inset: 0; }
</style>
