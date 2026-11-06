import { describe, expect, it } from "vitest";
import { reactive } from "vue";
import { escapeKey, oneAtATime, type WindowName, Windows } from "./oneWindow";

// A few windows' open states, as the real ones keep theirs (chatSheet.open, the bell's ref…), each registered.
function page(list = new Windows(), own: WindowName[] = []) {
  const state = reactive<Record<string, boolean>>({ chat: false, bell: false, friends: false, house: false, card: false });
  const stops = Object.keys(state).map((n) =>
    oneAtATime(n as WindowName, { isOpen: () => state[n], close: () => (state[n] = false), ownEscape: own.includes(n as WindowName) }, list),
  );
  return { list, state, stop: () => stops.forEach((s) => s()) };
}

const esc = () => ({ key: "Escape", defaultPrevented: false, preventDefault() {} }) as unknown as KeyboardEvent;

describe("one window at a time", () => {
  it("opening the bell closes the chat, and the chat closes the bell", () => {
    const { state } = page();
    state.chat = true;
    state.bell = true;
    expect(state).toMatchObject({ chat: false, bell: true });
    state.chat = true;
    expect(state).toMatchObject({ chat: true, bell: false });
  });

  it("a house's window closes the friends list, and a card closes the house's window", () => {
    const { state } = page();
    state.friends = true;
    state.house = true;
    expect(state).toMatchObject({ friends: false, house: true });
    state.card = true;
    expect(state).toMatchObject({ house: false, card: true });
  });

  it("closing a window opens nothing else", () => {
    const { state } = page();
    state.chat = true;
    state.chat = false;
    expect(Object.values(state).some(Boolean)).toBe(false);
  });

  it("says what it closed", () => {
    const list = new Windows();
    const open = { chat: true, bell: true };
    list.add("chat", { isOpen: () => open.chat, close: () => (open.chat = false) });
    list.add("bell", { isOpen: () => open.bell, close: () => (open.bell = false) });
    expect(list.opened("bell")).toEqual(["chat"]);
    expect(open).toEqual({ chat: false, bell: true });
  });

  it("a window let go of (its component gone) is never closed again", () => {
    const list = new Windows();
    let closed = 0;
    const remove = list.add("card", { isOpen: () => true, close: () => closed++ });
    remove();
    list.add("chat", { isOpen: () => true, close: () => undefined });
    list.opened("chat");
    expect(closed).toBe(0);
    expect(list.open()).toEqual(["chat"]);
  });
});

describe("Escape", () => {
  it("closes the window on top, then nothing more", () => {
    const { list, state } = page();
    state.card = true;
    state.chat = true;
    expect(list.top()).toBe("chat");
    expect(list.escape()).toBe("chat");
    expect(Object.values(state).some(Boolean)).toBe(false);
    expect(list.escape()).toBeNull();
  });

  it("the last one opened is on top, when two are open (one that opened unannounced counts as the oldest)", () => {
    const list = new Windows();
    const open = { card: true, chat: true };
    // The card is open but never said so; the chat did, without closing the card (a window that stays, say).
    list.add("card", { isOpen: () => open.card, close: () => (open.card = false) });
    list.add("chat", { isOpen: () => open.chat, close: () => (open.chat = false) });
    expect(list.open()).toHaveLength(2);
    (list as unknown as { order: string[] }).order = ["chat"];
    expect(list.top()).toBe("chat");
    expect(list.escape()).toBe("chat");
    expect(list.escape()).toBe("card");
    expect(open).toEqual({ card: false, chat: false });
  });

  it("leaves a window that closes itself on Escape to it", () => {
    const { list, state } = page(new Windows(), ["house"]);
    state.house = true;
    expect(list.escape()).toBeNull();
    expect(state.house).toBe(true);
  });

  it("does nothing while something modal holds it", () => {
    const { list, state } = page();
    state.chat = true;
    let modal = true;
    const release = list.hold(() => modal);
    expect(list.escape()).toBeNull();
    expect(state.chat).toBe(true);
    modal = false;
    expect(list.escape()).toBe("chat");
    release();
  });

  it("the page's key: closes the top window and says it handled the key; a key already handled is left alone", () => {
    const { list, state } = page();
    state.bell = true;
    const handled = { ...esc(), defaultPrevented: true } as KeyboardEvent;
    escapeKey(handled, list);
    expect(state.bell).toBe(true);
    let prevented = false;
    escapeKey({ key: "Escape", defaultPrevented: false, preventDefault: () => (prevented = true) } as unknown as KeyboardEvent, list);
    expect(state.bell).toBe(false);
    expect(prevented).toBe(true);
  });

  it("other keys do nothing", () => {
    const { list, state } = page();
    state.chat = true;
    escapeKey({ ...esc(), key: "e" } as KeyboardEvent, list);
    expect(state.chat).toBe(true);
  });
});

describe("a click on the city", () => {
  it("closes every window open", () => {
    const list = new Windows();
    const open = { card: true, chat: true };
    list.add("card", { isOpen: () => open.card, close: () => (open.card = false) });
    list.add("chat", { isOpen: () => open.chat, close: () => (open.chat = false) });
    expect(list.anyOpen()).toBe(true);
    expect(list.closeAll().sort()).toEqual(["card", "chat"]);
    expect(list.anyOpen()).toBe(false);
  });
});
