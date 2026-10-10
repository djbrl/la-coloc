// What the website sees. Built by HousesService from the database plus the live state it keeps in memory.
import type { DeploymentStatus, HousePlan, HouseStatus, MemberRole, NoteTone, RoomStatus } from "@coloc/db";
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
  // A seeded example in a real house (the workshop's other learners): shown as lived in, but nothing runs.
  demo: boolean;
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
  // Their open knock on this house, if they have one.
  application: string | null;
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
  // The tutorial's workshop (L'Atelier).
  tutorial: boolean;
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
  // Flatmates only: who's knocking, and the living-room chat.
  doorbell: DoorbellItem[] | null;
  channel: MessageView[] | null;
  // Flatmates only: reviews waiting to be done.
  chores: ChoreView[] | null;
  // The chef only: the server size they rented (null: none yet) and whether its agent key has been made.
  server: { plan: HousePlan | null; keyMade: boolean } | null;
  // Public: who reviewed how much. The house's reputation in the city.
  ledger: LedgerLine[];
}

export interface ChoreView {
  id: string;
  repo: string;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  assignee: PersonView;
  author: PersonView | null;
  dueAt: string;
  late: boolean;
}

export interface LedgerLine {
  login: string;
  given: number;
  received: number;
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
  // The lobby plot it rented ("2.1.0.1"), or null: the lobby places it near the market.
  plot: string | null;
  rooms: Pick<RoomView, "name" | "status" | "url" | "project" | "projectDescription" | "ad" | "occupant">[];
}

export interface CityView {
  houses: CityHouseView[];
}

export interface MessageView {
  id: string;
  // Null: the house itself speaking (someone knocked, the vote's result).
  author: PersonView | null;
  body: string;
  at: string;
}

export interface VoteTally {
  flatmates: number;
  yes: number;
  no: number;
  // Yes votes needed: a strict majority of flatmates.
  needed: number;
}

// An open knock, as the house sees it on its page.
export interface DoorbellItem {
  id: string;
  room: string;
  applicant: PersonView;
  tally: VoteTally;
  createdAt: string;
}

export interface ApplicationView {
  id: string;
  house: { id: string; name: string; city: string };
  room: string;
  applicant: PersonView;
  message: string;
  repo: string | null;
  status: "open" | "admitted" | "declined" | "withdrawn";
  createdAt: string;
  decidedAt: string | null;
  tally: VoteTally;
  // Who voted what: flatmates see names, the applicant only sees the counts.
  votes: { voter: PersonView; yes: boolean }[] | null;
  viewer: { login: string; as: "applicant" | "flatmate"; vote: boolean | null };
  messages: MessageView[];
}
