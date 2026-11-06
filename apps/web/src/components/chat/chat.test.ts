import { describe, expect, it } from "vitest";
import { badge, boardTabs, chatTabs, linkParts, messageAction, pickTab, shownNews, stripBidi } from "./chat";

describe("the chat sheet's tabs", () => {
  it("are your messages, plus the house when you have one; a visitor gets messages, to be asked to log in", () => {
    expect(chatTabs(null)).toEqual(["dm"]);
    expect(chatTabs({ houses: [] })).toEqual(["dm"]);
    expect(chatTabs({ houses: [{ id: "sacre-coeur" }] })).toEqual(["dm", "house"]);
  });

  it("falls back to the first tab you have", () => {
    expect(pickTab("house", ["dm"])).toBe("dm");
    expect(pickTab("house", ["dm", "house"])).toBe("house");
  });
});

describe("the city board's tabs", () => {
  it("are the city's room and its posts, and reviews only while some are waiting", () => {
    expect(boardTabs(0)).toEqual(["city", "board"]);
    expect(boardTabs(3)).toEqual(["city", "board", "reviews"]);
    expect(pickTab("reviews", boardTabs(0))).toBe("city");
  });
});

describe("Chat on someone you see", () => {
  const viewer = { login: "fatou" };
  it("opens a conversation with a real person", () => {
    expect(messageAction({ isMe: false }, viewer)).toEqual({ kind: "open" });
  });
  it("takes you to log in when you're logged out", () => {
    expect(messageAction({ isMe: false }, null)).toEqual({ kind: "login" });
  });
  it("is only missing on yourself", () => {
    expect(messageAction({ isMe: true }, viewer)).toBeNull();
  });
});

describe("the chat button's count", () => {
  it("says nothing at zero and stops at 9+", () => {
    expect([badge(0), badge(1), badge(9), badge(10), badge(-1)]).toEqual(["", "1", "9", "9+", ""]);
  });
});

describe("what's new in the city", () => {
  const news = { chat: 3, board: 1 };
  it("shows on the board window's City and Board tabs, except the one you're looking at", () => {
    expect(shownNews(news, { open: false, tab: "city" })).toEqual({ chat: 3, board: 1 });
    expect(shownNews(news, { open: true, tab: "city" })).toEqual({ chat: 0, board: 1 });
    expect(shownNews(news, { open: true, tab: "board" })).toEqual({ chat: 3, board: 0 });
    expect(shownNews(news, { open: true, tab: "reviews" })).toEqual({ chat: 3, board: 1 });
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
