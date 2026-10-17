// The Arena's routes (docs/arena.md): a city's arena and its chat room, joining, sending and taking back pull
// requests, and wearing a title. Thin, like the other controllers: who's asking, a zod check of the body, then
// ArenaService, which holds every rule. Looking needs no login; doing anything does.
import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Req, UnauthorizedException } from "@nestjs/common";
import { z } from "zod";
import { AuthService } from "../auth/auth.service";
import type { HttpRequest } from "../auth/http";
import { MAX_MESSAGE } from "../chat/channels";
import { ArenaService } from "./arena.service";

const SubmissionBody = z.object({ url: z.string().max(500) });
// Lengths are checked again after trimming (cleanText), as in the city's room.
const MessageBody = z.object({ body: z.string().max(MAX_MESSAGE + 100) });
// `id`: one of your awards, or null for none. (`awardId` is read too, as the contract's first draft named it.)
const BadgeBody = z
  .object({ id: z.string().max(60).nullish(), awardId: z.string().max(60).nullish() })
  .refine((b) => b.id !== undefined || b.awardId !== undefined, "Say which title to wear, or null for none.");

@Controller()
export class ArenaController {
  constructor(
    private readonly arena: ArenaService,
    private readonly auth: AuthService,
  ) {}

  private async user(req: HttpRequest) {
    const u = await this.auth.userFromRequest(req);
    if (!u) throw new UnauthorizedException({ message: "Log in first.", code: "logInFirst" });
    return u;
  }

  @Get("cities/:city/arena")
  async view(@Param("city") city: string, @Req() req: HttpRequest) {
    const viewer = await this.auth.userFromRequest(req);
    return this.arena.view(city, viewer?.id ?? null);
  }

  @Post("cities/:city/arena/join")
  @HttpCode(200)
  async join(@Param("city") city: string, @Req() req: HttpRequest) {
    return this.arena.join(city, (await this.user(req)).id);
  }

  @Post("cities/:city/arena/submissions")
  @HttpCode(200)
  async submit(@Param("city") city: string, @Body() body: unknown, @Req() req: HttpRequest) {
    const user = await this.user(req);
    const parsed = SubmissionBody.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException({ message: "Paste the address of a pull request, like https://github.com/owner/repo/pull/12.", code: "arenaBadUrl" });
    return this.arena.submit(city, user, parsed.data.url);
  }

  @Delete("cities/:city/arena/submissions/:id")
  async withdraw(@Param("city") city: string, @Param("id") id: string, @Req() req: HttpRequest) {
    return this.arena.withdraw(city, (await this.user(req)).id, id);
  }

  @Get("cities/:city/arena/chat")
  async messages(@Param("city") city: string, @Req() req: HttpRequest) {
    const viewer = await this.auth.userFromRequest(req);
    return this.arena.messages(city, viewer?.id ?? null);
  }

  @Post("cities/:city/arena/chat")
  @HttpCode(200)
  async say(@Param("city") city: string, @Body() body: unknown, @Req() req: HttpRequest) {
    const user = await this.user(req);
    const parsed = MessageBody.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? "invalid request");
    return this.arena.say(city, user.id, parsed.data.body);
  }

  @Put("me/badge")
  async wear(@Body() body: unknown, @Req() req: HttpRequest) {
    const user = await this.user(req);
    const parsed = BadgeBody.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? "invalid request");
    return this.arena.wearBadge(user.id, parsed.data.id !== undefined ? (parsed.data.id ?? null) : (parsed.data.awardId ?? null));
  }
}
