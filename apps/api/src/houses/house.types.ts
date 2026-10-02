import type { DeployKind, RoomLimits } from "@coloc/protocol";

export interface Room {
  name: string;
  flatmate: string;
  limits: RoomLimits;
  status: "empty" | "deploying" | "live" | "down" | "failed";
  url?: string;
  lastDeployId?: string;
  usage?: { cpuPercent: number; memoryBytes: number; memoryLimitBytes: number; at: string };
}

export interface Deployment {
  id: string;
  room: string;
  kind: DeployKind;
  repo: string;
  ref: string;
  status: "queued" | "cloning" | "building" | "starting" | "live" | "failed";
  detail?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FridgeNote {
  id: string;
  tone: "info" | "warning" | "danger" | "thanks";
  text: string;
  room?: string;
  at: string;
  // Same note repeated within a few minutes is collapsed: "×4".
  count: number;
}

export interface House {
  id: string;
  name: string;
  domain: string;
  agentSecret: string;
  rooms: Map<string, Room>;
  deployments: Deployment[];
  notes: FridgeNote[];
  agentOnline: boolean;
}
