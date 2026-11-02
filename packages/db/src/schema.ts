// coloc.dev's database, the agency's: the only Postgres there is (rooms have no database of their own yet).
// Durable things live here. Live-only things (is the agent online, the latest CPU reading, who's looking at
// the city right now) stay in the API's memory and are rebuilt when an agent reconnects.
import { relations } from "drizzle-orm";
import { type AnyPgColumn, bigint, bigserial, boolean, date, index, integer, jsonb, pgTable, primaryKey, real, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// One of someone's public GitHub repos, as their knock shows it to the house.
export interface PublicRepo {
  fullName: string;
  url: string;
  language: string | null;
}

// A title won in the Arena (the week's challenge in a city), as shown next to a name everywhere. `place`: 1 is the
// challenge's own title, 2 and 3 a podium badge. `week`: the Monday the challenge started, "2026-10-12".
export interface Badge {
  key: string;
  title: { en: string; fr: string };
  place: 1 | 2 | 3;
  city: string;
  week: string;
}

// Everyone who has logged in with GitHub. Demo flatmates (seeded) have no GitHub id.
export type CreditReason = "server" | "rent" | "project" | "review" | "arena";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  githubId: bigint("github_id", { mode: "number" }).unique(),
  login: text("login").notNull().unique(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  // They've imported, pasted or removed an SSH key: from here their keys are their own choice, and the SSH tab stops
  // fetching them from GitHub on its own. A key someone removed doesn't come back.
  sshKeysChosen: boolean("ssh_keys_chosen").notNull().default(false),
  location: text("location"),
  // Their character in the lobby: one of the models in apps/web/public/lobby/people ("female-a" … "male-f").
  avatar: text("avatar"),
  // Their top public repos (at most 3), read from GitHub when they log in. Null: never read (dev logins, seeded people).
  githubRepos: jsonb("github_repos").$type<PublicRepo[]>(),
  // When they finished the tutorial (walk into the workshop, take a room, put a sample online, link GitHub).
  // Null: not done yet, or they chose to take it again.
  tutorialDoneAt: timestamp("tutorial_done_at", { withTimezone: true }),
  // How far they got in "Your first home", the tutorial's quest: the furthest chapter reached ("arrive" … "house"),
  // so coming back the next day picks up where they left off, on any device. Null: not started yet.
  tutorialChapter: text("tutorial_chapter"),
  // The Arena title they wear (one of their arena_awards), and a copy of it, so every list of names can show it
  // without asking the database again. Kept in step by apps/api/src/arena/badges.ts. Both null: none.
  wornAwardId: uuid("worn_award_id").references((): AnyPgColumn => arenaAwards.id, { onDelete: "set null" }),
  badge: jsonb("badge").$type<Badge>(),
  // What they have left to settle in the city, in FCFA: fake money, spent on servers, rent and projects, earned by
  // reviewing and in the Arena (apps/api/src/credit). Everyone starts with WELCOME_CREDIT_FCFA (houses/money.ts).
  credit: integer("credit").notNull().default(15_000),
  createdAt: createdAt(),
});

// Every movement of someone's credit, for their history. Its `key` says what it was for ("review:<chore>"), so the same
// thing can't be paid or earned twice. Null: nothing to tell apart.
export const creditEntries = pgTable(
  "credit_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    // Signed: what they earned is positive, what they spent negative.
    amount: integer("amount").notNull(),
    reason: text("reason").$type<CreditReason>().notNull(),
    key: text("key").unique(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("credit_entries_user").on(t.userId, t.at)],
);

// A login session. The browser holds a random token; we only keep its SHA-256, so a database leak
// doesn't hand out sessions.
export const sessions = pgTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export type HouseStatus = "making" | "live";

// The server size the chef rents. Sets the monthly cost (see apps/api/src/houses/server.ts).
export type HousePlan = "small" | "medium" | "large";

