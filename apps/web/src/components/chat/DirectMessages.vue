<script setup lang="ts">
// The Messages tab: your conversations as dense rows (a face, a name, the last line, and a dot when some are unread),
// the most recent first; or, once one is picked, the conversation itself, with its composer. A new message comes
// as a nudge on the lobby's live line (chatPing), and the open conversation fetches itself again.
import { computed, ref, watch } from "vue";
import { useWhenBack } from "../../core";
import { chatPing, chatSheet, conversations, loadConversations, openConversation as open } from "../../conversations";
import { me } from "../../session";
import { refusalText } from "../../refusals";
import type { Conversation } from "../../types";
import Avatar from "../Avatar.vue";
import BadgeChip from "../arena/BadgeChip.vue";
import ChatPanel from "../ChatPanel.vue";
import Icon from "../lobby/house/Icon.vue";
import { noteWhen } from "../lobby/house/notes";
import ListRow from "../lobby/panel/ListRow.vue";
import { MAX_MESSAGE } from "./chat";
import { chatWords as w } from "./words";

const error = ref("");

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
    if (login !== before) open.value = null;
    void fetchOpen();
    if (!login) void loadConversations();
  },
  { immediate: true },
);
watch(chatPing, () => void fetchOpen());
useWhenBack(() => void (chatSheet.with ? fetchOpen() : loadConversations()));

const name = computed(() => open.value?.with.name ?? open.value?.with.login ?? chatSheet.with ?? "");
const first = computed(() => name.value.split(" ")[0]);
</script>

<template>
  <div class="dm">
    <!-- One conversation. -->
    <template v-if="chatSheet.with">
      <!-- Who it's with, the way back and the options are in the window's header (ChatSheet.vue). -->
      <h3 class="sr-only">{{ w.with(name) }}</h3>
      <p v-if="error" class="error small" role="alert">{{ error }}</p>
      <p v-else-if="open && !open.canWrite && open.why" class="soft small">{{ open.blocked ? w.whyBlocked : w.whyTheirs }}</p>
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
      <div v-if="!conversations.items.length" class="empty">
        <p class="empty-line">{{ w.noConversations }}</p>
        <p class="empty-hint">{{ w.noConversationsHint }}</p>
      </div>
      <ul v-else class="lines">
        <ListRow v-for="c in conversations.items" :key="c.with.login" :title="c.with.name ?? c.with.login" class="entry" :class="{ unread: c.unread > 0 }">
          <template #lead><Avatar :person="c.with" :size="46" decorative /></template>
          <span class="sub"><span class="handle">@{{ c.with.login }}</span> {{ c.last.mine ? w.you : "" }}{{ c.last.body }}</span>
          <template #meta>
            <span v-if="c.muted" class="muted-mark" role="img" :aria-label="w.muted"><Icon name="mute" :size="14" /></span>
            <BadgeChip v-if="c.with.badge" compact :badge="c.with.badge" />
            <span>{{ noteWhen(c.last.at) }}</span>
          </template>
          <template #end>
            <span v-if="c.unread" class="count" role="img" :aria-label="w.unread(c.unread)" />
            <button type="button" class="open" :aria-label="w.with(c.with.name ?? c.with.login)" @click="chatSheet.with = c.with.login"><Icon name="next" :size="16" /></button>
          </template>
        </ListRow>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.dm { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 10px; }
/* Nothing yet: one line on a soft tile, and where a conversation starts. */
.empty { display: grid; justify-items: center; gap: 8px; padding: 28px 12px; border-radius: var(--tile-r); background: var(--tile); text-align: center; }
.empty-line { margin: 0; font-size: 15px; font-weight: 600; color: var(--muted); }
.empty-hint { margin: 0; font-size: 13px; font-weight: 600; color: var(--muted); }
.lines { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; list-style: none; margin: 0; padding: 0 6px; display: grid; align-content: start; }
.lines :deep(.list-row) { min-height: 58px; }
.lines :deep(.list-row .title) { font-size: 15px; }
.lines :deep(.list-row .sub) { font-size: 13px; }
.handle { font-weight: 600; color: var(--handle); }
/* Unread: the name and the last line in full weight, and a small red dot. */
.entry.unread :deep(.title) { font-weight: 800; }
.entry.unread .sub { color: var(--text); }
.muted-mark { display: inline-flex; color: var(--muted); }
.count { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
.open { width: 32px; padding: 0 !important; justify-content: center; background: none; box-shadow: none; color: var(--muted); }
/* The whole row answers a click, not only the arrow. */
.entry { position: relative; cursor: pointer; }
.entry .open::after { content: ""; position: absolute; inset: 0; }
</style>
