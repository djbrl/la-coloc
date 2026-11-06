// The bell's routes: your notifications, the invitations, and a full house's chat. Thin, like the other controllers:
// who's asking, a zod check of the body, then the service, which holds every rule.
import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Post, Req, UnauthorizedException } from "@nestjs/common";
import { RoomName } from "@coloc/protocol";
import { z } from "zod";
import { AuthService } from "../auth/auth.service";
import type { HttpRequest } from "../auth/http";
import { NotificationsService } from "./notifications.service";

const Login = z.string().min(1, "Say who to invite.").max(60);
const HouseInviteBody = z.object({ to: Login, house: z.string().min(1).max(60), room: RoomName.nullish() });
const RentTogetherBody = z.object({ to: Login });
const ReadBody = z.object({ ids: z.array(z.string().uuid()).max(100).optional() });

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw new BadRequestException(r.error.issues[0]?.message ?? "invalid request");
  return r.data;
}

@Controller()
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly auth: AuthService,
  ) {}

  private async user(req: HttpRequest) {
    const u = await this.auth.userFromRequest(req);
    if (!u) throw new UnauthorizedException({ message: "Log in first.", code: "logInFirst" });
    return u;
  }

  @Get("notifications")
  async list(@Req() req: HttpRequest) {
    return this.notifications.list((await this.user(req)).id);
  }

  @Post("notifications/read")
  @HttpCode(200)
  async read(@Body() body: unknown, @Req() req: HttpRequest) {
    const user = await this.user(req);
    await this.notifications.markRead(user.id, parse(ReadBody, body).ids);
    return { ok: true };
  }

  @Post("notifications/:id/accept")
  @HttpCode(200)
  async accept(@Param("id") id: string, @Req() req: HttpRequest) {
    return this.notifications.accept((await this.user(req)).id, id);
  }

  @Post("notifications/:id/decline")
  @HttpCode(200)
  async decline(@Param("id") id: string, @Req() req: HttpRequest) {
    await this.notifications.decline((await this.user(req)).id, id);
    return { ok: true };
  }

  @Post("notifications/:id/withdraw")
  @HttpCode(200)
  async withdraw(@Param("id") id: string, @Req() req: HttpRequest) {
    await this.notifications.withdraw((await this.user(req)).id, id);
    return { ok: true };
  }

  @Post("invites/house")
  async inviteToHouse(@Body() body: unknown, @Req() req: HttpRequest) {
    const user = await this.user(req);
    const { to, house, room } = parse(HouseInviteBody, body);
    return this.notifications.inviteToHouse(user.id, to, house, room);
  }

  // A full house's group chat: ask to join it from outside. A flatmate answers under the bell (accept and decline above).
  @Post("houses/:id/guests")
  async askToChat(@Param("id") id: string, @Req() req: HttpRequest) {
    return this.notifications.askToChat((await this.user(req)).id, id);
  }

  // A guest leaves the house's chat, or a flatmate takes them out of it.
  @Delete("houses/:id/guests/:login")
  async removeGuest(@Param("id") id: string, @Param("login") login: string, @Req() req: HttpRequest) {
    await this.notifications.removeGuest((await this.user(req)).id, id, login);
    return { ok: true };
  }

  @Post("invites/rent-together")
  async rentTogether(@Body() body: unknown, @Req() req: HttpRequest) {
    const user = await this.user(req);
    return this.notifications.rentTogether(user.id, parse(RentTogetherBody, body).to);
  }
}
