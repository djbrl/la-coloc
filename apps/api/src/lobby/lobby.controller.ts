import { Controller, Get, Req } from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import type { HttpRequest } from "../auth/http";

// GET /lobby/ticket: a one-minute pass to open the lobby's WebSocket from a page served on another host (see
// AuthService.issueTicket). A visitor gets null and connects as a visitor.
@Controller("lobby")
export class LobbyController {
  constructor(private readonly auth: AuthService) {}

  @Get("ticket")
  async ticket(@Req() req: HttpRequest) {
    const user = await this.auth.userFromRequest(req);
    return { ticket: user ? this.auth.issueTicket(user.id) : null };
  }
}
