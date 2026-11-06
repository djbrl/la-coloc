// The friends list's routes. Thin, like the other controllers: who's asking, a zod check of the body, then the
// services. A request is answered through the bell's routes (notifications/:id/accept, decline, withdraw).
import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Req, UnauthorizedException } from "@nestjs/common";
import { z } from "zod";
import { AuthService } from "../auth/auth.service";
import type { HttpRequest } from "../auth/http";
import { NotificationsService } from "../notifications/notifications.service";
import { FriendsService } from "./friends.service";

const AskBody = z.object({ to: z.string().trim().min(1, "Say who to add.").max(60) });

@Controller("friends")
export class FriendsController {
  constructor(
    private readonly friends: FriendsService,
    private readonly notifications: NotificationsService,
    private readonly auth: AuthService,
  ) {}

  private async user(req: HttpRequest) {
    const u = await this.auth.userFromRequest(req);
    if (!u) throw new UnauthorizedException({ message: "Log in first.", code: "logInFirst" });
    return u;
  }

  @Get()
  async list(@Req() req: HttpRequest) {
    return this.friends.list((await this.user(req)).id);
  }

  // Asks someone, by login, to be friends (from their card in the city, or the list's box).
  @Post()
  async ask(@Body() body: unknown, @Req() req: HttpRequest) {
    const user = await this.user(req);
    const r = AskBody.safeParse(body ?? {});
    if (!r.success) throw new BadRequestException(r.error.issues[0]?.message ?? "invalid request");
    return this.notifications.askFriend(user.id, r.data.to.replace(/^@/, ""));
  }

  @Delete(":login")
  async remove(@Param("login") login: string, @Req() req: HttpRequest) {
    await this.friends.remove((await this.user(req)).id, login);
    return { ok: true };
  }
}
