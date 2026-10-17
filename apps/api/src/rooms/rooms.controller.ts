import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  GatewayTimeoutException,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { DeployKind } from "@coloc/protocol";
import { z } from "zod";
import { AgentRegistry } from "../agents/agent.registry";
import { LogsBroker } from "../agents/logs.broker";
import { AuthService } from "../auth/auth.service";
import type { HttpRequest } from "../auth/http";
import { isCoreDown } from "../core/core";
import { HousesService } from "../houses/houses.service";
import { noteText } from "../houses/lines";
import { RoomDeployer } from "./room-deployer";
import { RoomsService } from "./rooms.service";

const HTTPS_ONLY = "repo must be an https:// URL";
const REF = /^(?!.*\.\.)[A-Za-z0-9._\/-]{1,100}$/;
// A repo URL to clone by hand. Never with credentials in it: those come from the GitHub App, fresh each time. Never
// file:// either: that would be a folder on the house's own disk (the quest's starter page is the server's to pick).
const RepoUrl = z
  .string()
  .max(300)
  .regex(/^https:\/\/[^/\s]+\/\S+$/, HTTPS_ONLY)
  .refine((u) => !/^https:\/\/[^/]*@/.test(u), "don't put credentials in the URL: link the repo with the GitHub App instead");

const Settings = z.object({
  project: z.string().max(60).nullish(),
  projectDescription: z.string().max(200).nullish(),
  branch: z.string().regex(REF, "not a branch name").nullish(),
  buildPath: z.string().regex(/^(?!.*\.\.)[A-Za-z0-9._\/-]{1,200}$/, "a folder inside the repo, like apps/api").optional(),
  port: z.number().int().min(1).max(65535).nullish(),
  // "file://" is how the room page shows the quest's starter page (rooms.service view): sent back, it means "as is".
  source: z.union([z.literal("file://").transform(() => undefined), RepoUrl.nullish()]),
});
const DeployBody = z.object({
  repo: RepoUrl.optional(),
  ref: z.string().regex(REF).optional(),
  path: z.string().regex(/^(?!.*\.\.)[A-Za-z0-9._\/-]{1,200}$/).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  kind: DeployKind.default("prod"),
});
const SecretBody = z.object({ value: z.string().max(4096) });

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body ?? {});
  const message = r.success ? "" : (r.error.issues[0]?.message ?? "invalid request");
  if (!r.success) throw new BadRequestException(message === HTTPS_ONLY ? { message, code: "httpsRepo" } : message);
  return r.data;
}


// A seeded example room (the workshop's made-up learners) is only there to be looked at: nothing runs in it.
const EXAMPLE_ROOM = "This is an example room: nothing runs in it.";

@Controller("houses/:id/rooms/:room")
export class RoomsController {
  constructor(
    private readonly rooms: RoomsService,
    private readonly deployer: RoomDeployer,
    private readonly houses: HousesService,
    private readonly agents: AgentRegistry,
    private readonly logs: LogsBroker,
    private readonly auth: AuthService,
  ) {}

  private async user(req: HttpRequest) {
    const u = await this.auth.userFromRequest(req);
    if (!u) throw new UnauthorizedException("log in first");
    return u;
  }

  @Get("manage")
  async manage(@Param("id") id: string, @Param("room") room: string, @Req() req: HttpRequest) {
    return this.rooms.view(id, room, (await this.user(req)).id);
  }

  @Patch("settings")
  async settings(@Param("id") id: string, @Param("room") room: string, @Body() body: unknown, @Req() req: HttpRequest) {
    await this.rooms.updateSettings(id, room, (await this.user(req)).id, parse(Settings, body));
    return { ok: true };
  }

  @Put("secrets/:name")
  async setSecret(@Param("id") id: string, @Param("room") room: string, @Param("name") name: string, @Body() body: unknown, @Req() req: HttpRequest) {
    await this.rooms.setSecret(id, room, (await this.user(req)).id, name, parse(SecretBody, body).value);
    return { ok: true };
  }

