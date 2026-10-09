// coloc.dev's database. The house servers have their own Postgres (the kitchen); this one is the agency's.
// Durable things live here. Live-only things (is the agent online, the latest CPU reading, who's looking at
// the city right now) stay in the API's memory and are rebuilt when an agent reconnects.
import { relations } from "drizzle-orm";
import { bigint, bigserial, boolean, index, integer, jsonb, pgTable, primaryKey, real, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// Everyone who has logged in with GitHub. Demo flatmates (seeded) have no GitHub id.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  githubId: bigint("github_id", { mode: "number" }).unique(),
  login: text("login").notNull().unique(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  location: text("location"),
  // Their character in the lobby: one of the models in apps/web/public/lobby/people ("female-a" … "male-f").
  avatar: text("avatar"),
  createdAt: createdAt(),
});

// A login session. The browser holds a random token; we only keep its SHA-256, so a database leak
// doesn't hand out sessions.
export const sessions = pgTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export type HouseStatus = "making" | "live";

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
  // House rules. strictReviews: an unreviewed merge doesn't deploy.
  rules: jsonb("rules").$type<{ strictReviews: boolean }>().notNull().default({ strictReviews: true }),
  // Seeded so the city isn't empty for the demo. The UI labels them, so nobody mistakes them for real houses.
  demo: boolean("demo").notNull().default(false),
  // Where it stands in its city's lobby: the plot key the neighbourhood generator gives every empty building
  // ("2.1.0.1"). Null: no plot rented, so the lobby places it near the market.
  plot: text("plot"),
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
  },
  (t) => [uniqueIndex("rooms_house_name").on(t.houseId, t.name)],
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
  },
  (t) => [primaryKey({ columns: [t.houseId, t.userId] })],
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

// Chat. A channel is either a house's living room ("house:<id>") or an application's thread ("application:<id>").
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
