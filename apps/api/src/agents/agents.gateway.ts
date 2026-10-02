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

    socket.on("message", (raw) => {
      let msg;
      try {
        msg = parseAgentToApi(raw.toString());
      } catch {
        this.log.warn(`malformed message from ${houseId ?? "unauthenticated agent"}`);
        if (!houseId) socket.close(4000, "bad hello");
        return;
      }

      if (!houseId) {
        if (msg.type !== "hello" || !this.houses.verifyAgentSecret(msg.houseId, msg.secret)) {
          socket.close(4003, "unauthorized");
          return;
        }
        clearTimeout(helloTimer);
        houseId = msg.houseId;
        this.registry.register(houseId, socket);
        this.houses.setAgentOnline(houseId, true);
        this.log.log(`agent online: ${houseId} (v${msg.agentVersion})`);
        return;
      }

      switch (msg.type) {
        case "deploy_status":
          this.houses.recordDeployStatus(houseId, msg);
          break;
        case "usage":
          this.houses.recordUsage(houseId, msg);
          break;
        case "room_event":
          this.houses.recordRoomEvent(houseId, msg);
          break;
        case "rooms_snapshot":
          this.houses.applySnapshot(houseId, msg);
          break;
      }
    });

    socket.on("close", () => {
      clearTimeout(helloTimer);
      if (!houseId) return;
      this.registry.unregister(houseId, socket);
      if (!this.registry.isOnline(houseId)) this.houses.setAgentOnline(houseId, false);
      this.log.log(`agent offline: ${houseId}`);
    });
  }
}
