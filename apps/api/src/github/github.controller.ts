import { BadRequestException, Controller, Headers, HttpCode, Inject, Logger, Post, Req, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { ArenaService } from "../arena/arena.service";
import { ChoresService, type GhEvent } from "./chores.service";
import { DeploysService } from "./deploys.service";
import type { GithubAppConfig } from "./github.config";
import { verifySignature } from "./webhook";

export const GITHUB_CONFIG = Symbol("GITHUB_CONFIG");

@Controller("github")
export class GithubController {
  private readonly log = new Logger("github");

  constructor(
    private readonly chores: ChoresService,
    private readonly deploys: DeploysService,
    private readonly arena: ArenaService,
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
    // Each side takes the events it cares about; "ignored" from all of them means nobody did.
    // The arena's: pull requests on the arena repo (arena/arena.service.ts).
    const results = [await this.chores.handle(event, payload), await this.deploys.handle(event, payload), await this.arena.handle(event, payload)].filter((r) => r !== "ignored");
    const result = results.join("; ") || "ignored";
    this.log.log(`${event}${payload.action ? `.${payload.action}` : ""} (${delivery ?? "?"}): ${result}`);
    return { result };
  }
}
