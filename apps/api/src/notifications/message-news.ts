// Who hears about a new message, under their bell. Only messages meant for them, so the bell stays worth opening:
// - post_reply: a reply under a board post tells the post's author, and the people who replied there before.
// - mention: "@login" in a city's room, its arena's or under a post tells that login.
// Nobody hears about their own words, or from someone either of them blocked (as for invitations), and a post whose
// author you blocked is, for you, not there: its replies and mentions don't reach you. A person gets one line per
// kind and place, not one per message: notifications.service.ts updates their unread one instead of adding another.
//
// The city's room itself tells nobody: the chat's tabs count what's new there (chat.service.ts, `cityUnread`).
import { blocks, boardPosts, type Db, messages, type NotificationKind, users } from "@coloc/db";
import { and, eq, inArray, lt, or, sql } from "drizzle-orm";

// The most people one message can mention: enough to call a few friends over, not to ping a whole city.
export const MAX_MENTIONS = 5;

// "@login", not inside an email address or a word. GitHub logins: letters, digits and dashes, 39 at most.
const MENTION_RE = /(?<![\w@.-])@([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))/g;

/** The logins a message mentions, lower-cased, each once, the first few only. */
export function mentionedLogins(body: string): string[] {
  const found = new Set<string>();
  for (const m of body.matchAll(MENTION_RE)) {
    found.add(m[1].toLowerCase());
    if (found.size >= MAX_MENTIONS) break;
  }
  return [...found];
}

export interface MessageNews {
  userId: string;
  kind: Extract<NotificationKind, "post_reply" | "mention">;
}

/**
 * Who a new message in `channel` (city:, arena: or post:), written by `authorId`, is news for. A reply's own
 * recipients don't also get a mention for it: one line is enough.
 */
export async function messageNews(db: Db, channel: string, messageId: number, authorId: string, body: string): Promise<MessageNews[]> {
  const news: MessageNews[] = [];
  let postAuthor: string | null = null;

  if (channel.startsWith("post:")) {
    const [post] = await db.select({ authorId: boardPosts.authorId }).from(boardPosts).where(eq(boardPosts.id, channel.slice(5)));
    if (!post) return [];
    postAuthor = post.authorId;
    // Everyone who replied before this one, and the author.
    const before = await db
      .selectDistinct({ id: messages.authorId })
      .from(messages)
      .where(and(eq(messages.channel, channel), lt(messages.id, messageId)));
    const ids = new Set([post.authorId, ...before.map((b) => b.id).filter((id): id is string => !!id)]);
    for (const id of ids) news.push({ userId: id, kind: "post_reply" });
  }

  const logins = mentionedLogins(body);
  if (logins.length) {
    const named = await db
      .select({ id: users.id })
      .from(users)
      .where(inArray(sql`lower(${users.login})`, logins));
    for (const u of named) if (!news.some((n) => n.userId === u.id)) news.push({ userId: u.id, kind: "mention" });
  }

  const others = news.filter((n) => n.userId !== authorId);
  if (!others.length) return [];
  // Blocks either way with the one who wrote, and, under a post, anyone who blocked its author.
  const ids = others.map((n) => n.userId);
  const rows = await db
    .select()
    .from(blocks)
    .where(
      or(
        and(eq(blocks.blockerId, authorId), inArray(blocks.blockedId, ids)),
        and(eq(blocks.blockedId, authorId), inArray(blocks.blockerId, ids)),
        postAuthor ? and(eq(blocks.blockedId, postAuthor), inArray(blocks.blockerId, ids)) : undefined,
      ),
    );
  const apart = new Set(rows.map((r) => (ids.includes(r.blockerId) ? r.blockerId : r.blockedId)));
  return others.filter((n) => !apart.has(n.userId));
}
