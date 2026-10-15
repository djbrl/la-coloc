import { BadRequestException, Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import { z } from "zod";
import { AuthService } from "../auth/auth.service";
import type { HttpRequest } from "../auth/http";
import { CHAPTERS, TutorialService } from "./tutorial.service";

// POST /tutorial/progress: the chapter the newcomer just reached.
const ProgressBody = z.object({ chapter: z.enum(CHAPTERS, { message: "Pick one of the tutorial's chapters." }) });

// POST /tutorial/deploy: what to put online. Leave it out for "their repo if linked, else the starter".
const DeployBody = z.object({ source: z.enum(["starter", "github"], { message: "Pick the starter or your GitHub repo." }).optional() });

function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, body: unknown): T {
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw new BadRequestException(r.error.issues[0]?.message ?? "invalid request");
  return r.data;
}

// The bit of Express's response the room route needs: it answers 201 for a new room and 200 for the same one again.
interface JsonResponse {
  status(code: number): { json(body: unknown): unknown };
}

// The tutorial's steps, for the logged-in newcomer. The web side walks them through these in order.
@Controller("tutorial")
export class TutorialController {
  constructor(
    private readonly tutorial: TutorialService,
    private readonly auth: AuthService,
  ) {}

  private async user(req: HttpRequest) {
    const u = await this.auth.userFromRequest(req);
    if (!u) throw new UnauthorizedException("Log in first.");
    return u;
  }

  // Where they are: the workshop, their room (if they took one), the sample, GitHub, the furthest chapter, and
  // whether they're done.
  @Get()
  async state(@Req() req: HttpRequest) {
    return this.tutorial.state(await this.user(req));
  }

  // Take a room in the workshop. Asking again answers with the same room.
  @Post("room")
  async room(@Req() req: HttpRequest, @Res() res: JsonResponse) {
    const { created, room } = await this.tutorial.takeRoom(await this.user(req));
    return res.status(created ? 201 : 200).json({ room });
  }

  // Remember the chapter they reached (never going back). Answers the chapter stored.
  @Post("progress")
  @HttpCode(200)
  async progress(@Req() req: HttpRequest, @Body() body: unknown) {
    const user = await this.user(req);
    return this.tutorial.progress(user, parse(ProgressBody, body).chapter);
  }

  // Put a project online in that room: the starter page or their GitHub repo. Answers with the deployment's id, to
  // follow it on the house's stream.
  @Post("deploy")
  async deploy(@Req() req: HttpRequest, @Body() body?: unknown) {
    const user = await this.user(req);
    return this.tutorial.deploy(user, parse(DeployBody, body).source);
  }

  // Take the tutorial again: the room goes, and the tutorial counts as not done.
  @Post("reset")
  @HttpCode(200)
  async reset(@Req() req: HttpRequest) {
    return this.tutorial.reset(await this.user(req));
  }
}
