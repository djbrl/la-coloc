// A city's board: a small forum. A post has a tag (looking for a house, for flatmates, starting a project, help,
// other), a title and a body, all plain text; replies go under it, as messages in the channel "post:<id>". The
// board lists the posts with the most recent activity (a new post or a reply) first. No votes, no edits: the author
// (or an admin) can delete a post or a reply, and that's all. Anyone reads it; logged-in people write.
import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { type BoardTag, boardPosts, type Db, messages, users } from "@coloc/db";
import { and, count, desc, eq, inArray, notInArray } from "drizzle-orm";
import { DB } from "../db/db.module";
import { blockedBy, channelMessages, person } from "../doorbell/queries";
import type { MessageView, PersonView } from "../houses/house.types";
import { BOARD_POSTS, MAX_POST, MAX_TITLE, postChannel } from "./channels";
import { ChatService, cleanText } from "./chat.service";

export const TAGS: BoardTag[] = ["house", "flatmates", "project", "help", "other"];

/** A post as the board lists it. */
export interface PostView {
  id: string;
  city: string;
  tag: BoardTag;
  title: string;
  body: string;
  author: PersonView;
  createdAt: string;
  activeAt: string;
  replies: number;
}

@Injectable()
export class BoardService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly chat: ChatService,
  ) {}

  /** A city's board: the latest active posts first, without those of people you blocked. */
  async board(city: string, viewerId: string | null): Promise<{ posts: PostView[] }> {
    await this.chat.mustBeCity(city);
    const hidden = await blockedBy(this.db, viewerId);
    const rows = await this.db
      .select({ p: boardPosts, u: users })
      .from(boardPosts)
      .innerJoin(users, eq(users.id, boardPosts.authorId))
      .where(and(eq(boardPosts.city, city), hidden.length ? notInArray(boardPosts.authorId, hidden) : undefined))
      .orderBy(desc(boardPosts.activeAt))
      .limit(BOARD_POSTS);
    const counts = await this.replyCounts(rows.map((r) => r.p.id), hidden);
    return { posts: rows.map((r) => view(r.p, r.u, counts.get(postChannel(r.p.id)) ?? 0)) };
  }

  /** One post and its replies (oldest first). A post by someone you blocked is, for you, not there. */
  async post(id: string, viewerId: string | null): Promise<{ post: PostView; replies: MessageView[] }> {
    const { p, u } = await this.find(id);
    if ((await blockedBy(this.db, viewerId)).includes(p.authorId)) throw new NotFoundException({ message: "There's no such post.", code: "noPost" });
    const replies = await channelMessages(this.db, postChannel(p.id), 200, viewerId);
    return { post: view(p, u, replies.length), replies };
  }

  async create(city: string, authorId: string, input: { tag: BoardTag; title: string; body: string }): Promise<{ id: string }> {
    await this.chat.mustBeCity(city);
    const title = cleanText(input.title, MAX_TITLE);
    const body = cleanText(input.body, MAX_POST);
    this.chat.brake(authorId, "posts");
    const now = new Date();
    const [row] = await this.db.insert(boardPosts).values({ city, authorId, tag: input.tag, title, body, createdAt: now, activeAt: now }).returning({ id: boardPosts.id });
    // You've seen the board you just posted on.
    await this.chat.markCityRead(city, authorId, "board");
    this.chat.changes.next({ city, what: "board" });
    return { id: row.id };
  }

  async reply(postId: string, authorId: string, body: string): Promise<{ id: string }> {
    const { p } = await this.find(postId);
    const id = await this.chat.write(postChannel(p.id), authorId, body);
    await this.db.update(boardPosts).set({ activeAt: new Date() }).where(eq(boardPosts.id, p.id));
    this.chat.changes.next({ city: p.city, what: "board" });
    return { id };
  }

  /** Deletes a post and its replies. Only its author, or an admin. */
  async deletePost(postId: string, userId: string, admin: boolean) {
    const { p } = await this.find(postId);
    if (p.authorId !== userId && !admin) throw new ForbiddenException({ message: "Only its author can delete a post.", code: "onlyAuthorPost" });
    await this.db.transaction(async (tx) => {
      await tx.delete(messages).where(eq(messages.channel, postChannel(p.id)));
      await tx.delete(boardPosts).where(eq(boardPosts.id, p.id));
    });
    await this.chat.notifications.forgetChannel(postChannel(p.id));
    this.chat.changes.next({ city: p.city, what: "board" });
  }

  /** Deletes one reply under a post. Only its author, or an admin. */
  async deleteReply(postId: string, replyId: string, userId: string, admin: boolean) {
    const { p } = await this.find(postId);
    const id = Number(replyId);
    const [m] = Number.isSafeInteger(id) && id > 0 ? await this.db.select().from(messages).where(and(eq(messages.id, id), eq(messages.channel, postChannel(p.id)))) : [];
    if (!m) throw new NotFoundException({ message: "There's no such reply.", code: "noReply" });
    if (m.authorId !== userId && !admin) throw new ForbiddenException({ message: "Only its author can delete a reply.", code: "onlyAuthorReply" });
    await this.db.delete(messages).where(eq(messages.id, m.id));
    this.chat.changes.next({ city: p.city, what: "board" });
  }

  private async find(id: string) {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new NotFoundException({ message: "There's no such post.", code: "noPost" });
    const [row] = await this.db.select({ p: boardPosts, u: users }).from(boardPosts).innerJoin(users, eq(users.id, boardPosts.authorId)).where(eq(boardPosts.id, id));
    if (!row) throw new NotFoundException({ message: "There's no such post.", code: "noPost" });
    return row;
  }

  // How many replies each post has (those of people you blocked left out, as on the post itself).
  private async replyCounts(postIds: string[], hidden: string[]): Promise<Map<string, number>> {
    if (!postIds.length) return new Map();
    const rows = await this.db
      .select({ channel: messages.channel, n: count() })
      .from(messages)
      .where(and(inArray(messages.channel, postIds.map(postChannel)), hidden.length ? notInArray(messages.authorId, hidden) : undefined))
      .groupBy(messages.channel);
    return new Map(rows.map((r) => [r.channel, r.n]));
  }
}

function view(p: typeof boardPosts.$inferSelect, u: typeof users.$inferSelect, replies: number): PostView {
  return {
    id: p.id,
    city: p.city,
    tag: p.tag,
    title: p.title,
    body: p.body,
    author: person(u),
    createdAt: p.createdAt.toISOString(),
    activeAt: p.activeAt.toISOString(),
    replies,
  };
}
