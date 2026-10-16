import { describe, expect, it } from "vitest";
import { badge, chatTabs, linkParts, messageAction, pickTab } from "./chat";

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
