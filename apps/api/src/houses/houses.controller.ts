import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  MessageEvent,
  NotFoundException,
  Param,
  Post,
  Req,
  Sse,
  UnauthorizedException,
} from "@nestjs/common";
import { DeployKind, RoomName } from "@coloc/protocol";
import { auditTime, concatMap, filter, from, interval, map, merge, Observable, startWith } from "rxjs";
import { z } from "zod";
import { AgentRegistry } from "../agents/agent.registry";
import { AuthService } from "../auth/auth.service";
import type { HttpRequest } from "../auth/http";
import { HousesService } from "./houses.service";

const DeployBody = z.object({
  repo: z.string().regex(/^(https:\/\/|file:\/\/)/, "repo must be an https:// or file:// URL"),
  ref: z.string().default("main"),
  path: z.string().default("."),
  kind: DeployKind.default("prod"),
  port: z.number().int().min(1).max(65535).optional(),
});

@Controller("houses")
export class HousesController {
  constructor(
    private readonly houses: HousesService,
    private readonly agents: AgentRegistry,
    private readonly auth: AuthService,
  ) {}

  // The house profile. Public; flatmates also get deployments and fridge notes.
  @Get(":id")
  async get(@Param("id") id: string, @Req() req: HttpRequest) {
    const viewer = await this.auth.userFromRequest(req);
    const view = await this.houses.view(id, viewer?.id);
    if (!view) throw new NotFoundException();
    return view;
  }

  // Live updates for the house page: the whole (small) view, as this viewer sees it, on every change.
  // Bursts (a deploy reports several steps a second) are coalesced. A heartbeat keeps proxies from closing it.
  @Sse(":id/stream")
  async stream(@Param("id") id: string, @Req() req: HttpRequest): Promise<Observable<MessageEvent>> {
    if (!(await this.houses.exists(id))) throw new NotFoundException();
    const viewer = await this.auth.userFromRequest(req);
    const updates = this.houses.changes.pipe(
      filter((houseId) => houseId === id),
      auditTime(250),
      concatMap(() => from(this.houses.view(id, viewer?.id))),
      map((data) => ({ type: "house", data }) as MessageEvent),
    );
    const heartbeat = interval(25_000).pipe(map(() => ({ type: "ping", data: "" }) as MessageEvent));
    return merge(updates, heartbeat);
  }

  // Week-1 trigger. In week 2 the GitHub webhook calls the same code path.
  @Post(":id/rooms/:room/deploy")
  async deploy(@Param("id") id: string, @Param("room") room: string, @Body() body: unknown, @Req() req: HttpRequest) {
    const user = await this.auth.userFromRequest(req);
    if (!user) throw new UnauthorizedException("log in to deploy");
    const roomName = RoomName.safeParse(room);
    const target = roomName.success ? await this.houses.room(id, roomName.data) : undefined;
    if (!target) throw new NotFoundException(`no room ${room}`);
    const membership = await this.houses.membership(id, user.id);
    // Your own room, or any room if you're the chef.
    if (target.occupantId !== user.id && membership?.role !== "chef") throw new ForbiddenException("this isn't your room");
    const parsed = DeployBody.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    if (!this.agents.isOnline(id)) throw new ConflictException("the house's agent is offline");

    const { repo, ref, path, kind, port } = parsed.data;
    const d = await this.houses.createDeployment(id, target.name, kind, repo, ref, user.id);
    this.agents.send(id, {
      type: "deploy",
      deployId: d.id,
      room: target.name,
      kind,
      repo,
      ref,
      path,
      port,
      limits: { memoryMb: target.memoryMb, cpus: target.cpus },
      env: {},
    });
    return d;
  }

  // Empties a room: every container in it is stopped and removed. The base for eviction, so chef only.
  @Post(":id/rooms/:room/empty")
  async empty(@Param("id") id: string, @Param("room") room: string, @Req() req: HttpRequest) {
    const user = await this.auth.userFromRequest(req);
    if (!user) throw new UnauthorizedException();
    const target = await this.houses.room(id, room);
    if (!target) throw new NotFoundException();
    if ((await this.houses.membership(id, user.id))?.role !== "chef") throw new ForbiddenException("only the chef can empty a room");
    if (!this.agents.isOnline(id)) throw new ConflictException("the house's agent is offline");
    this.agents.send(id, { type: "remove_room", room: target.name });
    await this.houses.emptyRoom(id, target.name);
    return { ok: true };
  }
}

@Controller("city")
export class CityController {
  constructor(private readonly houses: HousesService) {}

  // Every house in the city. Public.
  @Get()
  city() {
    return this.houses.city();
  }

  // The city, live: re-sent whenever any house changes, at most once a second.
  @Sse("stream")
  stream(): Observable<MessageEvent> {
    const updates = this.houses.changes.pipe(
      auditTime(1000),
      startWith("first"),
      concatMap(() => from(this.houses.city())),
      map((data) => ({ type: "city", data }) as MessageEvent),
    );
    const heartbeat = interval(25_000).pipe(map(() => ({ type: "ping", data: "" }) as MessageEvent));
    return merge(updates, heartbeat);
  }
}
