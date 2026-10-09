// coloc.dev's database. The house servers have their own Postgres (the kitchen); this one is the agency's.
// Durable things live here. Live-only things (is the agent online, the latest CPU reading, who's looking at
// the city right now) stay in the API's memory and are rebuilt when an agent reconnects.
import { relations } from "drizzle-orm";
import { bigint, boolean, index, integer, jsonb, pgTable, primaryKey, real, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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
