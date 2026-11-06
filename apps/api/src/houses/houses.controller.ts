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
  Optional,
  Param,
  Patch,
  Post,
  Req,
  Sse,
  UnauthorizedException,
} from "@nestjs/common";
import { auditTime, concatMap, defer, filter, from, interval, map, merge, Observable } from "rxjs";
import { z } from "zod";
import { AgentRegistry } from "../agents/agent.registry";
import { AuthService } from "../auth/auth.service";
import { skipWhileCoreDown } from "../core/streams";
import type { HttpRequest } from "../auth/http";
import { HousesService } from "./houses.service";
import { Landlord } from "./landlord";
import { billReference, MAX_SERVERS_PER_PERSON, monthOf } from "./money";
import { takePayment } from "./payment";
import { installCommand, PLAN_COST_FCFA } from "./server";

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

// Paying for it: the same choice. It comes out of the chef's credit.
const PayBody = ServerBody;

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
    @Optional() private readonly landlord?: Landlord,
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
      concatMap(() => from(this.houses.view(id, viewer?.id)).pipe(skipWhileCoreDown())),
      map((data) => ({ type: "house", data }) as MessageEvent),
    );
    const heartbeat = interval(25_000).pipe(map(() => ({ type: "ping", data: "" }) as MessageEvent));
    return merge(updates, heartbeat);
  }

  /**
   * The chef rents the house's server and gets the command that installs the agent on it. The answer holds
   * the agent's secret in clear: it's shown once, here, and only its hash is kept. Once the agent phones in
   * with it, the house goes live (see the agents gateway). Tests and laptop dev use this; the rent window doesn't any
   * more (paying for the server is the one way in there), and paying with `renew` replaces a key made here.
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

  // The chef pays the first month from their credit and the server comes by itself: the whole flow, with fake money and
  // this machine in place of a hosting provider (landlord.ts). No machine to give, no credit taken. If anything after
  // the payment fails, the credit goes back. A house already paid for pays nothing to get a new key.
  @Post(":id/server/pay")
  @HttpCode(201)
  async payForServer(@Param("id") id: string, @Body() body: unknown, @Req() req: HttpRequest) {
    const user = await this.auth.userFromRequest(req);
    if (!user) throw new UnauthorizedException("Log in first.");
    if (!(await this.houses.exists(id))) throw new NotFoundException();
    if ((await this.houses.membership(id, user.id))?.role !== "chef") throw new ForbiddenException("Only the chef rents the server.");
    const input = parse(PayBody, body);
    if (!this.landlord?.hasRoom(id)) throw new ConflictException({ code: "no_server", message: "No server free right now." });
    if ((await this.houses.serversOf(user.id, id)) >= MAX_SERVERS_PER_PERSON) {
      // `house`: the one they run, so the window can take them there.
      throw new ConflictException({ code: "server_limit", house: await this.houses.serverOf(user.id, id), message: "One server a person: you already run one. You can take more rooms in that house." });
    }
    const renew = input.renew === true;
    const key = `server:${id}:${user.id}`;
    const charged = await this.houses.credit.spend(user.id, PLAN_COST_FCFA[input.plan], "server", key);
    try {
      const { plan, monthlyCostFcfa } = await this.houses.rentServer(id, input.plan, renew, this.landlord.secretFor(id));
      const domain = await this.houses.setDomain(id, this.landlord.domainFor(id));
      if (renew) this.agents.hangUp(id, "the house's key was replaced");
      const receipt = await takePayment({ amount: monthlyCostFcfa, operator: "credit", reference: billReference(id, monthOf(new Date())) });
      await this.houses.markBillPaid(id, user.id);
      // Whoever moved in while the house was being set up pays their share now that it has a bill.
      await this.houses.rentCollector.chargeHouse(id);
      this.landlord.start(id, domain);
      return { plan, monthlyCostFcfa, ...receipt };
    } catch (e) {
      if (charged) await this.houses.credit.refund(user.id, key);
      throw e;
    }
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

  // A flatmate pays their own line of this month's bill from their credit. Rent goes by itself (rent.ts); this is for
  // a month it couldn't take, once they have the credit.
  @Post(":id/bill/paid")
  @HttpCode(200)
  async billPaid(@Param("id") id: string, @Req() req: HttpRequest) {
    const user = await this.auth.userFromRequest(req);
    if (!user) throw new UnauthorizedException("Log in first.");
    if (!(await this.houses.exists(id))) throw new NotFoundException();
    if (!(await this.houses.membership(id, user.id))) throw new ForbiddenException("Only flatmates pay this house's bill.");
    return { ok: true, ...(await this.houses.rentCollector.pay(id, user.id)) };
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

  // The city, live: all of it first, then only the houses that changed, at most once a second.
  @Sse("stream")
  stream(): Observable<MessageEvent> {
    const updates = merge(this.houses.cityChanges, defer(() => from(this.houses.citySnapshot())).pipe(skipWhileCoreDown())).pipe(
      map((data) => ({ type: "city", data }) as MessageEvent),
    );
    const heartbeat = interval(25_000).pipe(map(() => ({ type: "ping", data: "" }) as MessageEvent));
    return merge(updates, heartbeat);
  }
}
