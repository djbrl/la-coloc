import { BadRequestException, Body, Controller, Get, HttpCode, HttpException, HttpStatus, Inject, Optional, Post, Query, Req, Res, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { CATALOGUE } from "../arena/catalogue";
import type { HttpRequest, HttpResponse } from "../auth/http";
import { AuthService } from "../auth/auth.service";
import { Limiter } from "../chat/limiter";
import { HousesService } from "../houses/houses.service";
import { PROJECT_COST_FCFA, REVIEW_CREDIT_FCFA, WELCOME_CREDIT_FCFA } from "../houses/money";
import { CreditService } from "./credit.service";
import type { PaymentProvider } from "./payments";
import { PAXITY_COUNTRIES, Paxity, paxityPhone, PaxityRefused } from "./paxity";
import { Paydunya } from "./paydunya";
import { settleTopUp, TOP_UP_AMOUNTS_FCFA } from "./top-up";

const ARENA_TOP_PRIZE = Math.max(...CATALOGUE.map((c) => c.prizeFcfa));
export const PAYMENTS = Symbol("PAYMENTS");

// A mobile-money request makes someone's phone ring for approval, so a person may start only a few in a while.
const PHONE_REQUESTS = { count: 5, perMs: 10 * 60_000 };

@Controller("credit")
export class CreditController {
  private readonly phoneRequests = new Limiter(PHONE_REQUESTS.count, PHONE_REQUESTS.perMs);

  constructor(
    private readonly credit: CreditService,
    private readonly auth: AuthService,
    // PayDunya or Paxity (payments.ts), or null without keys: then nobody is offered a top-up.
    @Optional() @Inject(PAYMENTS) private readonly payments: PaymentProvider | null = null,
    // For the rent someone was short of: a top-up pays it at once (houses/rent.ts).
    @Optional() private readonly houses?: HousesService,
  ) {}

  private readonly payRent = (userId: string) => this.houses?.rentCollector.chargePerson(userId) ?? Promise.resolve();

  // Your credit: what you have, what you did with it lately, what earns more, and what you can buy and how.
  @Get()
  async mine(@Req() req: HttpRequest) {
    const user = await this.auth.userFromRequest(req);
    if (!user) throw new UnauthorizedException("Log in first.");
    const p = this.payments;
    const topUp = p
      ? {
          amounts: TOP_UP_AMOUNTS_FCFA,
          test: !p.live,
          provider: p.name,
          // A phone provider asks for a number and an operator: the countries it takes, and the operators in each.
          phone: p.kind === "phone" ? PAXITY_COUNTRIES.map((c) => ({ code: c.code, prefix: c.prefix, methods: [...c.methods] })) : null,
        }
      : null;
    return { ...(await this.credit.view(user.id)), welcome: WELCOME_CREDIT_FCFA, review: REVIEW_CREDIT_FCFA, arena: ARENA_TOP_PRIZE, project: PROJECT_COST_FCFA, topUp };
  }

  // Buying credit. With PayDunya: a checkout page for one of the fixed amounts, and the web page sends you there
  // (`url`). With Paxity: a request to charge your number, and the web page waits while you approve it (`pending`).
  @Post("top-up")
  async topUp(@Body() body: { amount?: unknown; country?: unknown; phone?: unknown; method?: unknown }, @Req() req: HttpRequest) {
    const user = await this.auth.userFromRequest(req);
    if (!user) throw new UnauthorizedException("Log in first.");
    const p = this.payments;
    if (!p) throw new ServiceUnavailableException({ message: "Buying credit isn't open here.", code: "topUpClosed" });
    const amount = Number(body?.amount);
    if (!TOP_UP_AMOUNTS_FCFA.includes(amount)) throw new BadRequestException({ message: "Pick one of the amounts on offer.", code: "topUpAmount" });
    const description = `La Coloc: ${amount} FCFA de crédit`;
    const notice = `${this.auth.config.publicUrl}/api/credit/top-up/notice`;

    if (p instanceof Paxity) {
      const country = PAXITY_COUNTRIES.find((c) => c.code === body?.country);
      const phone = country && typeof body?.phone === "string" ? paxityPhone(country, body.phone) : null;
      if (!country || !phone) throw new BadRequestException({ message: "Enter a mobile money number for that country.", code: "topUpPhone" });
      const method = country.methods.find((m) => m === body?.method);
      if (!method) throw new BadRequestException({ message: "Pick one of the ways to pay on offer.", code: "topUpMethod" });
      if (!this.phoneRequests.take(user.id)) {
        throw new HttpException({ message: "That's a lot of payment requests. Wait a few minutes and try again.", code: "topUpSlowDown" }, HttpStatus.TOO_MANY_REQUESTS);
      }
      try {
        const started = await p.start({ amount, userId: user.id, country, phone, method, description, callbackUrl: notice });
        return { pending: { ...started, method } };
      } catch (e) {
        if (e instanceof PaxityRefused) throw new BadRequestException({ message: "The payment was refused. Check the number and the way to pay.", code: "topUpRefused" });
        throw new ServiceUnavailableException({ message: "The payment service didn't answer. Try again in a moment.", code: "topUpDown" });
      }
    }

    if (p instanceof Paydunya) {
      const back = `${this.auth.config.publicUrl}/api/credit/top-up/back`;
      try {
        const { url } = await p.createInvoice({ amount, userId: user.id, description, returnUrl: back, cancelUrl: back, callbackUrl: notice });
        return { url };
      } catch {
        throw new ServiceUnavailableException({ message: "The payment service didn't answer. Try again in a moment.", code: "topUpDown" });
      }
    }
    throw new ServiceUnavailableException({ message: "Buying credit isn't open here.", code: "topUpClosed" });
  }

  // The credit window, waiting on a Paxity payment, asks here every few seconds. Asking settles it: the credit is
  // added the moment Paxity says it's paid. Only the person paying hears how it went.
  @Get("top-up/check")
  async check(@Query("ref") ref: string | undefined, @Req() req: HttpRequest) {
    const user = await this.auth.userFromRequest(req);
    if (!user) throw new UnauthorizedException("Log in first.");
    if (!this.payments || !ref) return { status: "unknown", added: 0 };
    try {
      const settled = await settleTopUp(this.payments, this.credit, ref, this.payRent);
      if (settled.userId !== user.id) return { status: "unknown", added: 0 };
      return { status: settled.status, added: settled.added };
    } catch {
      // Paxity didn't answer this time: the window keeps waiting and asks again.
      return { status: "pending", added: 0 };
    }
  }

  // Back from PayDunya's page, paid or not: ask PayDunya, then back to the city with the credit window open.
  @Get("top-up/back")
  async back(@Query("token") token: string | undefined, @Res() res: HttpResponse) {
    let added = 0;
    if (this.payments && token) added = (await settleTopUp(this.payments, this.credit, token, this.payRent).catch(() => ({ added: 0 }))).added;
    res.redirect(302, `${this.auth.config.publicUrl}/?credit=${added ? "added" : "open"}`);
  }

  // The provider's own notice that a payment went through. Useful when someone pays on their phone and never comes back
  // to the page. Whatever it says, we ask the provider again before adding anything. PayDunya posts form data under
  // `data`, signed with the hash of our master key; Paxity posts JSON about the transaction.
  @Post("top-up/notice")
  @HttpCode(200)
  async notice(@Body() body: { data?: { hash?: unknown; invoice?: { token?: unknown } } } & Record<string, unknown>) {
    const p = this.payments;
    let ref: string | null = null;
    if (p instanceof Paydunya) {
      const token = body?.data?.invoice?.token;
      if (p.signedByPaydunya(body?.data?.hash) && typeof token === "string") ref = token;
    } else if (p instanceof Paxity) {
      ref = p.refFromNotice(body);
    }
    if (p && ref) await settleTopUp(p, this.credit, ref, this.payRent).catch(() => undefined);
    return { ok: true };
  }
}
