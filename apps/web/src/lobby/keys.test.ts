import { describe, expect, it } from "vitest";
import { caps, cityKey, cityOwnsKeys, focusOnPage, readLayout } from "./keys";

describe("the city's keys", () => {
  it("walk and turn by place, so AZERTY's Z Q S D walk like QWERTY's W A S D", () => {
    // AZERTY: the key where QWERTY has W prints Z, the one where it has A prints Q.
    expect(cityKey({ code: "KeyW", key: "z" })).toBe("w");
    expect(cityKey({ code: "KeyA", key: "q" })).toBe("a");
    expect(cityKey({ code: "KeyQ", key: "a" })).toBe("q");
    expect(cityKey({ code: "KeyD", key: "d" })).toBe("d");
    // AZERTY's W (where QWERTY has Z) neither walks nor turns.
    expect(cityKey({ code: "KeyZ", key: "w" })).toBe("");
  });

  it("keep the other shortcuts as letters and keys as they are", () => {
    expect(cityKey({ code: "Semicolon", key: "m" })).toBe("m");
    expect(cityKey({ code: "KeyF", key: "F" })).toBe("f");
    expect(cityKey({ code: "ArrowUp", key: "ArrowUp" })).toBe("arrowup");
    expect(cityKey({ code: "BracketRight", key: "]" })).toBe("]");
    expect(cityKey({ code: "", key: "Enter" })).toBe("enter");
  });

  it("show the letters this keyboard prints, when the browser tells", async () => {
    const azerty = new Map([["KeyW", "z"], ["KeyA", "q"], ["KeyQ", "a"], ["KeyS", "s"], ["KeyD", "d"], ["KeyE", "e"], ["KeyR", "r"]]);
    await readLayout({ keyboard: { getLayoutMap: async () => azerty } });
    expect([caps.w, caps.a, caps.s, caps.d, caps.q]).toEqual(["Z", "Q", "S", "D", "A"]);
    // A browser that can't tell keeps what there was.
    await readLayout({});
    await readLayout({ keyboard: { getLayoutMap: () => Promise.reject(new Error("no")) } });
    expect(caps.w).toBe("Z");
  });
});

describe("who the keys belong to", () => {
  const body = { isConnected: true };
  const inside = { isConnected: true, offsetParent: {} as Element, getClientRects: () => ({ length: 1 }) };
  const stage = { contains: (n: unknown) => n === inside };
  const button = { isConnected: true, offsetParent: {} as Element, getClientRects: () => ({ length: 1 }) };
  const gone = { isConnected: false, offsetParent: null, getClientRects: () => ({ length: 0 }) };
  const hidden = { isConnected: true, offsetParent: null, getClientRects: () => ({ length: 0 }) };
  const fixed = { isConnected: true, offsetParent: null, getClientRects: () => ({ length: 1 }) };
  const own = (f: object | null, touched: boolean) => cityOwnsKeys(f as never, body, stage as never, touched);

  it("go to the city when the stage has the focus", () => {
    expect(own(inside, false)).toBe(true);
  });

  it("stay with a button that has the focus, even after the stage was touched", () => {
    expect(own(button, true)).toBe(false);
    // A fixed element (the settings pane) has no offsetParent but is on screen.
    expect(own(fixed, true)).toBe(false);
  });

  it("count nothing, the body, or a focused element that's gone or hidden as the page", () => {
    for (const f of [null, body, gone, hidden]) {
      expect(focusOnPage(f as never, body)).toBe(true);
      expect(own(f, true)).toBe(true);
      expect(own(f, false)).toBe(false);
    }
  });
});
