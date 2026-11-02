// The phone line to the API. The agent always dials out, so the house server
// exposes no control port. Reconnects with backoff when the line drops.
import { parseApiToAgent, type AgentToApi, type ApiToAgent } from "@coloc/protocol";
import WebSocket from "ws";
import type { AgentConfig } from "./config";

const STEADY_MS = 10_000;

export interface Link {
  send: (msg: AgentToApi) => void;
  close: () => void;
}

export function connect(
  cfg: AgentConfig,
  version: string,
  onCommand: (cmd: ApiToAgent) => void,
  onConnected: () => void,
  building: () => string[] = () => [],
): Link {
  let ws: WebSocket | undefined;
  let backoffMs = 1000;
  let openedAt = 0;
  let closed = false;
  const outbox: AgentToApi[] = [];

  const flush = () => {
    while (ws?.readyState === WebSocket.OPEN && outbox.length) ws.send(JSON.stringify(outbox.shift()));
  };

  const open = () => {
    ws = new WebSocket(cfg.apiUrl);
    ws.on("open", () => {
      openedAt = Date.now();
      ws!.send(JSON.stringify({ type: "hello", houseId: cfg.houseId, secret: cfg.secret, agentVersion: version, building: building() }));
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
      // Only a line that held counts as back: one hung up on at once (a key it no longer accepts) keeps slowing down.
      if (Date.now() - openedAt > STEADY_MS) backoffMs = 1000;
      console.warn(`[link] disconnected (${code} ${reason}), retrying in ${backoffMs / 1000}s`);
      setTimeout(open, backoffMs);
      backoffMs = Math.min(backoffMs * 2, 30_000);
    });
    ws.on("error", (e) => console.error(`[link] ${e.message}`));
  };

  open();
  return {
    send: (msg) => {
      // Usage samples and build lines are only useful fresh: don't queue them while offline.
      if (ws?.readyState !== WebSocket.OPEN && (msg.type === "usage" || msg.type === "deploy_log" || msg.type === "shell_output" || msg.type === "shell_exit")) return;
      outbox.push(msg);
      flush();
    },
    close: () => {
      closed = true;
      ws?.close();
    },
  };
}
