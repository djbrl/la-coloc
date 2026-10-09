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
  // Their open knock on this house, if any.
  application: string | null;
}

export interface Message {
  id: string;
  // Null: the house itself ("Fatou knocked", "the house said yes").
  author: Person | null;
  body: string;
  at: string;
}

export interface VoteTally {
  flatmates: number;
  yes: number;
  no: number;
  needed: number;
}

export interface DoorbellItem {
  id: string;
  room: string;
  applicant: Person;
  tally: VoteTally;
  createdAt: string;
}

export interface Application {
  id: string;
  house: { id: string; name: string; city: string };
  room: string;
  applicant: Person;
  message: string;
  repo: string | null;
  status: "open" | "admitted" | "declined" | "withdrawn";
  createdAt: string;
  decidedAt: string | null;
  tally: VoteTally;
  // Flatmates see who voted what; the applicant only the counts.
  votes: { voter: Person; yes: boolean }[] | null;
  viewer: { login: string; as: "applicant" | "flatmate"; vote: boolean | null };
  messages: Message[];
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
  doorbell: DoorbellItem[] | null;
  channel: Message[] | null;
  // Flatmates only: reviews waiting to be done.
  chores: Chore[] | null;
  // The chef only: the server size they rented (null: none yet) and whether its agent key has been made.
  server: { plan: "small" | "medium" | "large" | null; keyMade: boolean } | null;
  // Public: reviews given and received per flatmate.
  ledger: { login: string; given: number; received: number }[];
}

export interface Chore {
  id: string;
  repo: string;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  assignee: Person;
  author: Person | null;
  dueAt: string;
  late: boolean;
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
  // The lobby plot it rented ("block column.block row.plot column.plot row"), or null: placed near the market.
  plot: string | null;
  rooms: Pick<Room, "name" | "status" | "project" | "ad" | "occupant">[];
}

export interface Me {
  login: string;
  name: string | null;
  avatarUrl: string | null;
  // Their lobby character ("female-a" … "male-f"), or null if they haven't picked one.
  avatar: string | null;
  houses: { id: string; name: string; role: MemberRole; room: string | null }[];
}

// The room page: GET /api/houses/:id/rooms/:room/manage (the room's flatmate, or the chef).
export interface RoomManage {
  house: { id: string; name: string; domain: string; agentOnline: boolean; strictReviews: boolean };
  as: "flatmate" | "chef";
  room: {
    name: string;
    status: RoomStatus;
    url: string | null;
    previewUrl: string | null;
    limits: { memoryMb: number; cpus: number };
    usage: RoomUsage | null;
    occupant: Person | null;
  };
  settings: {
    project: string | null;
    projectDescription: string | null;
    branch: string | null;
    buildPath: string;
    port: number | null;
    source: string | null;
  };
  github: { fullName: string; url: string } | null;
  secrets: { name: string; updatedAt: string }[];
  secretsEnabled: boolean;
  deployments: {
    id: string;
    kind: "prod" | "preview";
    ref: string;
    status: string;
    detail: string | null;
    prNumber: number | null;
    createdAt: string;
    updatedAt: string;
  }[];
}
