import { Controller, HttpCode, Param, Post, Req, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import type { HttpRequest } from "../auth/http";
import { LeasesService } from "./leases.service";

// Your rooms in a house: taking another free one, and ending a lease.
@Controller("houses/:id/rooms/:room")
export class LeasesController {
  constructor(
    private readonly leases: LeasesService,
    private readonly auth: AuthService,
  ) {}

  private async user(req: HttpRequest) {
    const user = await this.auth.userFromRequest(req);
    if (!user) throw new UnauthorizedException("Log in first.");
    return user;
  }

  // Someone who lives in the house takes another free room in it. (Everyone else knocks.)
  @Post("take")
  @HttpCode(200)
  async take(@Param("id") id: string, @Param("room") room: string, @Req() req: HttpRequest) {
    return this.leases.take(id, room, await this.user(req));
  }

  // The occupant ends their lease: the room is free now, and the rent stays as it is until `until`.
  @Post("leave")
  @HttpCode(200)
  async leave(@Param("id") id: string, @Param("room") room: string, @Req() req: HttpRequest) {
    return this.leases.leave(id, room, await this.user(req));
  }
}
