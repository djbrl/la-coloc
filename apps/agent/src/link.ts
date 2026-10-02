// The phone line to the API. The agent always dials out, so the house server
// exposes no control port. Reconnects with backoff when the line drops.
import { parseApiToAgent, type AgentToApi, type ApiToAgent } from "@coloc/protocol";
import WebSocket from "ws";
import type { AgentConfig } from "./config";

export interface Link {
  send: (msg: AgentToApi) => void;
  close: () => void;
}

export function connect(
  cfg: AgentConfig,
  version: string,
  onCommand: (cmd: ApiToAgent) => void,
  onConnected: () => void,
): Link {
  let ws: WebSocket | undefined;
  let backoffMs = 1000;
  let closed = false;
  const outbox: AgentToApi[] = [];

  const flush = () => {
    while (ws?.readyState === WebSocket.OPEN && outbox.length) ws.send(JSON.stringify(outbox.shift()));
  };

  const open = () => {
    ws = new WebSocket(cfg.apiUrl);
    ws.on("open", () => {
      backoffMs = 1000;
      ws!.send(JSON.stringify({ type: "hello", houseId: cfg.houseId, secret: cfg.secret, agentVersion: version }));
      console.log(`[link] connected to ${cfg.apiUrl}`);
      flush();
      onConnected();
    });
    ws.on("message", (data) => {
      try {
        onCommand(parseApiToAgent(data.toString()));
      } catch (e) {
        console.error(`[link] rejected a malformed command: ${(e as Error).message}`);
      }
    });
    ws.on("close", (code, reason) => {
      if (closed) return;
      console.warn(`[link] disconnected (${code} ${reason}), retrying in ${backoffMs / 1000}s`);
      setTimeout(open, backoffMs);
      backoffMs = Math.min(backoffMs * 2, 30_000);
    });
    ws.on("error", (e) => console.error(`[link] ${e.message}`));
  };

  open();
  return {
    send: (msg) => {
      // Usage samples are only useful fresh: don't queue them while offline.
      if (ws?.readyState !== WebSocket.OPEN && msg.type === "usage") return;
      outbox.push(msg);
      flush();
    },
    close: () => {
      closed = true;
      ws?.close();
    },
  };
}