export const houses = pgTable("houses", {
  // A slug: it becomes the house's subdomain (jib.sacre-coeur.coloc.dev).
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  city: text("city").notNull(),
  country: text("country").notNull(),
  // What the house is about, in its own words. Shown on the city and the profile.
  tagline: text("tagline"),
  // Domain the house's rooms are served under.
  domain: text("domain").notNull(),
  // "making": people are signing up, no server rented yet. "live": the server exists.
  status: text("status").$type<HouseStatus>().notNull().default("making"),
  // SHA-256 of the agent's secret. The secret itself is shown once, when the chef installs the agent.
  agentSecretHash: text("agent_secret_hash"),
  chefId: uuid("chef_id").references(() => users.id),
  // Server cost per month, in whole FCFA. Split between flatmates at month end.
  monthlyCostFcfa: integer("monthly_cost_fcfa"),
  // The server size the chef rented. Null: no server rented yet.
  plan: text("plan").$type<HousePlan>(),
  // House rules. strictReviews: an unreviewed merge doesn't deploy.
  rules: jsonb("rules").$type<{ strictReviews: boolean }>().notNull().default({ strictReviews: true }),
  // Seeded so the city isn't empty for the demo. The UI labels them, so nobody mistakes them for real houses.
  demo: boolean("demo").notNull().default(false),
  // Where it stands in its city's lobby: the plot key the neighbourhood generator gives every empty building
  // ("2.1.0.1"). Null: no plot rented, so the lobby places it near the market.
  plot: text("plot"),
  // The workshop where newcomers take the tutorial. Real (an agent runs it), but never drawn on the city.
  tutorial: boolean("tutorial").notNull().default(false),
  createdAt: createdAt(),
});

export type RoomStatus = "empty" | "deploying" | "live" | "down" | "failed";

export const rooms = pgTable(
  "rooms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    houseId: text("house_id").notNull().references(() => houses.id, { onDelete: "cascade" }),
    // A slug, unique in its house. Becomes the room's subdomain.
    name: text("name").notNull(),
    // Who lives here. Null: the room is free.
    occupantId: uuid("occupant_id").references(() => users.id),
    memoryMb: integer("memory_mb").notNull(),
    cpus: real("cpus").notNull(),
    status: text("status").$type<RoomStatus>().notNull().default("empty"),
    url: text("url"),
    // The occupant's project, shown on the city and the profile.
    project: text("project"),
    projectDescription: text("project_description"),
    // A free room's ad: "looking for a mobile dev".
    ad: text("ad"),
    lastDeployId: text("last_deploy_id"),
    // How the room builds. branch: null means the repo's default. buildPath: the folder holding the Dockerfile.
    // port: null means the image's EXPOSE, then 3000. source: the repo URL for manual deploys (never a token).
    branch: text("branch"),
    buildPath: text("build_path").notNull().default("."),
    port: integer("port"),
    source: text("source"),
    // A seeded example in a real house (the workshop's other learners): shown as lived in, but nothing runs
    // there, so the agent's snapshot never changes it.
    demo: boolean("demo").notNull().default(false),
  },
  (t) => [uniqueIndex("rooms_house_name").on(t.houseId, t.name)],
);

