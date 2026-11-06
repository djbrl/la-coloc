// The chat's small rules, pure so they are tested (chat.test.ts): which tabs the chat sheet has for you, what a
// person card's "Message" does, the count on the chat button, and how a message's text is cut into plain text and
// links. Nothing here is ever HTML: a link is a part with an address, drawn by Vue as an <a>, the rest as text.

export type ChatTab = "dm" | "city" | "board" | "house";

/** Your tabs: direct messages and your house's living room need a login (and a house); the city's room and board
 *  are for everyone, visitors included, who read them. */
export function chatTabs(viewer: { houses: { id: string }[] } | null): ChatTab[] {
  if (!viewer) return ["city", "board"];
  return viewer.houses.length ? ["dm", "city", "board", "house"] : ["dm", "city", "board"];
}

/** The tab to show: the one asked for if you have it, else the first you have. */
export function pickTab(asked: ChatTab, tabs: ChatTab[]): ChatTab {
  return tabs.includes(asked) ? asked : tabs[0];
}

/** Chat, on anyone you see, example people too (they answer once, saying what they are): open the conversation, or go
 *  to the login page when you're logged out. Only you have no Chat key. */
export type MessageAction = { kind: "open" } | { kind: "login" } | null;

export function messageAction(person: { isMe: boolean }, viewer: { login: string } | null): MessageAction {
  if (person.isMe) return null;
  return viewer ? { kind: "open" } : { kind: "login" };
}

/** The count on the chat button: nothing at zero, "9+" past nine. */
export function badge(unread: number): string {
  if (unread <= 0) return "";
  return unread > 9 ? "9+" : String(unread);
}

export interface CityNews {
  chat: number;
  board: number;
}

/** The city's news as the chat shows it (cityNews.ts): the tab you're looking at has nothing new, by definition. */
export function shownNews(news: CityNews, sheet: { open: boolean; tab: ChatTab }): CityNews {
  return { chat: sheet.open && sheet.tab === "city" ? 0 : news.chat, board: sheet.open && sheet.tab === "board" ? 0 : news.board };
}

/** The chat button's dot: something new in the city, and no direct message waiting (those have their count). */
export function buttonDot(dms: number, news: CityNews): boolean {
  return dms <= 0 && (news.chat > 0 || news.board > 0);
}

export interface TextPart {
  text: string;
  // An http(s) address: drawn as a link that opens in a new tab, without telling the site where you came from.
  href?: string;
}

// An address, until a space or something that can't be part of one. Only http and https: never javascript: or data:.
const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi;

// Unicode's invisible direction controls (embeddings, overrides, isolates, marks). One can make text read backwards
// ("…/‮fdp.exe" shows as "…/exe.pdf"), so what people type is drawn without them.
const BIDI_RE = /[‎‏‪-‮⁦-⁩]/g;
export const stripBidi = (text: string) => text.replace(BIDI_RE, "");

/**
 * Cuts a message into text and links, without direction controls. A link's trailing punctuation (a full stop, a
 * closing bracket) stays text, and a link shows the host the browser will really go to (see `shownAddress`).
 */
export function linkParts(raw: string): TextPart[] {
  const text = stripBidi(raw);
  const parts: TextPart[] = [];
  let at = 0;
  for (const m of text.matchAll(URL_RE)) {
    const href = trimEnd(m[0]);
    const start = m.index ?? 0;
    if (start > at) parts.push({ text: text.slice(at, start) });
    if (isHttp(href)) parts.push({ text: shownAddress(href), href });
    else parts.push({ text: href });
    at = start + href.length;
  }
  if (at < text.length) parts.push({ text: text.slice(at) });
  return parts;
}

// The address as typed, unless its host isn't what the browser will read: then with the real host, in its
// punycode form. "https://gооgle.com" (Cyrillic о's) shows as "https://xn--ggle-55da.com", and
// "https://google.com@evil.example" as "https://evil.example".
function shownAddress(href: string): string {
  const start = href.indexOf("//") + 2;
  const rest = href.slice(start).search(/[/?#]/);
  const end = rest === -1 ? href.length : start + rest;
  const host = new URL(href).host;
  return href.slice(start, end).toLowerCase() === host ? href : `${href.slice(0, start)}${host}${href.slice(end)}`;
}

// "See https://x.dev." keeps the full stop out; a closing bracket stays only if the address opened one
// ("https://en.wikipedia.org/wiki/Dakar_(city)").
function trimEnd(href: string): string {
  const count = (s: string, c: string) => s.split(c).length - 1;
  for (;;) {
    if (/[.,;:!?]$/.test(href)) href = href.slice(0, -1);
    else if (href.endsWith(")") && count(href, "(") < count(href, ")")) href = href.slice(0, -1);
    else if (href.endsWith("]") && count(href, "[") < count(href, "]")) href = href.slice(0, -1);
    else return href;
  }
}

function isHttp(href: string): boolean {
  try {
    const u = new URL(href);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// The board's tags, in the order the form offers them.
export const BOARD_TAGS = ["house", "flatmates", "project", "help", "other"] as const;
export type BoardTag = (typeof BOARD_TAGS)[number];

// The longest a message and a post may be, as the API says (apps/api/src/chat/channels.ts).
export const MAX_MESSAGE = 1000;
export const MAX_TITLE = 100;
export const MAX_POST = 2000;
