import { BadRequestException, Body, Controller, Get, HttpCode, Inject, Optional, Post, Query, Req, Res, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { CATALOGUE } from "../arena/catalogue";
import type { HttpRequest, HttpResponse } from "../auth/http";
import { AuthService } from "../auth/auth.service";
import { HousesService } from "../houses/houses.service";
import { PROJECT_COST_FCFA, REVIEW_CREDIT_FCFA, WELCOME_CREDIT_FCFA } from "../houses/money";
import { CreditService } from "./credit.service";
import { Paydunya } from "./paydunya";
import { settleTopUp, TOP_UP_AMOUNTS_FCFA } from "./top-up";

const ARENA_TOP_PRIZE = Math.max(...CATALOGUE.map((c) => c.prizeFcfa));
export const PAYDUNYA = Symbol("PAYDUNYA");

@Controller("credit")
export class CreditController {
  constructor(
    private readonly credit: CreditService,
    private readonly auth: AuthService,
    // Null without PayDunya keys: then nobody is offered a top-up.
    @Optional() @Inject(PAYDUNYA) private readonly paydunya: Paydunya | null = null,
    // For the rent someone was short of: a top-up pays it at once (houses/rent.ts).
    @Optional() private readonly houses?: HousesService,
  ) {}

  private readonly payRent = (userId: string) => this.houses?.rentCollector.chargePerson(userId) ?? Promise.resolve();

  // Your credit: what you have, what you did with it lately, what earns more, and what you can buy.
  @Get()
  async mine(@Req() req: HttpRequest) {
    const user = await this.auth.userFromRequest(req);
    if (!user) throw new UnauthorizedException("Log in first.");
    const topUp = this.paydunya ? { amounts: TOP_UP_AMOUNTS_FCFA, test: !this.paydunya.live } : null;
    return { ...(await this.credit.view(user.id)), welcome: WELCOME_CREDIT_FCFA, review: REVIEW_CREDIT_FCFA, arena: ARENA_TOP_PRIZE, project: PROJECT_COST_FCFA, topUp };
  }

  // Buying credit: a PayDunya checkout page for one of the fixed amounts. The web page sends you there.
  @Post("top-up")
  async topUp(@Body() body: { amount?: unknown }, @Req() req: HttpRequest) {
    const user = await this.auth.userFromRequest(req);
    if (!user) throw new UnauthorizedException("Log in first.");
    if (!this.paydunya) throw new ServiceUnavailableException({ message: "Buying credit isn't open here.", code: "topUpClosed" });
    const amount = Number(body?.amount);
    if (!TOP_UP_AMOUNTS_FCFA.includes(amount)) throw new BadRequestException({ message: "Pick one of the amounts on offer.", code: "topUpAmount" });
    const back = `${this.auth.config.publicUrl}/api/credit/top-up/back`;
    try {
      const { url } = await this.paydunya.createInvoice({
        amount,
        userId: user.id,
        description: `La Coloc: ${amount} FCFA de crédit`,
        returnUrl: back,
        cancelUrl: back,
        callbackUrl: `${this.auth.config.publicUrl}/api/credit/top-up/notice`,
      });
      return { url };
    } catch {
      throw new ServiceUnavailableException({ message: "PayDunya didn't answer. Try again in a moment.", code: "topUpDown" });
    }
  }

  // Back from PayDunya's page, paid or not: ask PayDunya, then back to the city with the credit window open.
  @Get("top-up/back")
  async back(@Query("token") token: string | undefined, @Res() res: HttpResponse) {
    let added = 0;
    if (this.paydunya && token) added = (await settleTopUp(this.paydunya, this.credit, token, this.payRent).catch(() => ({ added: 0 }))).added;
    res.redirect(302, `${this.auth.config.publicUrl}/?credit=${added ? "added" : "open"}`);
  }

  // PayDunya's own notice that a payment went through (form data, under `data`). Useful when someone pays on their phone
  // and never comes back to the page. Whatever it says, we ask PayDunya again before adding anything.
  @Post("top-up/notice")
  @HttpCode(200)
  async notice(@Body() body: { data?: { hash?: unknown; invoice?: { token?: unknown } } }) {
    const token = body?.data?.invoice?.token;
    if (this.paydunya && this.paydunya.signedByPaydunya(body?.data?.hash) && typeof token === "string") {
      await settleTopUp(this.paydunya, this.credit, token, this.payRent);
    }
    return { ok: true };
  }
}
