// Your notifications, shared by every page: the bell in the top bar shows them, the person card reads which
// invitations you've sent, and the lobby's live line says when to fetch again. Loaded when you log in, when the tab
// comes back into view, and on the lobby's nudge; never polled. Outages are quiet: the bell keeps what it had.
import { reactive, ref } from "vue";
import { me, postJSON, type Sent } from "./session";
import type { Notices } from "./types";

export const notices = reactive<Notices & { loaded: boolean }>({ unread: 0, items: [], sent: [], loaded: false });

// Just moved in through an invitation: the lobby hands over the keys and opens the house. Null the rest of the time.
export const movedIn = ref<{ houseId: string; house: string; room: string } | null>(null);
// "Find a plot" from a rent-together notification: the lobby walks you to the nearest empty plot.
export const plotWanted = ref(0);

let asking: Promise<void> | null = null;

/** Fetches the bell. Two calls at once share one request. Logged out, it empties. */
export function loadNotices(): Promise<void> {
  if (!me.value) {
    Object.assign(notices, { unread: 0, items: [], sent: [], loaded: false });
    return Promise.resolve();
  }
  asking ??= (async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = (await res.json()) as Notices;
      Object.assign(notices, { unread: data.unread ?? 0, items: data.items ?? [], sent: data.sent ?? [], loaded: true });
    } catch {
      // The core isn't answering: keep what we had; the core's own banner says so.
    } finally {
      asking = null;
    }
  })();
  return asking;
}

/** Marks what the bell shows as read (all of yours when `ids` is left out). The count drops at once. */
export async function markNoticesRead(ids?: string[]) {
  const unread = notices.items.filter((n) => !n.read && (!ids || ids.includes(n.id)));
  if (!unread.length && ids) return;
  for (const n of unread) n.read = true;
  notices.unread = Math.max(0, notices.unread - unread.length);
  await postJSON("/api/notifications/read", ids ? { ids } : {});
}

// An answer to an invitation, then the bell again (its state changed, and maybe others did).
async function answer<T>(id: string, verb: "accept" | "decline" | "withdraw"): Promise<Sent<T>> {
  const sent = await postJSON<T>(`/api/notifications/${encodeURIComponent(id)}/${verb}`, {});
  await loadNotices();
  return sent;
}

export type Accepted = { kind: string; house: { id: string; name: string; city: string } | null; room: string | null };

export const acceptNotice = (id: string) => answer<Accepted>(id, "accept");
export const declineNotice = (id: string) => answer(id, "decline");
export const withdrawInvite = (id: string) => answer(id, "withdraw");

/** Asks to join a full house's group chat. The house's stream brings the answer. */
export const askToChat = (house: string) => postJSON<{ status: "open" | "accepted" }>(`/api/houses/${encodeURIComponent(house)}/guests`, {});

/** Invites someone to your house's free room, whether or not they live somewhere already. */
export async function inviteToHouse(to: string, house: string, room?: string): Promise<Sent<{ id: string }>> {
  const sent = await postJSON<{ id: string }>("/api/invites/house", room ? { to, house, room } : { to, house });
  await loadNotices();
  return sent;
}

/** Asks someone to share a house (rent a server together), whether or not either of you lives somewhere already. */
export async function rentTogether(to: string): Promise<Sent<{ id: string }>> {
  const sent = await postJSON<{ id: string }>("/api/invites/rent-together", { to });
  await loadNotices();
  return sent;
}
