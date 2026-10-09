// Mirrors the API's views (apps/api/src/houses/house.types.ts). Keep the two in step.
export type RoomStatus = "empty" | "deploying" | "live" | "down" | "failed";
export type HouseStatus = "making" | "live";
export type MemberRole = "chef" | "flatmate";

export interface Person {
  login: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface RoomUsage {
  cpuPercent: number;
  memoryBytes: number;
  memoryLimitBytes: number;
  at: string;
}

export interface Room {
  name: string;
  limits: { memoryMb: number; cpus: number };
  status: RoomStatus;
  url: string | null;
  project: string | null;
  projectDescription: string | null;
  ad: string | null;
  occupant: Person | null;
  usage: RoomUsage | null;
}

export interface Deployment {
  id: string;
  room: string;
  kind: "prod" | "preview";
  ref: string;
  status: string;
  detail: string | null;
  updatedAt: string;
}

export interface FridgeNote {
  id: string;
  tone: "info" | "warning" | "danger" | "thanks";
  text: string;
  room: string | null;
  at: string;
  count: number;
}

export interface Viewer {
  login: string;
  member: boolean;
  role: MemberRole | null;
  room: string | null;
}

export interface HouseView {
  id: string;
  name: string;
  city: string;
  country: string;
  tagline: string | null;
  status: HouseStatus;
  demo: boolean;
  domain: string;
  agentOnline: boolean;
  monthlyCostFcfa: number | null;
  rules: { strictReviews: boolean };
  chef: Person | null;
  members: (Person & { role: MemberRole })[];
  rooms: Room[];
  viewer: Viewer | null;
  // Flatmates only; null for everyone else.
  deployments: Deployment[] | null;
  notes: FridgeNote[] | null;
}

export interface CityHouse {
  id: string;
  name: string;
  city: string;
  country: string;
  tagline: string | null;
  status: HouseStatus;
  demo: boolean;
  agentOnline: boolean;
  monthlyCostFcfa: number | null;
  rooms: Pick<Room, "name" | "status" | "project" | "ad" | "occupant">[];
}

export interface Me {
  login: string;
  name: string | null;
  avatarUrl: string | null;
  houses: { id: string; name: string; role: MemberRole; room: string | null }[];
}
