// The chat, shared by every page: whether the chat sheet is open and on which tab, the city board's window (the city's
// room and its posts, opened at the board on the market square), your conversations (the count on the chat button),
// and what you blocked and muted. Like the bell (notices.ts): loaded when you log in, when the tab comes back into view,
// and on the lobby's "chat" nudge; never polled. Outages are quiet: it keeps what it had.
import { computed, reactive, ref } from "vue";
import type { BoardTab, ChatTab } from "./components/chat/chat";
import { me, postJSON, type Sent, sendJSON } from "./session";
import type { Conversation, Conversations, SafetyView } from "./types";

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

// What you blocked and muted (GET /api/safety): the people you blocked (their messages' tools say "Unblock"), the
// people and group chats you muted (the "…" menus say "Unmute"). Settings lists all three, each with its way back.
export const safety = reactive<SafetyView & { loaded: boolean }>({ blocked: [], muted: [], groups: [], loaded: false });
// Logins you blocked.
export const blockedLogins = computed(() => safety.blocked.map((p) => p.login));

// The conversation open on the Messages tab (DirectMessages.vue fetches it): the chat sheet's header shows who with.
export const openConversation = ref<Conversation | null>(null);

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
    Object.assign(safety, { blocked: [], muted: [], groups: [], loaded: false });
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

/** Fetches what you blocked and muted (GET /api/safety): Settings lists it, the chat's "…" menus read it. */
export async function loadSafety() {
  if (!me.value) return;
  try {
    const res = await fetch("/api/safety");
    if (!res.ok) return;
    const data = (await res.json()) as SafetyView;
    Object.assign(safety, { blocked: data.blocked ?? [], muted: data.muted ?? [], groups: data.groups ?? [], loaded: true });
  } catch {
    // Keep what we had.
  }
}

// Something changed: what you blocked and muted again, and your conversations (their counts may change).
function after<T>(sent: Sent<T>): Sent<T> {
  if (sent.ok) {
    void loadSafety();
    void loadConversations();
  }
  return sent;
}

/** Blocks someone: no direct messages or friend requests either way, and their words are hidden from you. */
export async function block(login: string): Promise<Sent<unknown>> {
  const sent = await postJSON("/api/chat/blocks", { login });
  if (sent.ok && !blockedLogin(login)) safety.blocked = [{ login, name: null, avatarUrl: null }, ...safety.blocked];
  return after(sent);
}

export async function unblock(login: string): Promise<Sent<unknown>> {
  const sent = await sendJSON("DELETE", `/api/chat/blocks/${encodeURIComponent(login)}`);
  if (sent.ok) safety.blocked = safety.blocked.filter((p) => p.login !== login);
  return after(sent);
}

/** Mutes someone (by login) or a group chat (by channel): no bell and no unread dot from them; their words still show. */
export async function mute(target: { login: string } | { channel: string }): Promise<Sent<unknown>> {
  const sent = await postJSON("/api/safety/mutes", target);
  if (sent.ok && "login" in target && !mutedLogin(target.login)) safety.muted = [{ login: target.login, name: null, avatarUrl: null }, ...safety.muted];
  if (sent.ok && "channel" in target && !mutedChannel(target.channel)) safety.groups = [{ channel: target.channel, place: "city", name: target.channel }, ...safety.groups];
  return after(sent);
}

export async function unmute(target: { login: string } | { channel: string }): Promise<Sent<unknown>> {
  const query = "login" in target ? `login=${encodeURIComponent(target.login)}` : `channel=${encodeURIComponent(target.channel)}`;
  const sent = await sendJSON("DELETE", `/api/safety/mutes?${query}`);
  if (sent.ok && "login" in target) safety.muted = safety.muted.filter((p) => p.login !== target.login);
  if (sent.ok && "channel" in target) safety.groups = safety.groups.filter((g) => g.channel !== target.channel);
  return after(sent);
}

export const blockedLogin = (login: string) => safety.blocked.some((p) => p.login === login);
export const mutedLogin = (login: string) => safety.muted.some((p) => p.login === login);
export const mutedChannel = (channel: string) => safety.groups.some((g) => g.channel === channel);

/** Reports something to the admins: a message or a post by id, a person by login, a group chat by channel. */
export function report(kind: "message" | "post" | "person" | "group", id: string): Promise<Sent<unknown>> {
  return postJSON("/api/reports", { kind, id });
}
