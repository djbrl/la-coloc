// Mirrors the API's views (apps/api/src/houses/house.types.ts). Keep the two in step.
export type RoomStatus = "empty" | "deploying" | "live" | "down" | "failed";
export type HouseStatus = "making" | "live";
export type MemberRole = "chef" | "flatmate";

export interface Person {
  login: string;
  name: string | null;
  avatarUrl: string | null;
  // Has a real GitHub account, so their profile can be linked. Only the house views send it (an older API doesn't):
  // missing means "don't link".
  github?: boolean;
  // The title they wear, won in a city's arena (docs/arena.md). An older API leaves it out: missing means none.
  badge?: Badge | null;
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
  // The project's repository: for flatmates only, since a linked repo may be private. Older API: missing.
  repo?: string | null;
  ad: string | null;
  occupant: Person | null;
  usage: RoomUsage | null;
  // A seeded example room in a real house (the workshop's other learners): it shows as lived in, but nothing runs.
  demo?: boolean;
  // Flatmates of the same house who team up on this room's project, not counting its occupant ([] when none).
  // They can update, restart and set up the room like its occupant; the occupant still pays its share. The API always
  // sends it; optional so pages built before teams (and their test fixtures) still type-check.
  team?: Person[];
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

// What a sentence the API wrote says (its kind and blanks), for saying it in the reader's language (said.ts).
export interface Said {
  kind: string;
  params: Record<string, string>;
}

export interface FridgeNote {
  id: string;
  tone: "info" | "warning" | "danger" | "thanks";
  // The stored English; `said` (absent from an older API) lets the page say it in French.
  text: string;
  said?: Said | null;
  room: string | null;
  at: string;
  count: number;
}

export interface Viewer {
  login: string;
  member: boolean;
  role: MemberRole | null;
  // The first room they rent here, and all of them (crew.ts: myRooms). Older API: no `rooms`.
  room: string | null;
  rooms?: string[];
  // Their last lease here has ended: when they stop being a flatmate (the end of the month).
  leavingUntil?: string | null;
  // Their open knock on this house, if any.
  application: string | null;
  // From outside a full house, their standing with its chat: asked, let in, or told no today. Older API: missing.
  guest?: "open" | "accepted" | "declined" | null;
}

export interface Message {
  id: string;
  // Null: the house itself ("Fatou knocked", "the house said yes").
  author: Person | null;
  body: string;
  // The house's own lines only: what it says, for the reader's language (said.ts).
  said?: Said | null;
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
  // Who was let into the chat from outside. Null for anyone who can't read it. Older API: missing.
  guests?: Person[] | null;
  // Flatmates only: reviews waiting to be done.
  chores: Chore[] | null;
  // The chef only: the server size they rented (null: none yet) and whether its agent key has been made.
  server: { plan: "small" | "medium" | "large" | null; keyMade: boolean } | null;
  // How people pay where the house is (an older API leaves it out).
  operators?: string[];
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
  // An Arena prize won this month, taken off their line (La Coloc pays it). An older API leaves it out.
  prize?: number;
  // What they owe: share − credit + surcharge − prize.
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
  rooms: (Pick<Room, "name" | "status" | "url" | "project" | "projectDescription" | "ad" | "occupant" | "team"> & { building: boolean })[];
  // Reviews waiting in this house, and how many are late. Counts only: titles are for flatmates.
  openChores: number;
  lateChores: number;
  // Open knocks on the house.
  knocking: number;
  // Reviews done inside this house this calendar month.
  reviewsThisMonth: number;
  // Whose project the house rallies behind this fortnight.
  tontine: { login: string; name: string | null; project: string | null } | null;
  // The house's rooms' latest CPU use added up, in percent of one core (0 when unknown). Drives the roof's smoke.
  // Optional like `recent`: the API always sends both, an older one (and older fixtures) leave them out.
  cpu?: number;
  // What happened in this house in the last 10 minutes, newest first, at most 10. The page plays the ones it
  // hasn't seen yet (by id), never the ones already there when it loaded.
  recent?: CityHappening[];
}

// One moment in a house, as the city plays it. `id` is stable (the row it comes from), so a page polling the city
// can tell a new one from one it already played.
export type CityHappening =
  // A review was done (a chore): reviewer → author, as logins. The review took money off the reviewer's rent.
  | { id: string; at: string; kind: "review"; from: string; to: string }
  // A room's app was killed or crashed (out of memory, exited) and restarted. Its neighbours kept running.
  | { id: string; at: string; kind: "crash"; room: string }
  // A room's project went live (a prod deploy).
  | { id: string; at: string; kind: "live"; room: string }
  // Flatmates teamed up on a room: everyone on it now, the occupant first.
  | { id: string; at: string; kind: "team"; room: string; logins: string[] };

export interface Me {
  login: string;
  name: string | null;
  avatarUrl: string | null;
  // Their lobby character ("female-a" … "male-f"), or null if they haven't picked one.
  avatar: string | null;
  // The city you belong to, given at your first login: where the lobby opens when you have no house. An older API
  // leaves it out.
  homeCity?: string | null;
  // `room`: their first room in that house; `rooms`: all of them.
  houses: { id: string; name: string; role: MemberRole; room: string | null; rooms: string[] }[];
  // Finished (or skipped) the tutorial? Missing on an API that doesn't have the tutorial yet.
  tutorialDone?: boolean;
  // What you have left of the city's fake money, in FCFA. An older API leaves it out.
  credit?: number;
  // Your knocks still waiting for a vote, one per house at most: the lobby offers "Your knock" instead of "Knock".
  knocks?: { id: string; houseId: string; room: string }[];
  // The title you wear, and every one you've won (pick which to wear: PUT /api/me/badge). An older API leaves both out.
  badge?: Badge | null;
  badges?: (Badge & { id: string })[];
}

// The tutorial as the API sees it: GET /api/tutorial. The workshop is the house "atelier"; your room in it appears
// once you take one, and the GitHub part says whether the App can be installed from here.
export interface TutorialState {
  house: { id: string; name: string; city: string; agentOnline: boolean };
  // The room's status is a RoomStatus, plus whatever finer steps the API reports while a deploy runs
  // ("building", "starting").
  // `why`: when its last build failed, the first line of the reason; `log`: all of it (an older API leaves them out).
  room: { name: string; status: RoomStatus | string; url: string | null; why?: string | null; log?: string | null } | null;
  sample: { repo: string | null; path: string };
  // `repo`: the GitHub repo linked to the workshop room ("awa/portfolio"), if any.
  github: { installUrl: string | null; linked: boolean; repo?: string | null };
  done: boolean;
  // The furthest chapter of the quest this person reached ("arrive" … "house"), so it can pick up where they left
  // it. Null before the first; an older API leaves it out.
  chapter?: string | null;
}

// GET /api/tutorial/repos: the repos someone let the App see on GitHub, the most recently pushed first, and the one
// in their workshop room. `reason` says why the list is empty: GitHub isn't set up on this server ("off"), they
// didn't log in with GitHub ("no-github"), or they haven't installed the App yet ("not-installed").
export interface RepoChoice {
  id: number;
  fullName: string;
  description: string | null;
  language: string | null;
  private: boolean;
  pushedAt: string | null;
}
export interface RepoChoices {
  repos: RepoChoice[];
  chosen: number | null;
  reason: "off" | "no-github" | "not-installed" | null;
}

// GET /api/github/repos: the same list, not tied to any room, and where to let the App see more (`installUrl`).
export interface ConnectedRepos {
  repos: RepoChoice[];
  reason: RepoChoices["reason"];
  installUrl: string | null;
}

// What the server offers: GET /api/auth/config. Only the part the settings pane needs.
export interface ServerConfig {
  // Whether "Reset the demo city" is allowed on this server.
  demoReset: boolean;
}

// The room page: GET /api/houses/:id/rooms/:room/manage (the room's flatmate, or the chef).
// What's inside a room, read from inside it (agent: inside.ts). `started`: someone started it by hand, not the project.
export interface RoomEntry {
  name: string;
  kind: "folder" | "file" | "link";
  kb?: number;
  stack?: string;
  project?: boolean;
}
export interface RoomProcess {
  command: string | null;
  port?: number;
  localOnly?: boolean;
  started: boolean;
}
export interface RoomInside {
  home: { path: string; usedKb: number; limitMb?: number; entries: RoomEntry[]; more: number } | null;
  running: RoomProcess[];
  projectPort: number | null;
  addressPort: number | null;
}
export type RoomInsideTrouble = "not_running" | "no_shell" | "failed";

export interface RoomManage {
  // `chef`: you run the house, even when this is your own room and `as` says flatmate (an older API leaves it out).
  house: { id: string; name: string; domain: string; agentOnline: boolean; strictReviews: boolean; chef?: boolean };
  // flatmate: you live in this room. teammate: you teamed up on it (same rights as its flatmate). chef: you run the
  // house (update and restart only).
  as: "flatmate" | "chef" | "teammate";
  // How to SSH in. Null: this server has no SSH, or a shell isn't for you (a chef, an example room).
  // `people`: who has a shell in this room right now.
  ssh?: { host: string; port: number; user: string; people?: Person[] } | null;
  // The Inside tab: what's in the room, for those who could open a shell in it.
  inside?: boolean;
  // The Lease tab, for the occupant of a room that has a lease to end: their part of this month's bill (null: the house
  // has no bill yet), how many rooms they rent in this house, and when rent stops if they end it now.
  lease?: { share: number | null; rooms: number; until: string } | null;
  room: {
    name: string;
    status: RoomStatus;
    url: string | null;
    previewUrl: string | null;
    limits: { memoryMb: number; cpus: number };
    usage: RoomUsage | null;
    occupant: Person | null;
    // Teammates on this room's project, not counting the occupant (always sent; optional for older fixtures).
    team?: Person[];
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
  // Where to install the GitHub App, when this server has one: for a GitHub repo that isn't linked through it.
  installUrl?: string | null;
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

// The bell: GET /api/notifications (apps/api/src/notifications/notifications.service.ts). Never free text: each
// notification is an event the web puts in its own words (components/bell/bell.ts).
export type NotificationKind =
  | "house_invite"
  | "rent_together"
  | "invite_accepted"
  | "rent_together_yes"
  | "invite_declined"
  | "rent_together_no"
  | "knock"
  | "knock_answer"
  // A flatmate's build failed: only your own house hears about it, and not the person who ran it.
  | "build_failed"
  // Teaming up (flatmates of one house, on one room's project). team_invite: the room's occupant asks you to join
  // their project (`room`). team_ask: a flatmate asks to join yours (`room` is yours). Both are answered like
  // invitations; team_accepted / team_declined tell the sender how it went.
  | "team_invite"
  | "team_ask"
  | "team_accepted"
  | "team_declined"
  // Someone asks to join a full house's group chat (each flatmate gets one, the first answer counts), then how it went.
  | "guest_ask"
  | "guest_accepted"
  | "guest_declined";
export type InviteState = "open" | "accepted" | "declined" | "withdrawn" | "expired";

export interface Notice {
  id: string;
  kind: NotificationKind;
  // Invitations only; null for news.
  state: InviteState | null;
  from: Person | null;
  house: { id: string; name: string; city: string } | null;
  room: string | null;
  // The knock it's about, and how its vote went.
  applicationId: string | null;
  verdict: "admitted" | "declined" | null;
  createdAt: string;
  read: boolean;
}

export interface Notices {
  unread: number;
  items: Notice[];
  // Your invitations still waiting for an answer: the person card says "Invited" instead of offering another.
  // `room`: the room a team request is about (null for the others).
  sent: { id: string; kind: "house_invite" | "rent_together" | "team_invite" | "team_ask"; to: string; houseId: string | null; room?: string | null }[];
}

// ---- The chat (apps/api/src/chat): direct messages, a city's room and its board ----

/** One conversation in your list (GET /api/chat/conversations). */
export interface ConversationItem {
  with: Person;
  last: { body: string; at: string; mine: boolean };
  unread: number;
}

export interface Conversations {
  unread: number;
  items: ConversationItem[];
}

/** One conversation, opened (GET /api/chat/dm/:login). `canWrite` false says why in `why`. */
export interface Conversation {
  with: Person & { example: boolean };
  blocked: boolean;
  canWrite: boolean;
  why: string | null;
  messages: Message[];
}

/** A post on a city's board. */
export interface BoardPost {
  id: string;
  city: string;
  tag: "house" | "flatmates" | "project" | "help" | "other";
  title: string;
  body: string;
  author: Person;
  createdAt: string;
  activeAt: string;
  replies: number;
}

// ---- The arena (docs/arena.md): a stadium in every city, the week's challenge, and titles for the winners ----

/** The same words in both languages, as the API stores what it writes itself (a challenge, a title). */
export interface Text {
  en: string;
  fr: string;
}

/** A title won in an arena: the challenge's own for first place, a podium one for second and third. `week` is the
 *  Monday it started ("2026-10-12"). */
export interface Badge {
  key: string;
  title: Text;
  place: 1 | 2 | 3;
  city: string;
  week: string;
}

export type ArenaKind = "bounty" | "hackathon" | "challenge";

export interface ArenaChallenge {
  id: string;
  slug: string;
  kind: ArenaKind;
  title: Text;
  summary: Text;
  rules: { en: string[]; fr: string[] };
  // The arena repo ("https://github.com/Djbrl/la-coloc-arena") and the challenge's folder in it ("challenges/bug-bounty").
  repo: string;
  path: string;
  startsAt: string;
  endsAt: string;
  prizeFcfa: number;
  // Whether anyone can open the challenge's folder on GitHub (a public repo, the folder pushed). False: nobody but the
  // repo's owner can take part yet. Null (or left out by an older API): GitHub couldn't say.
  open?: boolean | null;
  // The title the winner gets.
  award: { key: string; title: Text };
  // What a merged pull request is worth, by label.
  points: { label: string; points: number }[];
}

/** One of your pull requests sent to this week's challenge. "open": waiting for a merge (0 points so far). */
export interface ArenaSubmission {
  id: string;
  url: string;
  number: number;
  title: string | null;
  state: "open" | "merged" | "closed";
  points: number;
}

/** A city's arena this week: GET /api/cities/:city/arena (no login needed; `joined` and `mine` are the viewer's). */
export interface ArenaView {
  city: string;
  challenge: ArenaChallenge;
  entrants: number;
  joined: boolean;
  mine: ArenaSubmission[];
  // The top ten, points first.
  leaderboard: { person: Person; points: number; prs: number }[];
  // Last week's winner in this city.
  champion: { person: Person; badge: Badge } | null;
}
