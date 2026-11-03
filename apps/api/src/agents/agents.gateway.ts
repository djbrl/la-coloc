import { Logger } from "@nestjs/common";
import { OnGatewayConnection, WebSocketGateway } from "@nestjs/websockets";
import { parseAgentToApi } from "@coloc/protocol";
import type { IncomingMessage } from "node:http";
import type WebSocket from "ws";
import { Core, isCoreDown } from "../core/core";
import { HousesService } from "../houses/houses.service";
import { AgentRegistry } from "./agent.registry";
import { LogsBroker } from "./logs.broker";
import { ShellBroker } from "./shell.broker";

const HELLO_TIMEOUT_MS = 5000;
// WebSocket close code 1013, "try again later": what we say when the database can't take the call right now.
// The agent redials by itself (and sends its full snapshot again when it does), so nothing is lost.
export const TRY_AGAIN_LATER = 1013;

// Headers Cloudflare (the tunnel that shares a laptop's API, and any CDN in front of a real one) adds to every request.
const TUNNEL_HEADERS = ["cf-connecting-ip", "cf-ray", "cdn-loop"];
export function viaTunnel(req: Pick<IncomingMessage, "headers">): boolean {
  return TUNNEL_HEADERS.some((h) => req.headers[h] !== undefined);
}

// The phone lines. An agent must say hello with its house's secret within 5 seconds,
// or the line is cut. Every message after that is validated before it touches anything.
@WebSocketGateway({ path: "/agent" })
export class AgentsGateway implements OnGatewayConnection {
  private readonly log = new Logger("agents");

  constructor(
    private readonly houses: HousesService,
    private readonly registry: AgentRegistry,
    private readonly logs: LogsBroker,
    private readonly shells: ShellBroker,
    private readonly core: Core,
  ) {}

  onModuleInit() {
    // Who's in a room over SSH shows on its page, so that page hears when it changes.
    this.shells.peopleChanged.subscribe((houseId) => this.houses.changes.next(houseId));
  }

  handleConnection(socket: WebSocket, req?: IncomingMessage) {
    // A caretaker dials the API directly (on its own machine, or over wss to the real server). One that comes in
    // through a public tunnel or CDN is someone else trying their luck with a house key: the line is never offered there.
    if (req && viaTunnel(req)) {
      socket.close(4003, "not here");
      return;
    }
    // Not ready yet (the database hasn't answered since we started): we can't check anybody's secret. Politely refuse.
    if (!this.core.ready) {
      socket.close(TRY_AGAIN_LATER, "try again later");
      return;
    }
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
        .catch((e) => {
          if (isCoreDown(e)) {
            // The database went away mid-call. One line per outage (Core de-duplicates), and the agent is asked to call back.
            this.core.reportDown(e);
            socket.close(TRY_AGAIN_LATER, "try again later");
            return;
          }
          this.log.error(`message from ${houseId ?? "unauthenticated agent"} failed: ${(e as Error).message}`);
        });
    });

    socket.on("close", () => {
      clearTimeout(helloTimer);
      if (!houseId) return;
      this.registry.unregister(houseId, socket);
      if (!this.registry.isOnline(houseId)) {
        this.houses.setAgentOnline(houseId, false);
        this.shells.houseGone(houseId);
      }
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
      // Before anything new can be sent to it: what it doesn't know about now, it never will.
      if (msg.building) await this.houses.failLostBuilds(msg.houseId, msg.building);
      // Any shells it had are on the old line, and it closes them when this one opens.
      this.shells.houseGone(msg.houseId);
      this.registry.register(msg.houseId, socket);
      this.houses.setAgentOnline(msg.houseId, true);
      // The first time a new house's agent phones in, the house is no longer "in the making".
      if (await this.houses.markLive(msg.houseId)) this.log.log(`house is live: ${msg.houseId}`);
      this.log.log(`agent online: ${msg.houseId} (v${msg.agentVersion})`);
      return;
    }

    switch (msg.type) {
      case "shell_output":
        this.shells.output(houseId, msg);
        break;
      case "shell_exit":
        this.shells.exit(houseId, msg);
        break;
      case "deploy_status":
        await this.houses.recordDeployStatus(houseId, msg);
        break;
      case "inspected":
        this.logs.deliverFindings(houseId, msg);
        break;
      case "deploy_log":
        this.logs.addBuildLines(houseId, msg);
        break;
      case "usage":
        await this.houses.recordUsage(houseId, msg);
        break;
      case "room_event":
        await this.houses.recordRoomEvent(houseId, msg);
        break;
      case "rooms_snapshot": {
        // A free room still running something (someone moved out, a leftover from a test): clear it out.
        const leftovers = await this.houses.applySnapshot(houseId, msg);
        for (const room of leftovers) this.registry.send(houseId, { type: "remove_room", room });
        break;
      }
      case "inside":
        this.logs.deliverInside(houseId, msg);
        break;
      case "logs":
        this.logs.deliver(houseId, msg);
        break;
    }
  }
}
