import { Injectable } from "@nestjs/common";
import type { ApiToAgent } from "@coloc/protocol";
import type WebSocket from "ws";

// Who's on the line: one live connection per house.
@Injectable()
export class AgentRegistry {
  private sockets = new Map<string, WebSocket>();

  register(houseId: string, socket: WebSocket) {
    // A reconnecting agent replaces its old line.
    this.sockets.get(houseId)?.close(4001, "replaced by a newer connection");
    this.sockets.set(houseId, socket);
  }

  unregister(houseId: string, socket: WebSocket) {
    if (this.sockets.get(houseId) === socket) this.sockets.delete(houseId);
  }

  isOnline(houseId: string): boolean {
    return this.sockets.get(houseId)?.readyState === 1;
  }

  send(houseId: string, cmd: ApiToAgent) {
    const socket = this.sockets.get(houseId);
    if (!socket || socket.readyState !== 1) throw new Error(`agent for ${houseId} is offline`);
    socket.send(JSON.stringify(cmd));
  }
}
