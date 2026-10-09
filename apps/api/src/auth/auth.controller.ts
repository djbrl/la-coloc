import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Logger, Post, Query, Req, Res, UnauthorizedException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { AuthService, SESSION_COOKIE, SESSION_DAYS, STATE_COOKIE } from "./auth.service";
import { clearCookie, type HttpRequest, type HttpResponse, parseCookies, setCookie } from "./http";
import { MembershipsService } from "./memberships.service";

const DevLoginBody = z.object({ login: z.string().min(1).max(39) });

@Controller()
export class AuthController {
  private readonly log = new Logger("auth");

  constructor(
    private readonly auth: AuthService,
    private readonly memberships: MembershipsService,
  ) {}

  // Tells the login page which buttons to show.
  @Get("auth/config")
  config() {
    return { github: !!this.auth.config.github, dev: this.auth.config.devLogin };
  }

  @Get("auth/github")
  github(@Res() res: HttpResponse) {
    if (!this.auth.config.github) throw new BadRequestException("GitHub login isn't configured on this server");
    // The state ties GitHub's answer to this browser, so nobody can log you in as them.
    const state = randomBytes(16).toString("base64url");
    setCookie(res, STATE_COOKIE, state, { maxAgeSeconds: 600, secure: this.auth.config.secureCookies });
    res.redirect(302, this.auth.githubAuthorizeUrl(state));
  }

  @Get("auth/github/callback")
  async githubCallback(@Req() req: HttpRequest, @Res() res: HttpResponse, @Query("code") code?: string, @Query("state") state?: string) {
    const expected = parseCookies(req.headers.cookie)[STATE_COOKIE];
    clearCookie(res, STATE_COOKIE, this.auth.config.secureCookies);
    if (!code || !state || !expected || state !== expected) {
      res.redirect(302, `${this.auth.config.publicUrl}/login?error=state`);
      return;
    }
    try {
      const user = await this.auth.upsertGithubUser(await this.auth.githubProfile(code));
      await this.startSession(res, user.id);
      res.redirect(302, `${this.auth.config.publicUrl}/`);
    } catch (e) {
      this.log.warn(`GitHub login failed: ${(e as Error).message}`);
      res.redirect(302, `${this.auth.config.publicUrl}/login?error=github`);
    }
  }

  @Post("auth/dev-login")
  @HttpCode(200)
  async devLogin(@Body() body: unknown, @Res({ passthrough: true }) res: HttpResponse) {
    if (!this.auth.config.devLogin) throw new ForbiddenException("dev login is off");
    const parsed = DevLoginBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const user = await this.auth.devLogin(parsed.data.login).catch((e: Error) => {
      throw new BadRequestException(e.message);
    });
    await this.startSession(res, user.id);
    return { login: user.login };
  }

  @Post("auth/logout")
  @HttpCode(200)
  async logout(@Req() req: HttpRequest, @Res({ passthrough: true }) res: HttpResponse) {
    await this.auth.endSession(req);
    clearCookie(res, SESSION_COOKIE, this.auth.config.secureCookies);
    return { ok: true };
  }

  // Who am I, and where do I live.
  @Get("me")
  async me(@Req() req: HttpRequest) {
    const user = await this.auth.userFromRequest(req);
    if (!user) throw new UnauthorizedException();
    return {
      login: user.login,
      name: user.name,
      avatarUrl: user.avatarUrl,
      houses: await this.memberships.housesOf(user.id),
    };
  }

  private async startSession(res: HttpResponse, userId: string) {
    const token = await this.auth.createSession(userId);
    setCookie(res, SESSION_COOKIE, token, { maxAgeSeconds: SESSION_DAYS * 24 * 3600, secure: this.auth.config.secureCookies });
  }
}
