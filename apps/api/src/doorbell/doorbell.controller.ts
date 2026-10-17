import { BadRequestException, Body, Controller, Get, HttpCode, MessageEvent, Param, Post, Req, Sse, UnauthorizedException } from "@nestjs/common";
import { RoomName } from "@coloc/protocol";
import { auditTime, concatMap, filter, from, interval, map, merge, Observable } from "rxjs";
import { z } from "zod";
import { AuthService } from "../auth/auth.service";
import { skipWhileCoreDown } from "../core/streams";
import type { HttpRequest } from "../auth/http";
import { DoorbellService, MAX_MESSAGE } from "./doorbell.service";

const KnockBody = z.object({
  room: RoomName,
  message: z.string().min(1).max(MAX_MESSAGE),
  repo: z.string().regex(/^https:\/\//, "repo must be an https:// URL").max(300).nullish(),
});
const MessageBody = z.object({ body: z.string().min(1).max(MAX_MESSAGE) });
const VoteBody = z.object({ yes: z.boolean() });

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw new BadRequestException(r.error.issues[0]?.message ?? "invalid request");
  return r.data;
}

@Controller()
export class DoorbellController {
  constructor(
    private readonly doorbell: DoorbellService,
    private readonly auth: AuthService,
  ) {}

  private async user(req: HttpRequest) {
    const u = await this.auth.userFromRequest(req);
    if (!u) throw new UnauthorizedException({ message: "Log in first.", code: "logInFirst" });
    return u;
  }

  @Post("houses/:id/knock")
  async knock(@Param("id") houseId: string, @Body() body: unknown, @Req() req: HttpRequest) {
    const user = await this.user(req);
    const { room, message, repo } = parse(KnockBody, body);
    return this.doorbell.knock(houseId, room, user.id, { message, repo });
  }

  @Post("houses/:id/messages")
  @HttpCode(200)
  async postToHouse(@Param("id") houseId: string, @Body() body: unknown, @Req() req: HttpRequest) {
    const user = await this.user(req);
    await this.doorbell.postToHouse(houseId, user.id, parse(MessageBody, body).body);
    return { ok: true };
  }

  @Get("applications/:id")
  async get(@Param("id") id: string, @Req() req: HttpRequest) {
    return this.doorbell.view(id, (await this.user(req)).id);
  }

  // The thread, live. Checked once on connect; the view itself re-checks on every push.
  @Sse("applications/:id/stream")
  async stream(@Param("id") id: string, @Req() req: HttpRequest): Promise<Observable<MessageEvent>> {
    const user = await this.user(req);
    await this.doorbell.view(id, user.id);
    const updates = this.doorbell.changes.pipe(
      filter((appId) => appId === id),
      auditTime(150),
      concatMap(() => from(this.doorbell.view(id, user.id)).pipe(skipWhileCoreDown())),
      map((data) => ({ type: "application", data }) as MessageEvent),
    );
    const heartbeat = interval(25_000).pipe(map(() => ({ type: "ping", data: "" }) as MessageEvent));
    return merge(updates, heartbeat);
  }

  @Post("applications/:id/messages")
  @HttpCode(200)
  async post(@Param("id") id: string, @Body() body: unknown, @Req() req: HttpRequest) {
    const user = await this.user(req);
    await this.doorbell.postToApplication(id, user.id, parse(MessageBody, body).body);
    return { ok: true };
  }

  @Post("applications/:id/vote")
  @HttpCode(200)
  async vote(@Param("id") id: string, @Body() body: unknown, @Req() req: HttpRequest) {
    const user = await this.user(req);
    return this.doorbell.vote(id, user.id, parse(VoteBody, body).yes);
  }

  @Post("applications/:id/withdraw")
  @HttpCode(200)
  async withdraw(@Param("id") id: string, @Req() req: HttpRequest) {
    const user = await this.user(req);
    await this.doorbell.withdraw(id, user.id);
    return { ok: true };
  }
}
