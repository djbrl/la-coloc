// The chat's routes: direct messages, a city's room and its board. Thin, like the other
// controllers: who's asking, a zod check of the body, then the services, which hold every rule.
//
// Reading a city's room or board needs no login (visitors read); writing anything does.
import { BadRequestException, Body, Controller, Delete, Get, HttpCode, MessageEvent, Param, Post, Req, Sse, UnauthorizedException } from "@nestjs/common";
import { filter, interval, map, merge, Observable } from "rxjs";
import { z } from "zod";
import { isAdmin } from "../auth/auth.config";
import { AuthService } from "../auth/auth.service";
import type { HttpRequest } from "../auth/http";
import { BoardService, TAGS } from "./board.service";
import { MAX_MESSAGE, MAX_POST, MAX_TITLE } from "./channels";
import { ChatService } from "./chat.service";

// Lengths are checked again after trimming (cleanText); these stop anything absurd at the door.
const MessageBody = z.object({ body: z.string().max(MAX_MESSAGE + 100) });
const PostBody = z.object({
  tag: z.enum(TAGS as [string, ...string[]], { errorMap: () => ({ message: "Pick what the post is about." }) }),
  title: z.string().max(MAX_TITLE + 50),
  body: z.string().max(MAX_POST + 100),
});
const ReadBody = z.object({ what: z.enum(["chat", "board"]) });

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw new BadRequestException(r.error.issues[0]?.message ?? "invalid request");
  return r.data;
}

@Controller()
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly board: BoardService,
    private readonly auth: AuthService,
  ) {}

  private async user(req: HttpRequest) {
    const u = await this.auth.userFromRequest(req);
    if (!u) throw new UnauthorizedException({ message: "Log in first.", code: "logInFirst" });
    return u;
  }

  // ---- Direct messages ----

  @Get("chat/conversations")
  async conversations(@Req() req: HttpRequest) {
    return this.chat.conversations((await this.user(req)).id);
  }

  @Get("chat/dm/:login")
  async conversation(@Param("login") login: string, @Req() req: HttpRequest) {
    return this.chat.conversation((await this.user(req)).id, login);
  }

  @Post("chat/dm/:login")
  @HttpCode(200)
  async sendDm(@Param("login") login: string, @Body() body: unknown, @Req() req: HttpRequest) {
    const user = await this.user(req);
    return this.chat.sendDm(user.id, login, parse(MessageBody, body).body);
  }

  // (Blocking, muting and reporting are safety/safety.controller.ts's.)

  // ---- A city's room and board ----

  @Get("cities/:city/chat")
  async cityChat(@Param("city") city: string, @Req() req: HttpRequest) {
    const viewer = await this.auth.userFromRequest(req);
    return this.chat.cityChat(city, viewer?.id ?? null);
  }

  @Post("cities/:city/chat")
  @HttpCode(200)
  async postToCity(@Param("city") city: string, @Body() body: unknown, @Req() req: HttpRequest) {
    const user = await this.user(req);
    return this.chat.postToCity(city, user.id, parse(MessageBody, body).body);
  }

  @Get("cities/:city/board")
  async cityBoard(@Param("city") city: string, @Req() req: HttpRequest) {
    const viewer = await this.auth.userFromRequest(req);
    return this.board.board(city, viewer?.id ?? null);
  }

  @Post("cities/:city/board")
  async createPost(@Param("city") city: string, @Body() body: unknown, @Req() req: HttpRequest) {
    const user = await this.user(req);
    const { tag, title, body: text } = parse(PostBody, body);
    return this.board.create(city, user.id, { tag: tag as (typeof TAGS)[number], title, body: text });
  }

  // What's new in the city's room and on its board since you last looked: the counts on the chat's tabs.
  @Get("cities/:city/unread")
  async cityUnread(@Param("city") city: string, @Req() req: HttpRequest) {
    return this.chat.cityUnread(city, (await this.user(req)).id);
  }

  // You looked at the city's room or its board.
  @Post("cities/:city/read")
  @HttpCode(200)
  async markCityRead(@Param("city") city: string, @Body() body: unknown, @Req() req: HttpRequest) {
    const user = await this.user(req);
    await this.chat.markCityRead(city, user.id, parse(ReadBody, body).what);
    return { ok: true };
  }

  // Something new in the city's room ("chat"), on its board ("board") or in its Arena ("arena"): the page fetches it. (An event needs some
  // data, or the browser drops it: the data is just the word again.) Nothing private travels here: each page fetches
  // with its own login, so what it hides stays hidden.
  @Sse("cities/:city/stream")
  async stream(@Param("city") city: string): Promise<Observable<MessageEvent>> {
    await this.chat.mustBeCity(city);
    const updates = this.chat.changes.pipe(
      filter((c) => c.city === city),
      map((c) => ({ type: c.what, data: c.what }) as MessageEvent),
    );
    const heartbeat = interval(25_000).pipe(map(() => ({ type: "ping", data: "" }) as MessageEvent));
    return merge(updates, heartbeat);
  }

  @Get("board/:id")
  async post(@Param("id") id: string, @Req() req: HttpRequest) {
    const viewer = await this.auth.userFromRequest(req);
    return this.board.post(id, viewer?.id ?? null);
  }

  @Post("board/:id/replies")
  async reply(@Param("id") id: string, @Body() body: unknown, @Req() req: HttpRequest) {
    const user = await this.user(req);
    return this.board.reply(id, user.id, parse(MessageBody, body).body);
  }

  @Delete("board/:id")
  async deletePost(@Param("id") id: string, @Req() req: HttpRequest) {
    const user = await this.user(req);
    await this.board.deletePost(id, user.id, isAdmin(this.auth.config, user.login));
    return { ok: true };
  }

  @Delete("board/:id/replies/:reply")
  async deleteReply(@Param("id") id: string, @Param("reply") reply: string, @Req() req: HttpRequest) {
    const user = await this.user(req);
    await this.board.deleteReply(id, reply, user.id, isAdmin(this.auth.config, user.login));
    return { ok: true };
  }
}
