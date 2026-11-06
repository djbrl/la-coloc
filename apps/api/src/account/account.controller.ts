import { BadRequestException, Body, Controller, HttpCode, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import { z } from "zod";
import { AuthService, SESSION_COOKIE, STATE_COOKIE } from "../auth/auth.service";
import { clearCookie, type HttpRequest, type HttpResponse, setCookie } from "../auth/http";
import { AccountService } from "./account.service";

// Deleting your account asks for your login, typed out, so a stray click can't do it.
const DeleteBody = z.object({ login: z.string().trim().min(1).max(39) });

// Leaving: your whole account, or only the GitHub App on your repos (account.service.ts).
@Controller("me")
export class AccountController {
  constructor(
    private readonly account: AccountService,
    private readonly auth: AuthService,
  ) {}

  private async user(req: HttpRequest) {
    const user = await this.auth.userFromRequest(req);
    if (!user) throw new UnauthorizedException({ message: "Log in first.", code: "logInFirst" });
    return user;
  }

  /**
   * Deletes the account, and logs out. Then, when GitHub is answering and they logged in with it, the page sends the
   * browser to `forgetUrl`: one more trip through GitHub, which revokes the App's authorization and comes back to the
   * landing. `manual`: something is left on GitHub that they should remove themselves (the landing links to where).
   */
  @Post("delete")
  @HttpCode(200)
  async remove(@Body() body: unknown, @Req() req: HttpRequest, @Res({ passthrough: true }) res: HttpResponse) {
    const user = await this.user(req);
    const parsed = DeleteBody.safeParse(body ?? {});
    // GitHub logins don't care about case, so neither does this.
    if (!parsed.success || parsed.data.login.toLowerCase() !== user.login.toLowerCase()) {
      throw new BadRequestException({ message: "Type your login to confirm.", code: "typeYourLogin" });
    }
    const { github } = await this.account.deleteAccount(user);
    const secure = this.auth.config.secureCookies;
    clearCookie(res, SESSION_COOKIE, secure);
    let forgetUrl: string | null = null;
    if (user.githubId && this.auth.config.github && !github.down) {
      const trip = this.auth.startForget(user.githubId);
      setCookie(res, STATE_COOKIE, trip.state, { maxAgeSeconds: 600, secure });
      forgetUrl = trip.url;
    }
    return { ok: true, forgetUrl, manual: !!user.githubId && !forgetUrl };
  }

  /** Uninstalls the GitHub App from their own account and unlinks their repos. The account stays. */
  @Post("github/remove")
  @HttpCode(200)
  async removeApp(@Req() req: HttpRequest) {
    return { ok: true, ...(await this.account.removeApp(await this.user(req))) };
  }
}
