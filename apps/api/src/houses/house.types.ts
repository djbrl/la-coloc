// What the website sees. Built by HousesService from the database plus the live state it keeps in memory.
import type { DeploymentStatus, HousePlan, HouseStatus, MemberRole, NoteTone, RoomStatus } from "@coloc/db";
import type { DeployKind, RoomLimits } from "@coloc/protocol";

export interface PersonView {
  login: string;
  name: string | null;
  avatarUrl: string | null;
  // Has a real GitHub account (logged in with GitHub): their login is then their GitHub handle, and the web links
  // their profile. Seeded example people never have one. Set by the house views; absent elsewhere.
  github?: boolean;
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

// What a sentence the API wrote says, so the web can say it in the reader's language (houses/lines.ts): its kind
// and what fills its blanks. Null for a text no template wrote (an older wording, a seeded note): show the text.
export interface SaidView {
  kind: string;
  params: Record<string, string>;
}

export interface FridgeNoteView {
  id: string;
  tone: NoteTone;
  // In English, as stored; `said` is the same note, for saying it in another language.
  text: string;
  said: SaidView | null;
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
  // Public: reviews done inside this house this calendar month.
  reviewsThisMonth: number;
  // Public: whose project the house rallies behind this fortnight, who comes next, and when the turn passes.
  tontine: TontineView | null;
  // Flatmates only: this month's bill, with reviews paid as rent.
  bill: BillView | null;
}

export interface TontineView {
  current: (PersonView & { project: string | null }) | null;
  line: PersonView[];
  // ISO date: when the turn passes to the next in line.
  until: string;
}

export interface BillLineView {
  login: string;
  name: string | null;
  // Their part of the server, by room size and CPU used (domain splitBill).
  share: number;
  // Reviews they did this month, and what those knocked off (reviews × reviewCredit, at most their share).
  reviews: number;
  credit: number;
  // Reviews they let go late this month, and what they pay towards everyone's credits because of it.
  skipped: number;
  surcharge: number;
  // What they owe: share − credit + surcharge.
  due: number;
  paid: boolean;
}

export interface BillView {
  // "2026-10"
  month: string;
  // The house's monthly cost, in FCFA.
  total: number;
  // FCFA knocked off per review done this month.
  reviewCredit: number;
  lines: BillLineView[];
  // Credits nobody's skipped chores paid for: the house pool covers them, so the lines add up to total − pool.
  pool: number;
  // How to pay in the house's country, as text (no logos).
  operators: string[];
  // What to write in the payment's note.
  reference: string;
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
  // building: a prod deploy is running for that room right now, even if an older version is live.
  rooms: (Pick<RoomView, "name" | "status" | "url" | "project" | "projectDescription" | "ad" | "occupant"> & { building: boolean })[];
  // Reviews waiting in this house, and how many of them are late. Counts only: titles are for flatmates.
  openChores: number;
  lateChores: number;
  // Open knocks on the house.
  knocking: number;
  // Reviews done inside this house this calendar month.
  reviewsThisMonth: number;
  // Whose project the house rallies behind this fortnight.
  tontine: { login: string; name: string | null; project: string | null } | null;
}

export interface CityView {
  houses: CityHouseView[];
}

export interface MessageView {
  id: string;
  // Null: the house itself speaking (someone knocked, the vote's result).
  author: PersonView | null;
  body: string;
  // The house's own lines only (no author): what the line says, for saying it in another language.
  said: SaidView | null;
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
  // What the applicant has built and traded, so the house can judge more than the note: their top public repos
  // (read at GitHub login; empty for dev logins) and reviews given and received across every house.
  work: { repos: { fullName: string; url: string; language: string | null }[]; given: number; received: number };
}
