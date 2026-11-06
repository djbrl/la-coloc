// Blocking, muting and reporting's routes. Thin, like the other controllers: who's asking, a zod check of the body,
// then the service, which holds every rule. The block routes keep the chat's old addresses (chat/blocks).
import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, Post, Query, Req, UnauthorizedException } from "@nestjs/common";
import { z } from "zod";
import { isAdmin } from "../auth/auth.config";
import { AuthService } from "../auth/auth.service";
import type { HttpRequest } from "../auth/http";
import { SafetyService } from "./safety.service";

const Login = z.string().trim().min(1).max(60);
const Channel = z.string().min(1).max(160);
const BlockBody = z.object({ login: Login });
// A person by login, or a group chat by channel: one of the two.
const MuteBody = z.union([z.object({ login: Login }), z.object({ channel: Channel })]);
const ReportBody = z.object({ kind: z.enum(["message", "post", "person", "group"]), id: z.string().min(1).max(160), reason: z.string().trim().max(300).nullish() });

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw new BadRequestException(r.error.issues[0]?.message ?? "invalid request");
  return r.data;
}

@Controller()
export class SafetyController {
  constructor(
    private readonly safety: SafetyService,
    private readonly auth: AuthService,
  ) {}

  private async user(req: HttpRequest) {
    const u = await this.auth.userFromRequest(req);
    if (!u) throw new UnauthorizedException({ message: "Log in first.", code: "logInFirst" });
    return u;
  }

  // Everyone you blocked and muted, and the group chats you muted (Settings).
  @Get("safety")
  async view(@Req() req: HttpRequest) {
    return this.safety.view((await this.user(req)).id);
  }

  @Get("chat/blocks")
  async blocks(@Req() req: HttpRequest) {
    return this.safety.blocks((await this.user(req)).id);
  }

  @Post("chat/blocks")
  @HttpCode(200)
  async block(@Body() body: unknown, @Req() req: HttpRequest) {
    const user = await this.user(req);
    await this.safety.block(user.id, parse(BlockBody, body).login);
    return { ok: true };
  }

  @Delete("chat/blocks/:login")
  async unblock(@Param("login") login: string, @Req() req: HttpRequest) {
    await this.safety.unblock((await this.user(req)).id, login);
    return { ok: true };
  }

  @Post("safety/mutes")
  @HttpCode(200)
  async mute(@Body() body: unknown, @Req() req: HttpRequest) {
    const user = await this.user(req);
    await this.safety.mute(user.id, parse(MuteBody, body));
    return { ok: true };
  }

  // DELETE /safety/mutes?login=fatou or ?channel=city:Dakar
  @Delete("safety/mutes")
  async unmute(@Query("login") login: string | undefined, @Query("channel") channel: string | undefined, @Req() req: HttpRequest) {
    const user = await this.user(req);
    await this.safety.unmute(user.id, parse(MuteBody, login ? { login } : { channel }));
    return { ok: true };
  }

  @Post("reports")
  async report(@Body() body: unknown, @Req() req: HttpRequest) {
    const user = await this.user(req);
    await this.safety.report(user.id, parse(ReportBody, body));
    return { ok: true };
  }

  // The admins' list (COLOC_ADMINS). Nothing else to it: they read, and act by hand.
  @Get("reports")
  async reports(@Req() req: HttpRequest) {
    const user = await this.user(req);
    if (!isAdmin(this.auth.config, user.login)) throw new ForbiddenException({ message: "Only the city's admins can read reports.", code: "adminsOnly" });
    return { reports: await this.safety.reports() };
  }
}
