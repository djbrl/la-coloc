import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Logger, Patch, Post, Query, Req, Res, UnauthorizedException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { AuthService, SESSION_COOKIE, SESSION_DAYS, STATE_COOKIE } from "./auth.service";
import { clearCookie, type HttpRequest, type HttpResponse, parseCookies, setCookie } from "./http";
import { MembershipsService } from "./memberships.service";
import { AVATARS } from "../lobby/presence";

const DevLoginBody = z.object({ login: z.string().min(1).max(39) });
// What you may change about yourself: your character, and whether you've done the tutorial. Either or both.
const MeBody = z
  .object({
    avatar: z.enum(AVATARS as [string, ...string[]], { errorMap: () => ({ message: "Pick one of the characters." }) }).optional(),
    tutorialDone: z.boolean({ invalid_type_error: "tutorialDone is true or false." }).optional(),
  })
  .refine((b) => b.avatar !== undefined || b.tutorialDone !== undefined, "Nothing to change.");

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
    return { github: !!this.auth.config.github, dev: this.auth.config.devLogin, demoReset: this.auth.config.demoReset };
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

  // Who am I, and where do I live. Logged out isn't an error here: `user` is just null.
  @Get("me")
  async me(@Req() req: HttpRequest) {
    const user = await this.auth.userFromRequest(req);
    if (!user) return { user: null };
    return {
      user: {
        login: user.login,
        name: user.name,
        avatarUrl: user.avatarUrl,
        avatar: user.avatar,
        tutorialDone: !!user.tutorialDoneAt,
        houses: await this.memberships.housesOf(user.id),
      },
    };
  }

  // Your character in the lobby, and whether you've done the tutorial (false: take it again).
  @Patch("me")
  async updateMe(@Req() req: HttpRequest, @Body() body: unknown) {
    const user = await this.auth.userFromRequest(req);
    if (!user) throw new UnauthorizedException();
    const parsed = MeBody.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? "Nothing to change.");
    if (parsed.data.avatar !== undefined) await this.auth.setAvatar(user.id, parsed.data.avatar);
    if (parsed.data.tutorialDone !== undefined) await this.auth.setTutorialDone(user.id, parsed.data.tutorialDone);
    return { ok: true };
  }

  private async startSession(res: HttpResponse, userId: string) {
    const token = await this.auth.createSession(userId);
    setCookie(res, SESSION_COOKIE, token, { maxAgeSeconds: SESSION_DAYS * 24 * 3600, secure: this.auth.config.secureCookies });
  }
}
