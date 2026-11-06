// The chat, shared by every page: whether the chat sheet is open and on which tab, the city board's window (the city's
// room and its posts, opened at the board on the market square), your conversations (the count on the chat button),
// and the people you blocked. Like the bell (notices.ts): loaded when you log in, when the tab comes back into view,
// and on the lobby's "chat" nudge; never polled. Outages are quiet: it keeps what it had.
import { reactive, ref } from "vue";
import type { BoardTab, ChatTab } from "./components/chat/chat";
import { me, postJSON, type Sent, sendJSON } from "./session";
import type { Conversations } from "./types";

export const chatSheet = reactive<{
  open: boolean;
  tab: ChatTab;
  // The person whose conversation is open, on the Messages tab (null: the list).
  with: string | null;
  // The city the board's window is about: where you are in the lobby (LobbyView sets it), or where a reply was said.
  city: string;
}>({ open: false, tab: "dm", with: null, city: "Dakar" });

// The city board's window (lobby/CityBoardWindow.vue, drawn by the lobby): open or not, its tab, and the post open on
// its Board tab (null: the list).
export const boardSheet = reactive<{ open: boolean; tab: BoardTab; post: string | null }>({ open: false, tab: "city", post: null });

export const conversations = reactive<Conversations & { loaded: boolean }>({ unread: 0, items: [], loaded: false });

// Bumped by the lobby's "chat" nudge: an open conversation fetches itself again.
export const chatPing = ref(0);

// Logins you blocked, so their messages' tools say "Unblock".
export const blockedLogins = ref<string[]>([]);

// The last message you sent (or knock you made), by the address it went to: ChatPanel.vue and KnockSteps.vue say so,
// and the city's missions (LobbyView.vue) count it.
export const lastSent = ref<{ url: string } | null>(null);
export const messageSent = (url: string) => (lastSent.value = { url });

/**
 * Opens the chat sheet on a tab: a conversation with someone, or the tab's list. The city's room and a post ("city",
 * "board") live on the city board now: those open its window instead (the bell does, on a reply or a mention).
 */
export function openChat(tab: ChatTab | "city" | "board", opts: { with?: string; post?: string } = {}) {
  if (tab === "city" || tab === "board") {
    openBoard(tab, opts.post ?? null);
    return;
  }
  boardSheet.open = false;
  chatSheet.tab = tab;
  if (tab === "dm") chatSheet.with = opts.with ?? null;
  chatSheet.open = true;
}

/** Opens the city board's window on a tab (and a post, on the Board tab). The chat sheet closes: both dock on the right. */
export function openBoard(tab: BoardTab = "city", post: string | null = null) {
  chatSheet.open = false;
  boardSheet.tab = tab;
  if (tab === "board") boardSheet.post = post;
  boardSheet.open = true;
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
