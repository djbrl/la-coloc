// Your friends, shared by every page: whether the friends list is open, who's in it with their status, the requests
// waiting for your answer and the ones you sent. Like the bell (notices.ts) and the chat (conversations.ts): loaded
// when you log in, when the tab comes back into view, when the bell changes, and on the lobby's "friends" nudge;
// never polled. Outages are quiet: it keeps what it had.
import { reactive } from "vue";
import { acceptNotice, declineNotice, withdrawInvite } from "./notices";
import { me, postJSON, type Sent, sendJSON } from "./session";
import type { Friends } from "./types";

export const friendsSheet = reactive<{ open: boolean }>({ open: false });

export const friends = reactive<Friends & { loaded: boolean }>({ friends: [], requests: [], sent: [], loaded: false });

let asking: Promise<void> | null = null;

/** Fetches the list. Two calls at once share one request. Logged out, it empties. */
export function loadFriends(): Promise<void> {
  if (!me.value) {
    Object.assign(friends, { friends: [], requests: [], sent: [], loaded: false });
    return Promise.resolve();
  }
  asking ??= (async () => {
    try {
      const res = await fetch("/api/friends");
      if (!res.ok) return;
      const data = (await res.json()) as Friends;
      Object.assign(friends, { friends: data.friends ?? [], requests: data.requests ?? [], sent: data.sent ?? [], loaded: true });
    } catch {
      // The core isn't answering: keep what we had.
    } finally {
      asking = null;
    }
  })();
  return asking;
}

// Something changed: the list again, whatever the answer was (a refusal may mean it was already out of date).
async function then<T>(sent: Promise<Sent<T>>): Promise<Sent<T>> {
  const done = await sent;
  await loadFriends();
  return done;
}

/** Asks someone, by login, to be friends. `friends` in the answer: they had asked you, so you're friends now. */
export const askFriend = (login: string) => then(postJSON<{ id: string; friends: boolean }>("/api/friends", { to: login }));
export const removeFriend = (login: string) => then(sendJSON("DELETE", `/api/friends/${encodeURIComponent(login)}`));
// A request is a notification: the bell's own answers, then this list.
export const acceptFriend = (id: string) => then(acceptNotice(id));
export const declineFriend = (id: string) => then(declineNotice(id));
export const takeBackFriend = (id: string) => then(withdrawInvite(id));
