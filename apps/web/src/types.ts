// Mirrors the API's house view (apps/api/src/houses/houses.service.ts → view()).
export interface Room {
  name: string;
  flatmate: string;
  limits: { memoryMb: number; cpus: number };
  status: "empty" | "deploying" | "live" | "down" | "failed";
  url?: string;
  usage?: { cpuPercent: number; memoryBytes: number; memoryLimitBytes: number; at: string };
}

export interface Deployment {
  id: string;
  room: string;
  kind: "prod" | "preview";
  ref: string;
  status: string;
  detail?: string;
  updatedAt: string;
}

export interface FridgeNote {
  id: string;
  tone: "info" | "warning" | "danger" | "thanks";
  text: string;
  at: string;
  count: number;
}

export interface HouseView {
  id: string;
  name: string;
  domain: string;
  agentOnline: boolean;
  rooms: Room[];
  deployments: Deployment[];
  notes: FridgeNote[];
}
