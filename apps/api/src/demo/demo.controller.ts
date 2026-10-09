import { Controller, ForbiddenException, HttpCode, Post, Req, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import type { HttpRequest } from "../auth/http";
import { DemoService } from "./demo.service";

@Controller("demo")
export class DemoController {
  constructor(
    private readonly demo: DemoService,
    private readonly auth: AuthService,
  ) {}

  // Puts the city back to the seed. Only on a demo server (COLOC_DEMO_RESET=1), and for anyone logged in.
  @Post("reset")
  @HttpCode(200)
  async reset(@Req() req: HttpRequest) {
    if (!this.auth.config.demoReset) throw new ForbiddenException("The demo reset is off on this server.");
    if (!(await this.auth.userFromRequest(req))) throw new UnauthorizedException("Log in first.");
    return this.demo.reset();
  }
}
