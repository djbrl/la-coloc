import { Controller, Get, Req, UnauthorizedException } from "@nestjs/common";
import { CATALOGUE } from "../arena/catalogue";
import type { HttpRequest } from "../auth/http";
import { AuthService } from "../auth/auth.service";
import { PROJECT_COST_FCFA, REVIEW_CREDIT_FCFA, WELCOME_CREDIT_FCFA } from "../houses/money";
import { CreditService } from "./credit.service";

const ARENA_TOP_PRIZE = Math.max(...CATALOGUE.map((c) => c.prizeFcfa));

@Controller("credit")
export class CreditController {
  constructor(
    private readonly credit: CreditService,
    private readonly auth: AuthService,
  ) {}

  // Your credit: what you have, what you did with it lately, and what earns more.
  @Get()
  async mine(@Req() req: HttpRequest) {
    const user = await this.auth.userFromRequest(req);
    if (!user) throw new UnauthorizedException("Log in first.");
    return { ...(await this.credit.view(user.id)), welcome: WELCOME_CREDIT_FCFA, review: REVIEW_CREDIT_FCFA, arena: ARENA_TOP_PRIZE, project: PROJECT_COST_FCFA };
  }
}
