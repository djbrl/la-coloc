// What the friends list shows, and the friend key on a person's card. Pure, so it's tested: the components only draw.
import type { Friend, Friends, FriendStatus } from "../../types";
import { friendWords as w } from "../list/words";

const ORDER: FriendStatus[] = ["online", "idle", "away", "offline"];

const nameOf = (p: { login: string; name: string | null }) => p.name?.trim() || p.login;

/** The most present first (online, idle, away, offline), then by name. */
export function sortFriends(list: Friend[]): Friend[] {
  return [...list].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || nameOf(a).localeCompare(nameOf(b)));
}

/** The line under a friend's name: their status, and the city while they're in one ("Online · Dakar"). */
export function statusLine(f: Pick<Friend, "status" | "city">): string {
  const word = w.status[f.status];
  return f.city && f.status !== "offline" ? w.statusIn(word, f.city) : word;
}

/** How many friends are connected, for the list's band. */
export const connected = (list: Friend[]) => list.filter((f) => f.status !== "offline").length;

/** The count on the friends key: requests waiting for you. Empty when none. */
export function waiting(n: number): string {
  if (n <= 0) return "";
  return n > 9 ? "9+" : String(n);
}

// The friend key on a person's card: add them, say yes to their request, take yours back, or you're friends.
export type FriendKey = { kind: "add" } | { kind: "accept"; id: string } | { kind: "asked"; id: string } | { kind: "friends" };

/**
 * Which friend key a person's card shows. None on yourself, an example person (no request can reach them), when
 * you're logged out, or before your list has loaded (it could say the wrong thing).
 */
export function friendKey(person: { login: string; isMe: boolean; example: boolean }, viewer: { login: string } | null, list: Friends & { loaded: boolean }): FriendKey | null {
  if (!viewer || person.isMe || person.example || !list.loaded) return null;
  if (list.friends.some((f) => f.login === person.login)) return { kind: "friends" };
  const theirs = list.requests.find((r) => r.from.login === person.login);
  if (theirs) return { kind: "accept", id: theirs.id };
  const mine = list.sent.find((s) => s.to.login === person.login);
  if (mine) return { kind: "asked", id: mine.id };
  return { kind: "add" };
}
