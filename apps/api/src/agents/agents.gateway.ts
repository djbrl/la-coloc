import { Logger } from "@nestjs/common";
import { OnGatewayConnection, WebSocketGateway } from "@nestjs/websockets";
import { parseAgentToApi } from "@coloc/protocol";
import type WebSocket from "ws";
import { HousesService } from "../houses/houses.service";
import { AgentRegistry } from "./agent.registry";

const HELLO_TIMEOUT_MS = 5000;

// The phone lines. An agent must say hello with its house's secret within 5 seconds,
// or the line is cut. Every message after that is validated before it touches anything.
@WebSocketGateway({ path: "/agent" })
export class AgentsGateway implements OnGatewayConnection {
  private readonly log = new Logger("agents");

  constructor(
    private readonly houses: HousesService,
    private readonly registry: AgentRegistry,
  ) {}

  handleConnection(socket: WebSocket) {
    let houseId: string | null = null;
    const helloTimer = setTimeout(() => socket.close(4000, "no hello"), HELLO_TIMEOUT_MS);
    // Messages are handled one at a time, in arrival order: "starting" must never land after "live".
    let queue = Promise.resolve();

    socket.on("message", (raw) => {
      queue = queue
        .then(() => this.handle(socket, raw.toString(), houseId, (id) => {
          clearTimeout(helloTimer);
          houseId = id;
        }))
        .catch((e) => this.log.error(`message from ${houseId ?? "unauthenticated agent"} failed: ${(e as Error).message}`));
    });

    socket.on("close", () => {
      clearTimeout(helloTimer);
      if (!houseId) return;
      this.registry.unregister(houseId, socket);
      if (!this.registry.isOnline(houseId)) this.houses.setAgentOnline(houseId, false);
      this.log.log(`agent offline: ${houseId}`);
    });
  }

  private async handle(socket: WebSocket, raw: string, houseId: string | null, authenticated: (houseId: string) => void) {
    let msg;
    try {
      msg = parseAgentToApi(raw);
    } catch {
      this.log.warn(`malformed message from ${houseId ?? "unauthenticated agent"}`);
      if (!houseId) socket.close(4000, "bad hello");
      return;
    }

    if (!houseId) {
      if (msg.type !== "hello" || !(await this.houses.verifyAgentSecret(msg.houseId, msg.secret))) {
        socket.close(4003, "unauthorized");
        return;
      }
      authenticated(msg.houseId);
      this.registry.register(msg.houseId, socket);
      this.houses.setAgentOnline(msg.houseId, true);
      this.log.log(`agent online: ${msg.houseId} (v${msg.agentVersion})`);
      return;
    }

    switch (msg.type) {
      case "deploy_status":
        await this.houses.recordDeployStatus(houseId, msg);
        break;
      case "usage":
        await this.houses.recordUsage(houseId, msg);
        break;
      case "room_event":
        await this.houses.recordRoomEvent(houseId, msg);
        break;
      case "rooms_snapshot":
        await this.houses.applySnapshot(houseId, msg);
        break;
    }
  }
}
