import { describe, expect, it } from "vitest";
import { badge, chatTabs, linkParts, messageAction, pickTab, stripBidi } from "./chat";

describe("the chat sheet's tabs", () => {
  it("are the city's room and board for a visitor, plus messages once logged in, plus the house when you have one", () => {
    expect(chatTabs(null)).toEqual(["city", "board"]);
    expect(chatTabs({ houses: [] })).toEqual(["dm", "city", "board"]);
    expect(chatTabs({ houses: [{ id: "sacre-coeur" }] })).toEqual(["dm", "city", "board", "house"]);
  });

  it("falls back to the first tab you have", () => {
    expect(pickTab("dm", ["city", "board"])).toBe("city");
    expect(pickTab("board", ["dm", "city", "board"])).toBe("board");
  });
});

describe("Message on a person card", () => {
  const viewer = { login: "fatou" };
  it("opens a conversation with a real person", () => {
    expect(messageAction({ isMe: false, example: false }, viewer)).toEqual({ kind: "open" });
  });
  it("is shown disabled for an example person", () => {
    expect(messageAction({ isMe: false, example: true }, viewer)).toEqual({ kind: "example" });
  });
  it("isn't there for yourself, or when you're logged out", () => {
    expect(messageAction({ isMe: true, example: false }, viewer)).toBeNull();
    expect(messageAction({ isMe: false, example: false }, null)).toBeNull();
  });
});

describe("the chat button's count", () => {
  it("says nothing at zero and stops at 9+", () => {
    expect([badge(0), badge(1), badge(9), badge(10), badge(-1)]).toEqual(["", "1", "9", "9+", ""]);
  });
});

describe("links in a message", () => {
  it("leaves plain text alone, markup included", () => {
    expect(linkParts("<b>hi</b> & bye")).toEqual([{ text: "<b>hi</b> & bye" }]);
  });

  it("finds http and https addresses, keeping trailing punctuation out", () => {
    expect(linkParts("See https://coloc.dev/a?b=1. Or http://x.sn!")).toEqual([
      { text: "See " },
      { text: "https://coloc.dev/a?b=1", href: "https://coloc.dev/a?b=1" },
      { text: ". Or " },
      { text: "http://x.sn", href: "http://x.sn" },
      { text: "!" },
    ]);
  });

  it("keeps a bracket the address opened, and drops one it didn't", () => {
    expect(linkParts("(https://en.wikipedia.org/wiki/Dakar_(city))")).toEqual([
      { text: "(" },
      { text: "https://en.wikipedia.org/wiki/Dakar_(city)", href: "https://en.wikipedia.org/wiki/Dakar_(city)" },
      { text: ")" },
    ]);
  });

  it("never makes a link of another scheme", () => {
    expect(linkParts("javascript:alert(1) data:text/html,x")).toEqual([{ text: "javascript:alert(1) data:text/html,x" }]);
    expect(linkParts("ftp://x.y").every((p) => !p.href)).toBe(true);
  });
});

// From the 16 Oct review: what a link shows is where it goes.
describe("what a link shows", () => {
  const link = (s: string) => linkParts(s).find((p) => p.href)!;

  it("never links a script or data address, however it is spelled", () => {
    for (const s of ["JaVaScRiPt:alert(1)", "xhttps://x.dev javascript:alert(1)", "//evil.example/x", "java\tscript:alert(1)", "https:javascript:alert(1)", "vbscript:msgbox(1)"])
      for (const p of linkParts(s)) if (p.href) expect(p.href).toMatch(/^https?:\/\//i);
  });

  it("shows a lookalike host as the browser will read it, in punycode", () => {
    // Cyrillic "о"s: the text would say gооgle.com.
    const p = link("https://gооgle.com/login");
    expect(p.text).toBe("https://xn--ggle-55da.com/login");
    expect(new URL(p.href!).host).toBe("xn--ggle-55da.com");
    expect(link("https://google.com@evil.example/x").text).toBe("https://evil.example/x");
  });

  it("leaves an ordinary address as typed", () => {
    expect(link("see https://Coloc.dev/a?b=1").text).toBe("https://Coloc.dev/a?b=1");
  });

  it("drops the invisible direction controls that make text read backwards", () => {
    const parts = linkParts("get https://evil.example/‮fdp.exe ⁦now⁩‏");
    expect(parts.map((p) => p.text).join("")).toBe("get https://evil.example/fdp.exe now");
    expect(stripBidi("a‪b‬c‎d")).toBe("abcd");
  });
});
