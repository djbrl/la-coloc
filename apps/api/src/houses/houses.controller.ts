import { BadRequestException, Body, ConflictException, Controller, Get, MessageEvent, NotFoundException, Param, Post, Sse } from "@nestjs/common";
import { DeployKind, RoomName } from "@coloc/protocol";
import { filter, map, merge, Observable, interval } from "rxjs";
import { z } from "zod";
import { AgentRegistry } from "../agents/agent.registry";
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
  ) {}

  @Get(":id")
  get(@Param("id") id: string) {
    if (!this.houses.get(id)) throw new NotFoundException();
    return this.houses.view(id);
  }

  // Live updates for the house page. Sends the whole (small) house view on every change,
  // plus a heartbeat so proxies don't close the connection.
  @Sse(":id/stream")
  stream(@Param("id") id: string): Observable<MessageEvent> {
    if (!this.houses.get(id)) throw new NotFoundException();
    const updates = this.houses.changes.pipe(
      filter((houseId) => houseId === id),
      map(() => ({ type: "house", data: this.houses.view(id) }) as MessageEvent),
    );
    const heartbeat = interval(25_000).pipe(map(() => ({ type: "ping", data: "" }) as MessageEvent));
    return merge(updates, heartbeat);
  }

  // Week-1 trigger. In week 2 the GitHub webhook calls the same code path.
  @Post(":id/rooms/:room/deploy")
  deploy(@Param("id") id: string, @Param("room") room: string, @Body() body: unknown) {
    const house = this.houses.get(id);
    if (!house) throw new NotFoundException();
    const roomName = RoomName.safeParse(room);
    const target = roomName.success ? house.rooms.get(roomName.data) : undefined;
    if (!target) throw new NotFoundException(`no room ${room}`);
    const parsed = DeployBody.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    if (!this.agents.isOnline(id)) throw new ConflictException("the house's agent is offline");

    const { repo, ref, path, kind, port } = parsed.data;
    const d = this.houses.createDeployment(id, target.name, kind, repo, ref);
    this.agents.send(id, { type: "deploy", deployId: d.id, room: target.name, kind, repo, ref, path, port, limits: target.limits, env: {} });
    return d;
  }
}