  @Delete("secrets/:name")
  async deleteSecret(@Param("id") id: string, @Param("room") room: string, @Param("name") name: string, @Req() req: HttpRequest) {
    await this.rooms.deleteSecret(id, room, (await this.user(req)).id, name);
    return { ok: true };
  }

  // Deploy from a repo URL (saved as the room's source), or from the room's settings when none is given.
  @Post("deploy")
  async deploy(@Param("id") id: string, @Param("room") roomName: string, @Body() body: unknown, @Req() req: HttpRequest) {
    const user = await this.user(req);
    const { room } = await this.rooms.manageable(id, roomName, user.id);
    const b = parse(DeployBody, body);
    if (b.repo || b.ref || b.path || b.port) {
      await this.rooms.updateSettings(id, roomName, user.id, { source: b.repo, branch: b.ref, buildPath: b.path, port: b.port });
    }
    return this.redeployRoom(id, roomName, user.id, b.kind ?? "prod", room.occupantId);
  }

  // Build and deploy again from wherever the room's code comes from: its GitHub repo, or its saved repo URL.
  @Post("redeploy")
  async redeploy(@Param("id") id: string, @Param("room") roomName: string, @Req() req: HttpRequest) {
    const user = await this.user(req);
    await this.rooms.manageable(id, roomName, user.id);
    return this.redeployRoom(id, roomName, user.id, "prod");
  }

  @Post("restart")
  @HttpCode(200)
  async restart(@Param("id") id: string, @Param("room") roomName: string, @Req() req: HttpRequest) {
    const user = await this.user(req);
    const { room } = await this.rooms.manageable(id, roomName, user.id);
    if (room.demo) throw new ConflictException(EXAMPLE_ROOM);
    if (!this.agents.isOnline(id)) throw new ConflictException("The house's server is offline.");
    this.agents.send(id, { type: "restart_room", room: room.name });
    // People, not room slugs: "Jib restarted their app", or "Jib restarted Awa's app" when the chef does it.
    const name = user.name ?? user.login;
    const text =
      room.occupantId === user.id
        ? noteText("restartedOwn", { name })
        : room.occupantId
          ? noteText("restartedOther", { name, other: await this.houses.occupantName(room.occupantId) })
          : noteText("restartedFree", { name });
    await this.houses.note(id, { tone: "info", room: room.name, text });
    return { ok: true };
  }

  @Get("logs")
  async roomLogs(@Param("id") id: string, @Param("room") roomName: string, @Query("kind") kind: string | undefined, @Query("lines") lines: string | undefined, @Req() req: HttpRequest) {
    const user = await this.user(req);
    const { room } = await this.rooms.manageable(id, roomName, user.id);
    const k = DeployKind.catch("prod").parse(kind);
    const n = Math.min(1000, Math.max(1, Number(lines) || 200));
    if (!this.agents.isOnline(id)) throw new ConflictException("The house's server is offline.");
    try {
      return { text: await this.logs.fetch(id, room.name, k, n) };
    } catch (e) {
      throw new GatewayTimeoutException((e as Error).message);
    }
  }

  private async redeployRoom(id: string, roomName: string, userId: string, kind: "prod" | "preview", requestedBy?: string | null) {
    const { room } = await this.rooms.manageable(id, roomName, userId);
    if (room.demo) throw new ConflictException(EXAMPLE_ROOM);
    const source = await this.deployer.source(room);
    if (!source) throw new BadRequestException("This room has no code yet: give it a repo URL, or install the GitHub App on your repo.");
    await this.deployer.brake(room, kind, userId);
    try {
      return await this.deployer.deploy({ room, kind, source, requestedBy: requestedBy ?? userId });
    } catch (e) {
      if (isCoreDown(e)) throw e;
      throw new ConflictException((e as Error).message);
    }
  }
}
