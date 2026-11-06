// What the website sees. Built by HousesService from the database plus the live state it keeps in memory.
import type { Badge, DeploymentStatus, HouseGuestStatus, HousePlan, HouseStatus, MemberRole, NoteTone, RoomStatus } from "@coloc/db";

export type { Badge };
import type { DeployKind, RoomLimits } from "@coloc/protocol";

export interface PersonView {
  login: string;
  name: string | null;
  avatarUrl: string | null;
  // Has a real GitHub account (logged in with GitHub): their login is then their GitHub handle, and the web links
  // their profile. Seeded example people never have one. Set by the house views; absent elsewhere.
  github?: boolean;
  // The Arena title they wear (arena/badges.ts), shown next to their name. Null: none.
  badge: Badge | null;
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
  // The project's repository, for flatmates only: a linked repo may be private, and the house view is public.
  repo: string | null;
  // Flatmates of the house who teamed up on this room's project, not counting its occupant ([] when none), first
  // to join first. They may update, restart and set up the room like its occupant (rooms.service.ts manageable).
  team: PersonView[];
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
  // The rooms this viewer rents here, in the house's order, and the first of them (null: none).
  room: string | null;
  rooms: string[];
  // They ended their last lease here: when they stop being a flatmate (the end of the month). Null otherwise.
  leavingUntil: string | null;
  // Their open knock on this house, if they have one.
  application: string | null;
  // Where they stand with the house's chat, from outside a full house: asked, let in, or told no today.
  guest: HouseGuestStatus | null;
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
  // How people pay where the house is.
  operators: string[];
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
  // Who was let into the chat from outside. Null for anyone who can't read it.
  guests: PersonView[] | null;
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
  // An Arena prize won this month (1st place), taken off their line and paid by La Coloc, not by the house.
  prize: number;
  // What they owe: share − credit + surcharge − prize, never below zero.
  due: number;
  paid: boolean;
  // What was taken when it was paid (rent goes out early in the month; `due` moves with reviews after). Null: unpaid.
  paidAmount: number | null;
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
  rooms: (Pick<RoomView, "name" | "status" | "url" | "project" | "projectDescription" | "ad" | "occupant" | "team"> & { building: boolean })[];
  // Reviews waiting in this house, and how many of them are late. Counts only: titles are for flatmates.
  openChores: number;
  lateChores: number;
  // Open knocks on the house.
  knocking: number;
  // Reviews done inside this house this calendar month.
  reviewsThisMonth: number;
  // Whose project the house rallies behind this fortnight.
  tontine: { login: string; name: string | null; project: string | null } | null;
  // The house's rooms' latest CPU use added up, in percent of one core (0 when unknown). Drives the roof's smoke.
  cpu: number;
  // What happened here in the last 10 minutes, newest first, at most 10 (houses/happenings.ts).
  recent: CityHappening[];
}

// One moment in a house, as the city plays it. `id` is stable (made from the row it comes from), so a page that
// polls the city can tell a new one from one it already played. Mirrored in apps/web/src/types.ts.
export type CityHappening =
  // A review was done (a chore): reviewer → author, as logins.
  | { id: string; at: string; kind: "review"; from: string; to: string }
  // A room's app ran out of memory or crashed, and was restarted. Its neighbours kept running.
  | { id: string; at: string; kind: "crash"; room: string }
  // A room's project went live (a prod deploy).
  | { id: string; at: string; kind: "live"; room: string }
  // Flatmates teamed up on a room: everyone on it now, the occupant first.
  | { id: string; at: string; kind: "team"; room: string; logins: string[] };

// What the city stream says after its first word: these houses are new or different, those are gone.
export interface CityChange {
  changed: CityHouseView[];
  gone: string[];
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
