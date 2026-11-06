// One window at a time (Jib, 6 11). Every window that floats over the city or its dashboard (the chat, the friends
// list, the bell, the settings, a house's window, the city board, a card, Find, Travel, the big map, the keys, your
// credit) says here how to tell it's open and how to close it, and three rules follow:
//   - opening one closes the others, so they never pile up (the bell no longer opens over the chat);
//   - Esc closes the one on top, the last one opened (App.vue listens);
//   - a click on the city, outside them, closes them all and goes no further: you don't walk (LobbyView.vue).
// Each window keeps its own open state where it already was (chatSheet.open, the bell's own ref…): this only reads it
// and calls `close`. The rules are plain code in `Windows`, tested on their own; `oneAtATime` is the Vue wiring.
import { watch } from "vue";

export type WindowName = "chat" | "friends" | "bell" | "settings" | "board" | "house" | "card" | "find" | "travel" | "map" | "keys" | "credit";

export interface Shown {
  isOpen(): boolean;
  close(): void;
  // It closes itself on Escape wherever the focus is (a house's window goes back a page first; settings; a native
  // dialog): Esc leaves it to it.
  ownEscape?: boolean;
}

export class Windows {
  private shown = new Map<WindowName, Shown>();
  // The order they were opened in, the last one on top.
  private order: WindowName[] = [];
  // Something modal is up that isn't a window (a welcome, a knock's steps): Esc is its own while it says so.
  private holds = new Set<() => boolean>();

  /** Registers a window. Returns the way to let go of it (when the component that owns it goes). */
  add(name: WindowName, w: Shown): () => void {
    this.shown.set(name, w);
    return () => {
      if (this.shown.get(name) !== w) return;
      this.shown.delete(name);
      this.order = this.order.filter((n) => n !== name);
    };
  }

  /** `name` just opened: it goes on top, and every other window still open closes. Returns the ones it closed. */
  opened(name: WindowName): WindowName[] {
    this.order = [...this.order.filter((n) => n !== name), name];
    const closed: WindowName[] = [];
    for (const [other, w] of this.shown)
      if (other !== name && w.isOpen()) {
        w.close();
        closed.push(other);
      }
    return closed;
  }

  /** The windows open right now, the last opened last. One that opened without saying so counts as the oldest. */
  open(): WindowName[] {
    const now = [...this.shown.entries()].filter(([, w]) => w.isOpen()).map(([n]) => n);
    const rank = (n: WindowName) => this.order.indexOf(n);
    return now.sort((a, b) => rank(a) - rank(b));
  }

  /** The window on top, or null. */
  top(): WindowName | null {
    return this.open().at(-1) ?? null;
  }

  anyOpen(): boolean {
    return this.open().length > 0;
  }

  /** Closes every window open (a click on the city). Returns which. */
  closeAll(): WindowName[] {
    const open = this.open();
    for (const n of open) this.shown.get(n)?.close();
    return open;
  }

  /** Something modal says Esc is its own while `fn` is true. Returns the way to stop. */
  hold(fn: () => boolean): () => void {
    this.holds.add(fn);
    return () => this.holds.delete(fn);
  }

  held(): boolean {
    for (const fn of this.holds) if (fn()) return true;
    return false;
  }

  /**
   * Esc: closes the window on top. Nothing when something modal holds Esc, or when the top window closes itself on
   * Escape (it already has). Returns the one it closed.
   */
  escape(): WindowName | null {
    if (this.held()) return null;
    const top = this.top();
    const w = top ? this.shown.get(top) : undefined;
    if (!top || !w || w.ownEscape) return null;
    w.close();
    return top;
  }
}

/** The site's windows: one list for the whole page. */
export const windows = new Windows();

/**
 * Registers a window and watches it: the moment it opens, the others close (synchronously, so two windows opened in
 * the same tick leave the last one open). Returns the way to let go of it, for a component's unmount.
 */
export function oneAtATime(name: WindowName, w: Shown, list: Windows = windows): () => void {
  const remove = list.add(name, w);
  const stop = watch(
    () => w.isOpen(),
    (open) => {
      if (open) list.opened(name);
    },
    { flush: "sync" },
  );
  return () => {
    stop();
    remove();
  };
}

/**
 * The Escape key for the whole page (App.vue): the window on top closes. A key already handled (a window that caught
 * it inside itself stops it, or says so with preventDefault) and a native dialog open (it closes on Escape by itself)
 * are left alone.
 */
export function escapeKey(e: KeyboardEvent, list: Windows = windows): void {
  if (e.key !== "Escape" || e.defaultPrevented) return;
  if (typeof document !== "undefined" && document.querySelector("dialog[open]")) return;
  if (list.escape()) e.preventDefault();
}
