import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Param, Post, Req, UnauthorizedException } from "@nestjs/common";
import { z } from "zod";
import { AuthService } from "../auth/auth.service";
import type { HttpRequest } from "../auth/http";
import { RoomsService } from "../rooms/rooms.service";
import { GithubRepos } from "./repos.service";

// POST .../import: the GitHub repo to bring into the room, by GitHub's id.
const ImportBody = z.object({ id: z.number({ message: "Pick one of your repos." }).int().positive() });

// Your repos, not tied to any room, and bringing one into a room you manage.
@Controller()
export class GithubReposController {
  constructor(
    private readonly repos: GithubRepos,
    private readonly rooms: RoomsService,
    private readonly auth: AuthService,
  ) {}

  private async user(req: HttpRequest) {
    const u = await this.auth.userFromRequest(req);
    if (!u) throw new UnauthorizedException({ message: "Log in first.", code: "logInFirst" });
    return u;
  }

  @Get("github/repos")
  async list(@Req() req: HttpRequest) {
    return this.repos.list(await this.user(req));
  }

  // Same rule as the settings (RoomsService.updateSettings): where the code comes from is the flatmate's. A deploy
  // carries the room's secrets, so whoever picks the code can read them.
  @Post("houses/:id/rooms/:room/import")
  @HttpCode(200)
  async import(@Param("id") id: string, @Param("room") roomName: string, @Body() body: unknown, @Req() req: HttpRequest) {
    const user = await this.user(req);
    const { room, as } = await this.rooms.manageable(id, roomName, user.id);
    if (room.demo) throw new ConflictException("This is an example room: nothing runs in it.");
    if (as === "chef" && room.occupantId) {
      throw new ForbiddenException({ message: "Only the flatmate who lives here can change where the room's code comes from.", code: "flatmateOnlySource" });
    }
    const parsed = ImportBody.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? "invalid request");
    return this.repos.link(user, room, parsed.data.id);
  }
}
