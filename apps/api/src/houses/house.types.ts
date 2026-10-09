// What the website sees. Built by HousesService from the database plus the live state it keeps in memory.
import type { DeploymentStatus, HouseStatus, MemberRole, NoteTone, RoomStatus } from "@coloc/db";
import type { DeployKind, RoomLimits } from "@coloc/protocol";

export interface PersonView {
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

export interface RoomView {
  name: string;
  limits: RoomLimits;
  status: RoomStatus;
  url: string | null;
  project: string | null;
  projectDescription: string | null;
  // A free room's ad. Null when someone lives here.
  ad: string | null;
  occupant: PersonView | null;
  usage: RoomUsage | null;
}

export interface DeploymentView {
  id: string;
  room: string;
  kind: DeployKind;
  ref: string;
  status: DeploymentStatus;
  detail: string | null;
  updatedAt: string;
}

export interface FridgeNoteView {
  id: string;
  tone: NoteTone;
  text: string;
  room: string | null;
  at: string;
  count: number;
}

// Who's looking at the page, and what they're allowed to do there.
export interface ViewerView {
  login: string;
  member: boolean;
  role: MemberRole | null;
  // The room this viewer lives in, if any: the one they can deploy to.
  room: string | null;
}

// The house profile. Public: anyone can see who lives there and what they're building.
// `deployments` and `notes` are only filled in for flatmates.
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
  chef: PersonView | null;
  members: (PersonView & { role: MemberRole })[];
  rooms: RoomView[];
  viewer: ViewerView | null;
  deployments: DeploymentView[] | null;
  notes: FridgeNoteView[] | null;
}

// One house as the city shows it: enough to draw it and decide whether to open it.
export interface CityHouseView {
  id: string;
  name: string;
  city: string;
  country: string;
  tagline: string | null;
  status: HouseStatus;
  demo: boolean;
  agentOnline: boolean;
  monthlyCostFcfa: number | null;
  rooms: Pick<RoomView, "name" | "status" | "project" | "ad" | "occupant">[];
}

export interface CityView {
  houses: CityHouseView[];
}
