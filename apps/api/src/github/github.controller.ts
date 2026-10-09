import { BadRequestException, Controller, Headers, HttpCode, Inject, Logger, Post, Req, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { ChoresService, type GhEvent } from "./chores.service";
import type { GithubAppConfig } from "./github.config";
import { verifySignature } from "./webhook";

export const GITHUB_CONFIG = Symbol("GITHUB_CONFIG");

@Controller("github")
export class GithubController {
  private readonly log = new Logger("github");

  constructor(
    private readonly chores: ChoresService,
    @Inject(GITHUB_CONFIG) private readonly config: GithubAppConfig | null,
  ) {}

  // GitHub calls this for every event on repos where the App is installed. Signature first, then anything else.
  @Post("webhook")
  @HttpCode(200)
  async webhook(
    @Req() req: { rawBody?: Buffer },
    @Headers("x-hub-signature-256") signature: string | undefined,
    @Headers("x-github-event") event: string | undefined,
    @Headers("x-github-delivery") delivery: string | undefined,
  ) {
    if (!this.config) throw new ServiceUnavailableException("the GitHub App isn't configured on this server");
    if (!req.rawBody || !verifySignature(this.config.webhookSecret, req.rawBody, signature)) throw new UnauthorizedException("bad signature");
    if (!event) throw new BadRequestException("no event");
    let payload: GhEvent;
    try {
      payload = JSON.parse(req.rawBody.toString("utf8"));
    } catch {
      throw new BadRequestException("not JSON");
    }
    const result = await this.chores.handle(event, payload);
    this.log.log(`${event}${payload.action ? `.${payload.action}` : ""} (${delivery ?? "?"}): ${result}`);
    return { result };
  }
}
