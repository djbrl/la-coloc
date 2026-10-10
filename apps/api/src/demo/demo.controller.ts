import { Controller, ForbiddenException, HttpCode, Post, Req, UnauthorizedException } from "@nestjs/common";
import { isAdmin } from "../auth/auth.config";
import { AuthService } from "../auth/auth.service";
import type { HttpRequest } from "../auth/http";
import { DemoService } from "./demo.service";

@Controller("demo")
export class DemoController {
  constructor(
    private readonly demo: DemoService,
    private readonly auth: AuthService,
  ) {}

  // Puts the city back to the seed. Only on a demo server (COLOC_DEMO_RESET=1), only for the admins (COLOC_ADMINS),
  // and at most once every ten minutes, so nobody can wipe the city while a jury walks it.
  @Post("reset")
  @HttpCode(200)
  async reset(@Req() req: HttpRequest) {
    if (!this.auth.config.demoReset) throw new ForbiddenException("The demo reset is off on this server.");
    const user = await this.auth.userFromRequest(req);
    if (!user) throw new UnauthorizedException("Log in first.");
    if (!isAdmin(this.auth.config, user.login)) throw new ForbiddenException("Only the city's admins can reset it.");
    return this.demo.reset();
  }
}
