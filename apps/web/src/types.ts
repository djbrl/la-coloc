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
  // A seeded example room in a real house (the workshop's other learners): it shows as lived in, but nothing runs.
  demo?: boolean;
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
  // What the applicant has built and traded: top public repos (read at GitHub login; empty for dev logins) and
  // reviews given and received across every house.
  work?: { repos: { fullName: string; url: string; language: string | null }[]; given: number; received: number };
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
  // The tutorial's workshop (L'Atelier): a newcomer without a room there takes one from the house view.
  tutorial?: boolean;
  // Public: reviews given and received per flatmate.
  ledger: { login: string; given: number; received: number }[];
  // Public: reviews done inside this house this calendar month.
  reviewsThisMonth: number;
  // Public: whose project the house rallies behind this fortnight, who comes next, and when the turn passes.
  tontine: Tontine | null;
  // Flatmates only: this month's bill, with reviews paid as rent.
  bill: Bill | null;
}

export interface Tontine {
  current: (Person & { project: string | null }) | null;
  line: Person[];
  // ISO date: when the turn passes to the next in line.
  until: string;
}

export interface BillLine {
  login: string;
  name: string | null;
  // Their part of the server, by room size and CPU used.
  share: number;
  // Reviews they did this month, and what those knocked off (reviews × reviewCredit, at most their share).
  reviews: number;
  credit: number;
  // Reviews they let go late this month, and what they pay towards everyone's credits because of it
  // (at most reviewCredit per skip).
  skipped: number;
  surcharge: number;
  // What they owe: share − credit + surcharge.
  due: number;
  paid: boolean;
}

export interface Bill {
  // "2026-10"
  month: string;
  // The house's monthly cost, in FCFA.
  total: number;
  // FCFA knocked off per review done this month (500).
  reviewCredit: number;
  lines: BillLine[];
  // Credits no skipped review paid for: the house pool covers them, so the lines add up to total − pool.
  pool: number;
  // How to pay in the house's country, as text only (no logos): ["Wave", "Orange Money", "Free Money"].
  operators: string[];
  // What to write in the payment's note: "COLOC-SACRE-COEUR-2026-10".
  reference: string;
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
  // building: a prod deploy is running for that room right now, even if an older version is live.
  rooms: (Pick<Room, "name" | "status" | "url" | "project" | "projectDescription" | "ad" | "occupant"> & { building: boolean })[];
  // Reviews waiting in this house, and how many are late. Counts only: titles are for flatmates.
  openChores: number;
  lateChores: number;
  // Open knocks on the house.
  knocking: number;
  // Reviews done inside this house this calendar month.
  reviewsThisMonth: number;
  // Whose project the house rallies behind this fortnight.
  tontine: { login: string; name: string | null; project: string | null } | null;
}

export interface Me {
  login: string;
  name: string | null;
  avatarUrl: string | null;
  // Their lobby character ("female-a" … "male-f"), or null if they haven't picked one.
  avatar: string | null;
  houses: { id: string; name: string; role: MemberRole; room: string | null }[];
  // Finished (or skipped) the tutorial? Missing on an API that doesn't have the tutorial yet.
  tutorialDone?: boolean;
  // Your knocks still waiting for a vote, one per house at most: the lobby offers "Your knock" instead of "Knock".
  knocks?: { id: string; houseId: string; room: string }[];
}

// The tutorial as the API sees it: GET /api/tutorial. The workshop is the house "atelier"; your room in it appears
// once you take one, and the GitHub part says whether the App can be installed from here.
export interface TutorialState {
  house: { id: string; name: string; city: string; agentOnline: boolean };
  // The room's status is a RoomStatus, plus whatever finer steps the API reports while a deploy runs
  // ("building", "starting").
  room: { name: string; status: RoomStatus | string; url: string | null } | null;
  sample: { repo: string; path: string };
  github: { installUrl: string | null; linked: boolean };
  done: boolean;
}

// What the server offers: GET /api/auth/config. Only the part the settings pane needs.
export interface ServerConfig {
  // Whether "Reset the demo city" is allowed on this server.
  demoReset: boolean;
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
