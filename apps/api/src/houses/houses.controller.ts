import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  MessageEvent,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  Sse,
  UnauthorizedException,
} from "@nestjs/common";
import { auditTime, concatMap, filter, from, interval, map, merge, Observable, startWith } from "rxjs";
import { z } from "zod";
import { AgentRegistry } from "../agents/agent.registry";
import { AuthService } from "../auth/auth.service";
import type { HttpRequest } from "../auth/http";
import { HousesService } from "./houses.service";
import { installCommand } from "./server";

// Starting a coloc on an empty lobby plot. The plot key comes from the lobby's neighbourhood generator:
// block column, block row, plot column, plot row ("2.1.0.1").
const RentBody = z.object({
  city: z.string().min(1).max(60),
  plot: z.string().regex(/^\d{1,2}\.\d{1,2}\.\d{1,2}\.[01]$/, "That isn't a plot in the lobby."),
  name: z.string().trim().min(2, "Give the house a name of at least 2 characters.").max(40, "Keep the name under 40 characters."),
  // Optional. An empty tagline is the same as none.
  tagline: z
    .string()
    .trim()
    .max(120, "Keep the tagline under 120 characters.")
    .nullish()
    .transform((t) => t || null),
});

// Renting the house's server. `renew`: make a new agent key even though one exists (the old one stops working).
const ServerBody = z.object({
  plan: z.enum(["small", "medium", "large"], { errorMap: () => ({ message: "Pick a small, medium or large server." }) }),
  renew: z.boolean().optional(),
});

// The house's review rule. Strict: a merge only goes online once a flatmate approves it.
const RulesBody = z.object({
  strictReviews: z.boolean({ errorMap: () => ({ message: "Say whether reviews are strict: true or false." }) }),
});

function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, body: unknown): T {
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw new BadRequestException(r.error.issues[0]?.message ?? "invalid request");
  return r.data;
}

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

  /**
   * The chef rents the house's server and gets the command that installs the agent on it. The answer holds
   * the agent's secret in clear: it's shown once, here, and only its hash is kept. Once the agent phones in
   * with it, the house goes live (see the agents gateway).
   */
  @Post(":id/server")
  @HttpCode(201)
  async rentServer(@Param("id") id: string, @Body() body: unknown, @Req() req: HttpRequest) {
    const user = await this.auth.userFromRequest(req);
    if (!user) throw new UnauthorizedException("Log in first.");
    if (!(await this.houses.exists(id))) throw new NotFoundException();
    if ((await this.houses.membership(id, user.id))?.role !== "chef") throw new ForbiddenException("Only the chef rents the server.");
    const input = parse(ServerBody, body);
    const { secret, plan, monthlyCostFcfa, domain } = await this.houses.rentServer(id, input.plan, input.renew === true);
    // A new key replaces the old one: an agent still on the line with the old key is hung up on.
    if (input.renew) this.agents.hangUp(id, "the house's key was replaced");
    return { secret, command: installCommand(id, secret, this.auth.config.publicUrl, domain), plan, monthlyCostFcfa };
  }

  // The chef switches the house between strict and relaxed reviews. The flatmates hear of it on the fridge.
  @Patch(":id/rules")
  async setRules(@Param("id") id: string, @Body() body: unknown, @Req() req: HttpRequest) {
    const user = await this.auth.userFromRequest(req);
    if (!user) throw new UnauthorizedException("Log in first.");
    if (!(await this.houses.exists(id))) throw new NotFoundException();
    if ((await this.houses.membership(id, user.id))?.role !== "chef") throw new ForbiddenException("Only the chef sets the house's rules.");
    const input = parse(RulesBody, body);
    return { rules: await this.houses.setRules(id, input.strictReviews, user.name ?? user.login) };
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
  constructor(
    private readonly houses: HousesService,
    private readonly auth: AuthService,
  ) {}

  // Starts a coloc on an empty plot: the house appears in the lobby, "in the making", with the chef in room one.
  @Post("houses")
  @HttpCode(201)
  async rent(@Body() body: unknown, @Req() req: HttpRequest) {
    const user = await this.auth.userFromRequest(req);
    if (!user) throw new UnauthorizedException("Log in first.");
    return this.houses.rent(user.id, parse(RentBody, body));
  }

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