// Flatmates who team up on one room's project. The room's occupant stays its occupant (and pays its share of the
// bill); a teammate may update, restart, redeploy and set up the room like them, and keeps their own room. Only
// flatmates of the room's house, at most three per room (apps/api/src/notifications/teams.ts).
export const roomTeammates = pgTable(
  "room_teammates",
  {
    roomId: uuid("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.roomId, t.userId] }), index("room_teammates_user").on(t.userId)],
);

// The public keys someone logs in to their rooms with, over SSH (apps/api/src/ssh). Only public keys: nothing here is
// secret. A key belongs to the person, and opens the rooms they live or work in, for as long as they do.
export const sshKeys = pgTable(
  "ssh_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    // "ssh-ed25519 AAAA…", without the comment at the end.
    publicKey: text("public_key").notNull(),
    // SHA256:…, the way `ssh-keygen -l` writes it, so people can tell their keys apart.
    fingerprint: text("fingerprint").notNull(),
    fromGithub: boolean("from_github").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ssh_keys_user_fingerprint").on(t.userId, t.fingerprint)],
);

// Someone from outside a full house who asked to join its group chat. "open": waiting for a flatmate to answer.
// "accepted": they read and write the house's channel, and nothing else of the house. "declined": not today.
// Goes with the house (a demo reset, a house pulled down) or with the person.
export type HouseGuestStatus = "open" | "accepted" | "declined";

export const houseGuests = pgTable(
  "house_guests",
  {
    houseId: text("house_id").notNull().references(() => houses.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    status: text("status").$type<HouseGuestStatus>().notNull().default("open"),
    // When they last asked, and when it was last answered.
    askedAt: timestamp("asked_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.houseId, t.userId] }), index("house_guests_user").on(t.userId)],
);

export type MemberRole = "chef" | "flatmate";

// Who belongs to which house. A flatmate usually has a room; someone signed up to a house in the making may not yet.
export const memberships = pgTable(
  "memberships",
  {
    houseId: text("house_id").notNull().references(() => houses.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<MemberRole>().notNull().default("flatmate"),
    // Place in the tontine line (lower goes first).
    tontinePosition: integer("tontine_position").notNull().default(0),
    joinedAt: createdAt(),
    // Their last room here has gone: they stay on the bill and in the chat until this month ("2026-10") is over, when
    // they stop being a flatmate (apps/api/src/houses/leases.service.ts). Null: they live here. Taking a room clears it.
    leavingMonth: text("leaving_month"),
  },
  (t) => [primaryKey({ columns: [t.houseId, t.userId] })],
);

// A lease ended during a month. The room is free at once, but the rent doesn't move until the month is over: that
// month, the room still counts for whoever left it and for nobody who moves in (see the bill in houses.service.ts).
// One row per room per month: if a newcomer also leaves, the first person is still the one paying for it.
export const leaseEnds = pgTable(
  "lease_ends",
  {
    houseId: text("house_id").notNull().references(() => houses.id, { onDelete: "cascade" }),
    room: text("room").notNull(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    // The calendar month it ended in ("2026-10"), and the room's size then.
    month: text("month").notNull(),
    memoryMb: integer("memory_mb").notNull(),
    // CPU measured in the room after this isn't theirs, so it isn't on their line.
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.houseId, t.room, t.month] })],
);

export type DeploymentStatus = "queued" | "cloning" | "building" | "starting" | "live" | "failed";

export const deployments = pgTable(
  "deployments",
  {
    id: text("id").primaryKey(),
    houseId: text("house_id").notNull().references(() => houses.id, { onDelete: "cascade" }),
    room: text("room").notNull(),
    kind: text("kind").$type<"prod" | "preview">().notNull(),
    // Never holds a token: redacted before it's stored.
    repo: text("repo").notNull(),
    ref: text("ref").notNull(),
    status: text("status").$type<DeploymentStatus>().notNull(),
    detail: text("detail"),
    requestedBy: uuid("requested_by").references(() => users.id),
    // Set when a merged pull request triggered it, so the result can be reported back on the PR.
    githubRepoId: bigint("github_repo_id", { mode: "number" }),
    prNumber: integer("pr_number"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("deployments_house_created").on(t.houseId, t.createdAt)],
);

export type NoteTone = "info" | "warning" | "danger" | "thanks";

export const fridgeNotes = pgTable(
  "fridge_notes",
  {
    id: text("id").primaryKey(),
    houseId: text("house_id").notNull().references(() => houses.id, { onDelete: "cascade" }),
    room: text("room"),
    tone: text("tone").$type<NoteTone>().notNull(),
    text: text("text").notNull(),
    // Same note repeated within a few minutes is collapsed: "×4".
    count: integer("count").notNull().default(1),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("fridge_notes_house_at").on(t.houseId, t.at)],
);

// The material for the monthly bill: one row per room per sample.
export const usageSamples = pgTable(
  "usage_samples",
  {
    houseId: text("house_id").notNull().references(() => houses.id, { onDelete: "cascade" }),
    room: text("room").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull(),
    cpuPercent: real("cpu_percent").notNull(),
    memoryBytes: bigint("memory_bytes", { mode: "number" }).notNull(),
  },
  (t) => [index("usage_samples_house_at").on(t.houseId, t.at)],
);

export type ApplicationStatus = "open" | "admitted" | "declined" | "withdrawn";

// Someone knocked on a free room. The house chats with them in the application's thread, then votes.
export const applications = pgTable(
  "applications",
  {
    id: text("id").primaryKey(),
    houseId: text("house_id").notNull().references(() => houses.id, { onDelete: "cascade" }),
    room: text("room").notNull(),
    applicantId: uuid("applicant_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    // What they'd build in the room.
    message: text("message").notNull(),
    repo: text("repo"),
    status: text("status").$type<ApplicationStatus>().notNull().default("open"),
    createdAt: createdAt(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [index("applications_house").on(t.houseId, t.status)],
);

// One vote per flatmate per application. A flatmate may change their mind until it's decided.
export const votes = pgTable(
  "votes",
  {
    applicationId: text("application_id").notNull().references(() => applications.id, { onDelete: "cascade" }),
    voterId: uuid("voter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    yes: boolean("yes").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.applicationId, t.voterId] })],
);

// Chat. A channel is a house's living room ("house:<id>"), a knock's thread ("application:<id>"), a direct
// conversation between two people ("dm:<userId>:<userId>", the two ids sorted, so a pair has one channel), a city's
// public room ("city:<City>"), or the replies under a city board post ("post:<postId>").
export const messages = pgTable(
  "messages",
  {
    // Increasing, so a channel reads in the order things were said (timestamps can tie inside a transaction).
    id: bigserial("id", { mode: "number" }).primaryKey(),
    channel: text("channel").notNull(),
    // Null: said by the house itself ("Fatou knocked", "the house said yes").
    authorId: uuid("author_id").references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_channel_id").on(t.channel, t.id)],
);

// A room's secrets (API keys, passwords), encrypted with AES-256-GCM before they're stored. Only their names
// ever go back to the browser; values only leave the API inside a deploy command, to that room's agent.
export const roomSecrets = pgTable(
  "room_secrets",
  {
    houseId: text("house_id").notNull().references(() => houses.id, { onDelete: "cascade" }),
    room: text("room").notNull(),
    name: text("name").notNull(),
    // iv.tag.ciphertext, base64url.
    value: text("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.houseId, t.room, t.name] })],
);

// A GitHub repo moved into a room: installing the coloc GitHub App on it links it to its owner's room.
export const repos = pgTable("repos", {
  // GitHub's numeric repo id: names change, ids don't.
  githubId: bigint("github_id", { mode: "number" }).primaryKey(),
  fullName: text("full_name").notNull(),
  houseId: text("house_id").notNull().references(() => houses.id, { onDelete: "cascade" }),
  room: text("room").notNull(),
  installationId: bigint("installation_id", { mode: "number" }).notNull(),
  createdAt: createdAt(),
});

// Who installed the coloc GitHub App where, as GitHub's install webhooks tell it (`sender`). Kept for the tutorial's
// repo picker: GitHub only lists an account's own installation to an App, so an install on an organisation is found
// here, and only for the person who made it (an owner of that organisation, who chose its repos). Without a user's
// own GitHub token, that is the only safe way to know who may link those repos.
export const githubInstallations = pgTable("github_installations", {
  // GitHub's installation id.
  id: bigint("id", { mode: "number" }).primaryKey(),
  // The account it's on: a user or an organisation login.
  account: text("account").notNull(),
  // The GitHub user id of whoever installed it, or last added repos to it.
  installerGithubId: bigint("installer_github_id", { mode: "number" }).notNull(),
  createdAt: createdAt(),
});

export type ChoreStatus = "open" | "done";

// A chore is a review: one pull request, one flatmate assigned to review it.
export const chores = pgTable(
  "chores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    houseId: text("house_id").notNull().references(() => houses.id, { onDelete: "cascade" }),
    repoId: bigint("repo_id", { mode: "number" }).notNull(),
    repoFullName: text("repo_full_name").notNull(),
    prNumber: integer("pr_number").notNull(),
    prTitle: text("pr_title").notNull(),
    prUrl: text("pr_url").notNull(),
    authorId: uuid("author_id").references(() => users.id),
    assigneeId: uuid("assignee_id").notNull().references(() => users.id),
    status: text("status").$type<ChoreStatus>().notNull().default("open"),
    // How the review went: approved, changes_requested or commented.
    outcome: text("outcome"),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    // Set once the late fridge note has gone up, so it goes up once.
    lateNotedAt: timestamp("late_noted_at", { withTimezone: true }),
    createdAt: createdAt(),
    doneAt: timestamp("done_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("chores_pr").on(t.repoId, t.prNumber), index("chores_house_status").on(t.houseId, t.status)],
);

// Someone marked their line of a month's bill as paid. A mock for the contest: no money moves yet; the bill tab
// says so. One row per flatmate per house per month ("2026-10").
export const billPayments = pgTable(
  "bill_payments",
  {
    houseId: text("house_id").notNull().references(() => houses.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    // What their line said was due when they paid, in whole FCFA.
    amount: integer("amount").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.houseId, t.userId, t.month] })],
);

export type NotificationKind =
  // A flatmate offers an unhoused person their house's free room. Accepting moves them in.
  | "house_invite"
  // Someone with no house asks another with no house to rent a server together. Accepting tells the sender.
  | "rent_together"
  // Your invitation was taken: they moved in (house_invite) or want to rent with you (rent_together).
  | "invite_accepted"
  | "rent_together_yes"
  // Your invitation was turned down: to your house (house_invite) or to rent together (rent_together).
  | "invite_declined"
  | "rent_together_no"
  // The doorbell: someone knocked on your house, or the house answered your knock.
  | "knock"
  | "knock_answer"
  // A flatmate's build failed, so you can offer a hand.
  | "build_failed"
  // Teaming up on a room's project, between flatmates of one house. team_invite: the room's occupant asks a flatmate
  // to join their project. team_ask: a flatmate asks the occupant to let them join. Both are answered like
  // invitations, and the sender is told: team_accepted or team_declined.
  | "team_invite"
  | "team_ask"
  | "team_accepted"
  | "team_declined"
  // Someone asks to join a full house's group chat: one guest_ask per flatmate, answered like an invitation (the first
  // answer counts for all of them). guest_accepted / guest_declined tell the one who asked.
  | "guest_ask"
  | "guest_accepted"
  | "guest_declined";

// Only invitations (house_invite, rent_together, team_invite, team_ask) have a state; the other kinds are news, and
// leave it null.
export type InviteState = "open" | "accepted" | "declined" | "withdrawn" | "expired";

// What a notification carries besides its columns: the knock it's about, and how the vote went.
export interface NotificationPayload {
  applicationId?: string;
  verdict?: "admitted" | "declined";
}

// La Coloc's own notifications, shown under the bell. GitHub can't message a user for us, so the news lives here.
// Never free text: each row is a structured event (an invitation, a knock), drawn by the web in its own words.
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Who it's for.
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").$type<NotificationKind>().notNull(),
    // Who it's from. Null: the house itself (a vote's verdict).
    fromId: uuid("from_id").references(() => users.id, { onDelete: "cascade" }),
    // The house (and room) it's about, when it's about one.
    houseId: text("house_id").references(() => houses.id, { onDelete: "cascade" }),
    room: text("room"),
    payload: jsonb("payload").$type<NotificationPayload>().notNull().default({}),
    state: text("state").$type<InviteState>(),
    createdAt: createdAt(),
    readAt: timestamp("read_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [index("notifications_user_created").on(t.userId, t.createdAt), index("notifications_from_created").on(t.fromId, t.createdAt)],
);

// Someone blocked someone. Blocks direct messages both ways, and hides the blocked person's words from the blocker
// (every channel, the city board too). The blocked person isn't told.
export const blocks = pgTable(
  "blocks",
  {
    blockerId: uuid("blocker_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    blockedId: uuid("blocked_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] })],
);

// How far someone has read a conversation: the id of the last message they saw there. What comes after, written by
// the other person, is unread. Only direct conversations keep one.
export const chatReads = pgTable(
  "chat_reads",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    lastReadId: bigint("last_read_id", { mode: "number" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.channel] })],
);

// What a city board post is about. The web says each in its own words.
export type BoardTag = "house" | "flatmates" | "project" | "help" | "other";

// A post on a city's board (the forum): a tag, a title and a body, plain text. Its replies are messages in the
// channel "post:<id>". No votes, no edits: the author (or an admin) can only delete it.
export const boardPosts = pgTable(
  "board_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    city: text("city").notNull(),
    authorId: uuid("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tag: text("tag").$type<BoardTag>().notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    createdAt: createdAt(),
    // The post or its latest reply: the board lists the most recently active first.
    activeAt: timestamp("active_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("board_posts_city_active").on(t.city, t.activeAt)],
);

export type ReportKind = "message" | "post";

// Someone reported a message or a board post. A copy of the words is kept, so the report still says what was
// written once the original is deleted. The admins (COLOC_ADMINS) read the list; nothing happens by itself.
export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterId: uuid("reporter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ReportKind>().notNull(),
    // A message's id, or a post's.
    targetId: text("target_id").notNull(),
    // Where it was said: a message's channel, or "city:<City>" for a post.
    channel: text("channel").notNull(),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("reports_once").on(t.reporterId, t.kind, t.targetId)],
);

export type ArenaKind = "bounty" | "hackathon" | "challenge";

// The Arena: each city's challenge for one week (Monday 00:00 UTC to the next). Made the first time anyone asks
// (no cron), from the catalogue in apps/api/src/arena/catalogue.ts. Closed, and its podium awarded, when the city's
// next week is made.
export const arenaChallenges = pgTable("arena_challenges", {
  // "<City>:<weekStart>", so a week can only be made once per city, whoever asks first.
  id: text("id").primaryKey(),
  city: text("city").notNull(),
  weekStart: date("week_start", { mode: "string" }).notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  // The catalogue entry, and the repo and folder people send pull requests to.
  slug: text("slug").notNull(),
  kind: text("kind").$type<ArenaKind>().notNull(),
  repo: text("repo").notNull(),
  path: text("path").notNull(),
  prizeFcfa: integer("prize_fcfa").notNull(),
  // Set once, when the week is over and its podium has been awarded.
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: createdAt(),
});

// Who took part in a week's challenge.
export const arenaEntries = pgTable(
  "arena_entries",
  {
    challengeId: text("challenge_id").notNull().references(() => arenaChallenges.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.challengeId, t.userId] })],
);

export type ArenaPrState = "open" | "merged" | "closed";

// A pull request someone sent for a challenge, and what it's worth: points only once it's merged.
export const arenaSubmissions = pgTable(
  "arena_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    challengeId: text("challenge_id").notNull().references(() => arenaChallenges.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    // "owner/name", in lower case, so GitHub's webhooks find it whatever the case.
    repo: text("repo").notNull(),
    number: integer("number").notNull(),
    title: text("title"),
    state: text("state").$type<ArenaPrState>().notNull().default("open"),
    points: integer("points").notNull().default(0),
    // The label that set the points ("arena:high"), or null.
    label: text("label"),
    // When it earned its points (merged): the earlier last scoring time wins a tie on the podium.
    scoredAt: timestamp("scored_at", { withTimezone: true }),
    // When GitHub was last asked about it, or told us.
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("arena_submissions_once").on(t.challengeId, t.repo, t.number),
    index("arena_submissions_challenge_user").on(t.challengeId, t.userId),
    index("arena_submissions_pr").on(t.repo, t.number),
  ],
);

// A title won: 1st place gets the challenge's own, 2nd and 3rd a podium badge. The words are copied in, so a title
// stays as it was won even if the catalogue changes.
export const arenaAwards = pgTable(
  "arena_awards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    challengeId: text("challenge_id").notNull().references(() => arenaChallenges.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    place: smallint("place").notNull(),
    key: text("key").notNull(),
    titleEn: text("title_en").notNull(),
    titleFr: text("title_fr").notNull(),
    city: text("city").notNull(),
    week: date("week", { mode: "string" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("arena_awards_once").on(t.challengeId, t.userId),
    uniqueIndex("arena_awards_place").on(t.challengeId, t.place),
    index("arena_awards_user").on(t.userId, t.createdAt),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({ memberships: many(memberships) }));
export const housesRelations = relations(houses, ({ many, one }) => ({
  rooms: many(rooms),
  memberships: many(memberships),
  chef: one(users, { fields: [houses.chefId], references: [users.id] }),
}));
export const roomsRelations = relations(rooms, ({ one }) => ({
  house: one(houses, { fields: [rooms.houseId], references: [houses.id] }),
  occupant: one(users, { fields: [rooms.occupantId], references: [users.id] }),
}));
export const membershipsRelations = relations(memberships, ({ one }) => ({
  house: one(houses, { fields: [memberships.houseId], references: [houses.id] }),
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
}));
export const applicationsRelations = relations(applications, ({ one, many }) => ({
  house: one(houses, { fields: [applications.houseId], references: [houses.id] }),
  applicant: one(users, { fields: [applications.applicantId], references: [users.id] }),
  votes: many(votes),
}));
export const votesRelations = relations(votes, ({ one }) => ({
  application: one(applications, { fields: [votes.applicationId], references: [applications.id] }),
  voter: one(users, { fields: [votes.voterId], references: [users.id] }),
}));
export const messagesRelations = relations(messages, ({ one }) => ({
  author: one(users, { fields: [messages.authorId], references: [users.id] }),
}));
