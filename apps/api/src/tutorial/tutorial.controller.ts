import { Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import type { HttpRequest } from "../auth/http";
import { TutorialService } from "./tutorial.service";

// The bit of Express's response the room route needs: it answers 201 for a new room and 200 for the same one again.
interface JsonResponse {
  status(code: number): { json(body: unknown): unknown };
}

// The tutorial's steps, for the logged-in newcomer. The web side walks them through these in order.
@Controller("tutorial")
export class TutorialController {
  constructor(
    private readonly tutorial: TutorialService,
    private readonly auth: AuthService,
  ) {}

  private async user(req: HttpRequest) {
    const u = await this.auth.userFromRequest(req);
    if (!u) throw new UnauthorizedException("Log in first.");
    return u;
  }

  // Where they are: the workshop, their room (if they took one), the sample, GitHub, and whether they're done.
  @Get()
  async state(@Req() req: HttpRequest) {
    return this.tutorial.state(await this.user(req));
  }

  // Take a room in the workshop. Asking again answers with the same room.
  @Post("room")
  async room(@Req() req: HttpRequest, @Res() res: JsonResponse) {
    const { created, room } = await this.tutorial.takeRoom(await this.user(req));
    return res.status(created ? 201 : 200).json({ room });
  }

  // Put the sample project online in that room. Answers with the deployment's id, to follow it on the house's stream.
  @Post("deploy")
  async deploy(@Req() req: HttpRequest) {
    return this.tutorial.deploy(await this.user(req));
  }

  // Take the tutorial again: the room goes, and the tutorial counts as not done.
  @Post("reset")
  @HttpCode(200)
  async reset(@Req() req: HttpRequest) {
    return this.tutorial.reset(await this.user(req));
  }
}
