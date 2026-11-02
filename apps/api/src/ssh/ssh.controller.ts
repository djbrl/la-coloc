// Your SSH keys, for the room page's SSH tab (RoomSsh.vue). Public keys only.
import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Req, UnauthorizedException } from "@nestjs/common";
import { z } from "zod";
import { AuthService } from "../auth/auth.service";
import type { HttpRequest } from "../auth/http";
import { SshService } from "./ssh.service";

const AddKey = z.object({ key: z.string().min(1).max(16_000) });
const UUID = z.string().uuid();

@Controller("me/ssh-keys")
export class SshController {
  constructor(
    private readonly auth: AuthService,
    private readonly ssh: SshService,
  ) {}

  private async user(req: HttpRequest) {
    const u = await this.auth.userFromRequest(req);
    if (!u) throw new UnauthorizedException("log in first");
    return u;
  }

  @Get()
  async list(@Req() req: HttpRequest) {
    const user = await this.user(req);
    return { keys: await this.ssh.keys(user.id), github: !!user.githubId, fetchFromGithub: !!user.githubId && !user.sshKeysChosen };
  }

  @Post()
  async add(@Body() body: unknown, @Req() req: HttpRequest) {
    const user = await this.user(req);
    const parsed = AddKey.safeParse(body);
    if (!parsed.success) throw new BadRequestException("Paste your public key.");
    return { keys: await this.ssh.add(user.id, parsed.data.key) };
  }

  // Only a real GitHub account: a dev login's or seeded person's name may be a stranger's on GitHub.
  @Post("github")
  async github(@Req() req: HttpRequest) {
    const user = await this.user(req);
    if (!user.githubId) throw new BadRequestException({ message: "This account isn't a GitHub account.", code: "sshNoGithub" });
    return this.ssh.importGithub(user.id, user.login);
  }

  @Delete(":id")
  async remove(@Param("id") id: string, @Req() req: HttpRequest) {
    const user = await this.user(req);
    if (!UUID.safeParse(id).success) throw new BadRequestException("No such key.");
    return { keys: await this.ssh.remove(user.id, id) };
  }
}
