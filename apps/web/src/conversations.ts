// The chat, shared by every page: whether the chat sheet is open and on which tab, your conversations (the count on
// the chat button), and the people you blocked. Like the bell (notices.ts): loaded when you log in, when the tab
// comes back into view, and on the lobby's "chat" nudge; never polled. Outages are quiet: it keeps what it had.
import { reactive, ref } from "vue";
import type { ChatTab } from "./components/chat/chat";
import { me, postJSON, type Sent, sendJSON } from "./session";
import type { Conversations } from "./types";

export const chatSheet = reactive<{
  open: boolean;
  tab: ChatTab;
  // The person whose conversation is open, on the Messages tab (null: the list).
  with: string | null;
  // The post open on the Board tab (null: the list).
  post: string | null;
  // The city the City and Board tabs are about: where you are in the lobby (LobbyView sets it).
  city: string;
}>({ open: false, tab: "dm", with: null, post: null, city: "Dakar" });

export const conversations = reactive<Conversations & { loaded: boolean }>({ unread: 0, items: [], loaded: false });

// Bumped by the lobby's "chat" nudge: an open conversation fetches itself again.
export const chatPing = ref(0);

// Logins you blocked, so their messages' tools say "Unblock".
export const blockedLogins = ref<string[]>([]);

// The last message you sent (or knock you made), by the address it went to: ChatPanel.vue and KnockSteps.vue say so,
// and the city's missions (LobbyView.vue) count it.
export const lastSent = ref<{ url: string } | null>(null);
export const messageSent = (url: string) => (lastSent.value = { url });

/** Opens the chat sheet on a tab: a conversation with someone, a post, or the tab's list. */
export function openChat(tab: ChatTab, opts: { with?: string; post?: string } = {}) {
  chatSheet.tab = tab;
  if (tab === "dm") chatSheet.with = opts.with ?? null;
  if (tab === "board") chatSheet.post = opts.post ?? null;
  chatSheet.open = true;
}

let asking: Promise<void> | null = null;

/** Fetches your conversations. Two calls at once share one request. Logged out, it empties. */
export function loadConversations(): Promise<void> {
  if (!me.value) {
    Object.assign(conversations, { unread: 0, items: [], loaded: false });
    blockedLogins.value = [];
    return Promise.resolve();
  }
  asking ??= (async () => {
    try {
      const res = await fetch("/api/chat/conversations");
      if (!res.ok) return;
      const data = (await res.json()) as Conversations;
      Object.assign(conversations, { unread: data.unread ?? 0, items: data.items ?? [], loaded: true });
    } catch {
      // The core isn't answering: keep what we had.
    } finally {
      asking = null;
    }
  })();
  return asking;
}

/** The lobby's live line said a direct message came in. */
export function chatPinged() {
  chatPing.value++;
  void loadConversations();
}

export async function loadBlocks() {
  if (!me.value) return;
  try {
    const res = await fetch("/api/chat/blocks");
    if (res.ok) blockedLogins.value = ((await res.json()) as { people: { login: string }[] }).people.map((p) => p.login);
  } catch {
    // Keep what we had.
  }
}

/** Blocks someone: no direct messages either way, and their words are hidden from you. */
export async function block(login: string): Promise<Sent<unknown>> {
  const sent = await postJSON("/api/chat/blocks", { login });
  if (sent.ok && !blockedLogins.value.includes(login)) blockedLogins.value = [...blockedLogins.value, login];
  if (sent.ok) void loadConversations();
  return sent;
}

export async function unblock(login: string): Promise<Sent<unknown>> {
  const sent = await sendJSON("DELETE", `/api/chat/blocks/${encodeURIComponent(login)}`);
  if (sent.ok) blockedLogins.value = blockedLogins.value.filter((l) => l !== login);
  if (sent.ok) void loadConversations();
  return sent;
}

/** Reports a message or a post to the admins. */
export function report(kind: "message" | "post", id: string): Promise<Sent<unknown>> {
  return postJSON("/api/reports", { kind, id });
}
