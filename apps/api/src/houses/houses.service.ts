import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  applications,
  arenaAwards,
  arenaChallenges,
  billPayments,
  chores,
  type Db,
  deployments,
  fridgeNotes,
  houseGuests,
  houses,
  type HousePlan,
  leaseEnds,
  memberships,
  repos,
  roomTeammates,
  rooms,
  type RoomStatus,
  usageSamples,
  users,
} from "@coloc/db";
import { BUILD_CANCELLED, type DeployKind, type DeployStatus, type RoomEvent, RoomName, type RoomsSnapshot, type Usage } from "@coloc/protocol";
import { creditReviews, splitBill, tontineTurn } from "@coloc/domain";
import { and, asc, count, desc, eq, gt, gte, inArray, isNull, isNotNull, lt, ne, or, sql } from "drizzle-orm";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { auditTime, concatMap, filter, Subject, tap } from "rxjs";
import { isCoreDown } from "../core/core";
import { CreditService, projectKey } from "../credit/credit.service";
import { DB } from "../db/db.module";
import { channelMessages, houseChannel, openDoorbell } from "../doorbell/queries";
import { guestStanding } from "./guests";
import { type Draft, noteForDeploy, noteForRoomEvent } from "./fridge";
import { happenings } from "./happenings";
import { billedRooms } from "./leases";
import { plainNote, readNote } from "./lines";
import { billReference, monthEnd, monthOf, monthStart, operatorsFor, PROJECT_COST_FCFA, REVIEW_CREDIT_FCFA, TONTINE_ANCHOR, WORKSHOP_ID } from "./money";
import { PLAN_COST_FCFA } from "./server";
import { alias } from "drizzle-orm/pg-core";
import type {
  BillView,
  ChoreView,
  CityChange,
  CityView,
  DeploymentView,
  DoorbellItem,
  FridgeNoteView,
  HouseView,
  LedgerLine,
  MessageView,
  PersonView,
  RoomUsage,
  TontineView,
} from "./house.types";

const NOTE_COLLAPSE_MS = 10 * 60 * 1000;
const RECENT = 20;
// A deploy still "building" after this long lost its agent on the way: the city stops showing a crane for it.
const BUILD_STALE_MS = 15 * 60 * 1000;
const IN_FLIGHT = ["queued", "cloning", "building", "starting"] as const;

type UserRow = typeof users.$inferSelect;

/**
 * A room's address as its house's caretaker reports it, if it's one the house may give: http(s), and the room's own
 * name (or its preview's) under the house's domain. Anything else (a javascript: link, another site) is dropped: a
 * caretaker is a program on somebody else's server, and the address is shown to everyone as a link.
 */
export function roomAddress(url: string | null | undefined, room: string, domain: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const ours = host === `${room}.${domain}`.toLowerCase() || host === `preview-${room}.${domain}`.toLowerCase();
    return (u.protocol === "http:" || u.protocol === "https:") && ours && !u.username && !u.password ? url : null;
  } catch {
    return null;
  }
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

// A new house starts with four rooms: the chef's, and three to fill.
const FIRST_ROOMS = 4;

// Where a house's rooms are served: <room>.<house>.coloc.dev. The same pattern the seed uses for demo houses.
export function houseDomain(houseId: string): string {
  return `${houseId}.coloc.dev`;
}

// "Sacré-Cœur" → "sacre-coeur". Lowercase, accents dropped, anything else becomes a dash, at most 40 characters.
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // the accents NFD split off the letters
    .replace(/œ/gi, "oe")
    .replace(/æ/gi, "ae")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40)
    .replace(/^-+|-+$/g, "");
}

// `github`: whether they logged in with GitHub, so the web may link their profile. Seeded and demo people never did.
// `badge`: their worn Arena title, copied on the users row (arena/badges.ts).
// A room's repository, as a link: the GitHub repo linked to it, or the https address it was set up from.
function repoLink(fullName: string | undefined, source: string | null): string | null {
  if (fullName) return `https://github.com/${fullName}`;
  return source?.startsWith("https://") ? source : null;
}

function person(u: Pick<UserRow, "login" | "name" | "avatarUrl" | "githubId" | "badge"> | null | undefined): PersonView | null {
  return u ? { login: u.login, name: u.name, avatarUrl: u.avatarUrl, github: u.githubId !== null, badge: u.badge ?? null } : null;
}

const SNAPSHOT_FRESH_MS = 5000;

@Injectable()
export class HousesService {
  // Pings live pages (house page, city) with the id of the house that changed.
  readonly changes = new Subject<string>();
  // What the city stream tells every open page: which houses changed. Worked out once, however many pages listen.
  readonly cityChanges = new Subject<CityChange>();
  // A deployment went live or failed. The GitHub side listens, to report back on the pull request.
  readonly deployFinished = new Subject<{ houseId: string; deployment: typeof deployments.$inferSelect; url: string | null }>();
  private cityKnown: CityView | null = null;
  private cityJson = new Map<string, string>();
  // Changes heard, and how many the city above already includes.
  private cityAsked = 0;
  private cityTold = -1;
  private cityAt = 0;
  private readonly cityLog = new Logger("city");
  private cityQueue: Promise<void> = Promise.resolve();
  // Live-only state: rebuilt when agents reconnect, so it isn't worth a database write.
  private online = new Set<string>();
  private usage = new Map<string, Map<string, RoomUsage>>();

  // People's fake money: a house's server, its rent and its projects are paid from it.
  readonly credit: CreditService;

  constructor(@Inject(DB) private readonly db: Db) {
    this.credit = new CreditService(db);
    this.changes
      .pipe(
        tap(() => this.cityAsked++),
        auditTime(1000),
        filter(() => this.cityChanges.observed),
        concatMap(() => this.refreshCity().catch((e) => void (isCoreDown(e) || this.cityLog.error(e)))),
      )
      .subscribe();
  }

  async exists(houseId: string): Promise<boolean> {
    const [h] = await this.db.select({ id: houses.id }).from(houses).where(eq(houses.id, houseId));
    return !!h;
  }

  // Constant-time comparison of hashes, so the secret can't be guessed byte by byte from response times.
  async verifyAgentSecret(houseId: string, secret: string): Promise<boolean> {
    const [h] = await this.db.select({ hash: houses.agentSecretHash }).from(houses).where(eq(houses.id, houseId));
    const a = Buffer.from(hashSecret(secret), "hex");
    // Unknown house or no agent yet: still compare against something, so timing says nothing.
    const b = Buffer.from(h?.hash ?? hashSecret(randomUUID()), "hex");
    return !!h?.hash && timingSafeEqual(a, b);
  }

  /**
   * The chef rents the house's server: picks a size and gets a fresh agent secret to install with.
   * Only the secret's SHA-256 is stored; the secret itself is returned once, here, and never logged.
   * A house that already has a key keeps it unless `renew` is true: then the new key replaces the old one,
   * and an agent still holding the old key can no longer get in.
   */
  async rentServer(
    houseId: string,
    plan: HousePlan,
    renew: boolean,
    secret = randomBytes(32).toString("base64url"),
  ): Promise<{ secret: string; plan: HousePlan; monthlyCostFcfa: number; domain: string }> {
    const monthlyCostFcfa = PLAN_COST_FCFA[plan];
    // One statement, so two clicks at once can't both make a key: without `renew`, it only matches a house with none.
    const updated = await this.db
      .update(houses)
      .set({ agentSecretHash: hashSecret(secret), plan, monthlyCostFcfa })
      .where(renew ? eq(houses.id, houseId) : and(eq(houses.id, houseId), isNull(houses.agentSecretHash)))
      .returning({ domain: houses.domain });
    if (!updated.length) {
      if (!(await this.exists(houseId))) throw new NotFoundException();
      throw new ConflictException("This house already has a key. Make a new one to replace it.");
    }
    this.changes.next(houseId);
    return { secret, plan, monthlyCostFcfa, domain: updated[0].domain };
  }

  /** Where the house's rooms are served, once it's known which machine hosts them. */
  async setDomain(houseId: string, domain: string): Promise<string> {
    await this.db.update(houses).set({ domain }).where(eq(houses.id, houseId));
    return domain;
  }

  /** How many servers this person runs: houses they're chef of with a key, besides this one. */
  async serversOf(userId: string, besides: string): Promise<number> {
    const [{ n }] = await this.db
      .select({ n: count() })
      .from(houses)
      .where(and(eq(houses.chefId, userId), isNotNull(houses.agentSecretHash), ne(houses.id, besides)));
    return n;
  }

  /** The house this person already runs a server in, besides this one: where to send them when they can't rent another. */
  async serverOf(userId: string, besides: string): Promise<{ id: string; name: string } | null> {
    const [h] = await this.db
      .select({ id: houses.id, name: houses.name })
      .from(houses)
      .where(and(eq(houses.chefId, userId), isNotNull(houses.agentSecretHash), ne(houses.id, besides)))
      .limit(1);
    return h ?? null;
  }

  /** The houses with a key: the landlord looks through them after a restart (landlord.ts). */
  keyedHouses(): Promise<{ id: string; domain: string; agentSecretHash: string | null }[]> {
    return this.db.select({ id: houses.id, domain: houses.domain, agentSecretHash: houses.agentSecretHash }).from(houses).where(isNotNull(houses.agentSecretHash));
  }

  /**
   * The chef sets the house's review rule. Strict: a merge only goes online once a flatmate approves it (see the
   * GitHub deploys). Relaxed: it goes online anyway, with a note. Example houses keep the rule the seed gave them.
   * Setting the rule it already has changes nothing and pins no note.
   */
  async setRules(houseId: string, strictReviews: boolean, by: string): Promise<{ strictReviews: boolean }> {
    const [h] = await this.db.select({ demo: houses.demo, rules: houses.rules }).from(houses).where(eq(houses.id, houseId));
    if (!h) throw new NotFoundException();
    if (h.demo) throw new ConflictException("This is an example house: its rules are for show.");
    if (h.rules.strictReviews === strictReviews) return h.rules;
    const rules = { ...h.rules, strictReviews };
    await this.db.update(houses).set({ rules }).where(eq(houses.id, houseId));
    await this.addNote(houseId, {
      tone: "info",
      text: strictReviews
        ? `${by} made reviews strict: merges go online once a flatmate approves.`
        : `${by} made reviews relaxed: merges go online without waiting for a review.`,
    });
    this.changes.next(houseId);
    return rules;
  }

  /** The house's agent just proved its secret: a house still in the making is now live. Returns true if it flipped. */
  async markLive(houseId: string): Promise<boolean> {
    const flipped = await this.db
      .update(houses)
      .set({ status: "live" })
      .where(and(eq(houses.id, houseId), eq(houses.status, "making")))
      .returning({ id: houses.id });
    if (!flipped.length) return false;
    this.changes.next(houseId);
    return true;
  }

  setAgentOnline(houseId: string, online: boolean) {
    if (online) this.online.add(houseId);
    else {
      this.online.delete(houseId);
      this.usage.delete(houseId);
    }
    this.changes.next(houseId);
  }

  isAgentOnline(houseId: string): boolean {
    return this.online.has(houseId);
  }

  async room(houseId: string, name: string) {
    const [r] = await this.db.select().from(rooms).where(and(eq(rooms.houseId, houseId), eq(rooms.name, name)));
    return r;
  }

  async membership(houseId: string, userId: string) {
    const [m] = await this.db
      .select()
      .from(memberships)
      .where(and(eq(memberships.houseId, houseId), eq(memberships.userId, userId)));
    return m;
  }

  async createDeployment(
    houseId: string,
    room: string,
    kind: DeployKind,
    repo: string,
    ref: string,
    requestedBy?: string | null,
    github?: { repoId: number; prNumber: number },
  ): Promise<DeploymentView> {
    const id = randomUUID().slice(0, 8);
    const [d] = await this.db
      .insert(deployments)
      .values({
        id,
        houseId,
        room,
        kind,
        repo: redactToken(repo),
        ref,
        status: "queued",
        requestedBy: requestedBy ?? null,
        githubRepoId: github?.repoId ?? null,
        prNumber: github?.prNumber ?? null,
      })
      .returning();
    if (kind === "prod") {
      const r = await this.room(houseId, room);
      if (r) {
        await this.db
          .update(rooms)
          .set({ status: r.status === "live" ? "live" : "deploying", lastDeployId: id })
          .where(eq(rooms.id, r.id));
      }
    }
    this.changes.next(houseId);
    return deploymentView(d);
  }

  private async domainOf(houseId: string): Promise<string> {
    const [h] = await this.db.select({ domain: houses.domain }).from(houses).where(eq(houses.id, houseId));
    return h?.domain ?? "";
  }

  // A caretaker that restarted forgets its builds, and they'd say "building" for ever. The API restarting takes the
  // caretakers it started with it, so this happens. Anything it isn't on any more has failed, and can be tried again.
  async failLostBuilds(houseId: string, building: string[]) {
    const open = await this.db.select({ id: deployments.id, room: deployments.room }).from(deployments).where(and(eq(deployments.houseId, houseId), inArray(deployments.status, [...IN_FLIGHT])));
    for (const d of open) {
      if (building.includes(d.id)) continue;
      await this.recordDeployStatus(houseId, { type: "deploy_status", deployId: d.id, room: d.room, status: "failed", detail: "The server restarted during this build. Your code is fine: try it again." });
    }
  }

  async recordDeployStatus(houseId: string, s: DeployStatus) {
    const [d] = await this.db
      .update(deployments)
      .set({ status: s.status, detail: s.detail ?? null, updatedAt: new Date() })
      .where(and(eq(deployments.id, s.deployId), eq(deployments.houseId, houseId)))
      .returning();
    // Its record is gone: the lease on that room ended during the build. The caretaker is about to clear it out.
    if (!d) return;
    const room = await this.room(houseId, s.room);
    const url = s.url ? roomAddress(s.url, s.room, await this.domainOf(houseId)) : null;
    if (room && d.kind === "prod") {
      if (s.status === "live") {
        await this.db.update(rooms).set({ status: "live", url }).where(eq(rooms.id, room.id));
        // The first time a project goes online in this room, it costs its occupant. A failed build costs nothing.
        const payer = room.occupantId ?? d.requestedBy;
        if (!room.url && payer && houseId !== WORKSHOP_ID) await this.credit.charge(payer, PROJECT_COST_FCFA, "project", projectKey(houseId, room.name, payer));
      } else if (s.status === "failed" && room.status !== "live") {
        // Cancelled on purpose: nothing went wrong, so the room goes back to where it was (live rooms never left).
        const status = s.detail !== BUILD_CANCELLED ? "failed" : room.url ? "down" : "empty";
        await this.db.update(rooms).set({ status }).where(eq(rooms.id, room.id));
      }
    }
    const note = room ? noteForDeploy(s, await this.occupantName(room.occupantId)) : null;
    if (note) await this.addNote(houseId, note);
    this.changes.next(houseId);
    if (s.status === "live" || s.status === "failed") this.deployFinished.next({ houseId, deployment: d, url });
  }

  async recordUsage(houseId: string, u: Usage) {
    const live = this.usage.get(houseId) ?? new Map<string, RoomUsage>();
    for (const s of u.samples) live.set(s.room, { cpuPercent: s.cpuPercent, memoryBytes: s.memoryBytes, memoryLimitBytes: s.memoryLimitBytes, at: u.at });
    this.usage.set(houseId, live);
    // Kept for the monthly bill.
    if (u.samples.length) {
      await this.db
        .insert(usageSamples)
        .values(u.samples.map((s) => ({ houseId, room: s.room, at: new Date(u.at), cpuPercent: s.cpuPercent, memoryBytes: s.memoryBytes })));
    }
    this.changes.next(houseId);
  }

  async recordRoomEvent(houseId: string, e: RoomEvent) {
    const room = await this.room(houseId, e.room);
    if (!room) return;
    let status: RoomStatus | null = null;
    if (e.event === "crashed") status = "down";
    // Out of memory: Docker restarts it on its own, so the room is still lived in.
    if ((e.event === "oom" || e.event === "restarted") && room.url) status = "live";
    if (status) await this.db.update(rooms).set({ status }).where(eq(rooms.id, room.id));
    await this.addNote(houseId, noteForRoomEvent(e, await this.occupantName(room.occupantId)));
    this.changes.next(houseId);
  }

  async emptyRoom(houseId: string, roomName: string) {
    await this.db
      .update(rooms)
      .set({ status: "empty", url: null })
      .where(and(eq(rooms.houseId, houseId), eq(rooms.name, roomName)));
    this.usage.get(houseId)?.delete(roomName);
    this.changes.next(houseId);
  }

  // The agent's word is the truth about what's running: rebuild room status from it. Example rooms (`demo`)
  // never run anything, so the agent never reports them; they keep the status the seed gave them.
  // A free room is always empty, whatever runs there. Returns the free rooms that still have containers, so the
  // caller can ask the agent to clear them out (a leftover from someone who moved out).
  async applySnapshot(houseId: string, snap: RoomsSnapshot): Promise<string[]> {
    const all = await this.db.select().from(rooms).where(and(eq(rooms.houseId, houseId), eq(rooms.demo, false)));
    const domain = await this.domainOf(houseId);
    const leftovers: string[] = [];
    const ended = new Set((await this.db.select({ room: leaseEnds.room }).from(leaseEnds).where(eq(leaseEnds.houseId, houseId))).map((l) => l.room));
    for (const room of all) {
      const prod = snap.rooms.find((r) => r.room === room.name && r.kind === "prod");
      let next: { status: RoomStatus; url: string | null };
      // Nobody lives here, or someone moved in after a lease ended while the server was off and hasn't built yet, so
      // what's running is the last tenant's. lastDeployId is set before any build starts: a new one can't be mistaken.
      if (!room.occupantId || (ended.has(room.name) && !room.lastDeployId)) {
        if (snap.rooms.some((r) => r.room === room.name)) leftovers.push(room.name);
        next = { status: "empty", url: null };
      } else {
        next = prod
          ? { status: prod.state === "running" ? "live" : "down", url: roomAddress(prod.url, room.name, domain) }
          : { status: room.status === "deploying" ? "deploying" : "empty", url: null };
      }
      if (next.status !== room.status || next.url !== room.url) await this.db.update(rooms).set(next).where(eq(rooms.id, room.id));
    }
    this.changes.next(houseId);
    return leftovers;
  }

  // The house profile, as `viewerId` sees it. Never includes the agent secret's hash.
  async view(houseId: string, viewerId?: string | null): Promise<HouseView | null> {
    const h = await this.db.query.houses.findFirst({
      where: eq(houses.id, houseId),
      with: {
        chef: true,
        rooms: { with: { occupant: true }, orderBy: asc(rooms.name) },
        memberships: { with: { user: true }, orderBy: [asc(memberships.tontinePosition), asc(memberships.joinedAt)] },
      },
    });
    if (!h) return null;

    const now = new Date();
    const mine = viewerId ? h.memberships.find((m) => m.userId === viewerId) : undefined;
    // A flatmate may rent several rooms here: in the house's order, so the first is always the same one.
    const myRooms = viewerId ? h.rooms.filter((r) => r.occupantId === viewerId).map((r) => r.name) : [];
    const viewerRow = viewerId ? (mine?.user ?? (await this.db.query.users.findFirst({ where: eq(users.id, viewerId) }))) : undefined;
    const live = this.usage.get(houseId);
    const team = await this.teams([houseId]);

    let recentDeployments: DeploymentView[] | null = null;
    let notes: FridgeNoteView[] | null = null;
    let doorbell: DoorbellItem[] | null = null;
    let channel: MessageView[] | null = null;
    let openChores: ChoreView[] | null = null;
    let myApplication: string | null = null;
    // People let into the house's chat from outside, for those who can read it; and this viewer's own standing.
    const guestRows = await this.db.select({ userId: houseGuests.userId, status: houseGuests.status, askedAt: houseGuests.askedAt, decidedAt: houseGuests.decidedAt, user: users }).from(houseGuests).innerJoin(users, eq(users.id, houseGuests.userId)).where(eq(houseGuests.houseId, houseId));
    const myGuest = mine ? null : guestStanding(guestRows.find((g) => g.userId === viewerId));
    const linked = mine ? await this.db.select({ room: repos.room, fullName: repos.fullName }).from(repos).where(eq(repos.houseId, houseId)) : [];
    if (mine) {
      const ds = await this.db.select().from(deployments).where(eq(deployments.houseId, houseId)).orderBy(desc(deployments.createdAt)).limit(RECENT);
      const ns = await this.db.select().from(fridgeNotes).where(eq(fridgeNotes.houseId, houseId)).orderBy(desc(fridgeNotes.at)).limit(RECENT);
      recentDeployments = ds.map(deploymentView);
      notes = ns.map((n) => ({ id: n.id, tone: n.tone, text: plainNote(n.text), said: readNote(n.text), room: n.room, at: n.at.toISOString(), count: n.count }));
      doorbell = await openDoorbell(this.db, houseId, h.memberships.length);
      channel = await channelMessages(this.db, houseChannel(houseId), undefined, viewerId);
      openChores = await this.openChores(houseId);
    } else if (viewerId) {
      const [app] = await this.db
        .select({ id: applications.id })
        .from(applications)
        .where(and(eq(applications.houseId, houseId), eq(applications.applicantId, viewerId), eq(applications.status, "open")));
      myApplication = app?.id ?? null;
      if (myGuest === "accepted") channel = await channelMessages(this.db, houseChannel(houseId), undefined, viewerId);
    }

    return {
      id: h.id,
      name: h.name,
      city: h.city,
      country: h.country,
      tagline: h.tagline,
      status: h.status,
      demo: h.demo,
      tutorial: h.tutorial,
      domain: h.domain,
      operators: operatorsFor(h.country),
      agentOnline: this.online.has(h.id),
      monthlyCostFcfa: h.monthlyCostFcfa,
      rules: h.rules,
      chef: person(h.chef),
      members: h.memberships.map((m) => ({ ...person(m.user)!, role: m.role })),
      rooms: h.rooms.map((r) => ({
        name: r.name,
        limits: { memoryMb: r.memoryMb, cpus: r.cpus },
        // Nobody lives in a free room, so nothing of theirs is online there, whatever a leftover container says.
        status: r.occupantId ? r.status : "empty",
        url: r.occupantId ? r.url : null,
        project: r.project,
        projectDescription: r.projectDescription,
        ad: r.occupantId ? null : r.ad,
        occupant: person(r.occupant),
        usage: live?.get(r.name) ?? null,
        demo: r.demo,
        repo: mine && r.occupantId ? repoLink(linked.find((l) => l.room === r.name)?.fullName, r.source) : null,
        team: r.occupantId ? (team.get(`${h.id}/${r.name}`) ?? []).map((u) => person(u)!) : [],
      })),
      viewer: viewerRow
        ? {
            login: viewerRow.login,
            member: !!mine,
            role: mine?.role ?? null,
            room: myRooms[0] ?? null,
            rooms: myRooms,
            leavingUntil: mine?.leavingMonth ? monthEnd(mine.leavingMonth).toISOString() : null,
            application: myApplication,
            guest: myGuest,
          }
        : null,
      guests: mine || myGuest === "accepted" ? guestRows.filter((g) => g.status === "accepted" && !h.memberships.some((m) => m.userId === g.userId)).map((g) => person(g.user)!) : null,
      deployments: recentDeployments,
      notes,
      doorbell,
      channel,
      chores: openChores,
      // The chef only: which server they rented and whether its key exists. Never the key or its hash.
      server: mine?.role === "chef" ? { plan: h.plan, keyMade: !!h.agentSecretHash } : null,
      ledger: await this.ledger(houseId, h.memberships.map((m) => ({ id: m.userId, login: m.user.login }))),
      reviewsThisMonth: await this.reviewsThisMonth(houseId, now),
      tontine: h.tutorial ? null : tontineView(h.memberships, h.rooms, now),
      bill: mine ? await this.bill(h, now) : null,
    };
  }

  /**
   * Someone starts a coloc on an empty lobby plot. The house is "making" until a server is rented, and the
   * chef gets the first of four rooms. Returns the new house's id (a slug of its name).
   */
  async rent(chefId: string, input: { city: string; plot: string; name: string; tagline: string | null }): Promise<{ id: string }> {
    const chef = await this.db.query.users.findFirst({ where: eq(users.id, chefId) });
    if (!chef) throw new NotFoundException("No such person.");
    // Only cities that are already on the map: the lobby has no neighbourhood for any other.
    const [neighbour] = await this.db.select({ country: houses.country }).from(houses).where(eq(houses.city, input.city)).limit(1);
    if (!neighbour) throw new NotFoundException("No such city.");
    const id = slugify(input.name);
    // "!!" is two characters but no slug: the id becomes the house's subdomain, so it needs real letters or digits.
    if (id.length < 2) throw new BadRequestException("Give the house a name with letters or digits in it.");

    await this.db.transaction(async (tx) => {
      // One house in the making per person, so nobody carpets the city with empty houses.
      const [making] = await tx
        .select({ name: houses.name })
        .from(houses)
        .where(and(eq(houses.chefId, chefId), eq(houses.status, "making")));
      if (making) throw new ConflictException(`You're already setting up ${making.name}. Finish that one first.`);
      const [taken] = await tx.select({ id: houses.id }).from(houses).where(and(eq(houses.city, input.city), eq(houses.plot, input.plot)));
      if (taken) throw new ConflictException("That plot is taken.");
      const [sameName] = await tx.select({ id: houses.id }).from(houses).where(eq(houses.id, id));
      if (sameName) throw new ConflictException("A house already has that name.");

      await tx.insert(houses).values({
        id,
        name: input.name,
        city: input.city,
        country: neighbour.country,
        tagline: input.tagline,
        domain: houseDomain(id),
        status: "making",
        demo: false,
        chefId,
        monthlyCostFcfa: null,
        plot: input.plot,
      });
      await tx.insert(memberships).values({ houseId: id, userId: chefId, role: "chef", tontinePosition: 0 });
      // The chef's room is named after them when their login makes a valid room name ("Djbrl" → "djbrl").
      const own = slugify(chef.login);
      const chefRoom = RoomName.safeParse(own).success && !/^room-\d+$/.test(own) ? own : "room-1";
      const names = [chefRoom, ...Array.from({ length: FIRST_ROOMS - 1 }, (_, i) => `room-${i + 2}`)];
      await tx.insert(rooms).values(
        names.map((name, i) => ({ houseId: id, name, occupantId: i === 0 ? chefId : null, memoryMb: 256, cpus: 0.5, status: "empty" as const })),
      );
    });
    // The city stream re-sends on any change, so the new house appears in every open lobby.
    this.changes.next(id);
    return { id };
  }

  // Every house, as the city draws it. Real houses first, then the busiest. The tutorial's workshop isn't on it.
  async city(): Promise<CityView> {
    const now = new Date();
    const all = await this.db.query.houses.findMany({
      where: eq(houses.tutorial, false),
      with: {
        rooms: { with: { occupant: true }, orderBy: asc(rooms.name) },
        memberships: { with: { user: true }, orderBy: [asc(memberships.tontinePosition), asc(memberships.joinedAt)] },
      },
      orderBy: [asc(houses.demo), asc(houses.createdAt)],
    });

    // The live exchange, for every house at once: a few small queries, counted here.
    const since = monthStart(monthOf(now));
    const choreRows = await this.db
      .select({ houseId: chores.houseId, status: chores.status, dueAt: chores.dueAt })
      .from(chores)
      .where(or(eq(chores.status, "open"), gte(chores.doneAt, since)));
    const knocks = await this.db.select({ houseId: applications.houseId }).from(applications).where(eq(applications.status, "open"));
    // A room is building when its latest prod deploy (rooms.lastDeployId) is still on its way, and recently so.
    const lastIds = all.flatMap((h) => h.rooms.map((r) => r.lastDeployId)).filter((id): id is string => !!id);
    const building = new Set(
      lastIds.length
        ? (
            await this.db
              .select({ houseId: deployments.houseId, room: deployments.room })
              .from(deployments)
              .where(
                and(
                  inArray(deployments.id, lastIds),
                  inArray(deployments.status, [...IN_FLIGHT]),
                  gt(deployments.updatedAt, new Date(now.getTime() - BUILD_STALE_MS)),
                ),
              )
          ).map((d) => `${d.houseId}/${d.room}`)
        : [],
    );
    const byHouse = <T extends { houseId: string }>(rows: T[]) => {
      const out = new Map<string, T[]>();
      for (const r of rows) {
        const list = out.get(r.houseId);
        if (list) list.push(r);
        else out.set(r.houseId, [r]);
      }
      return out;
    };
    const choresOf = byHouse(choreRows);
    const knocksOf = byHouse(knocks);
    const housesById = new Map(all.map((h) => [h.id, h]));
    // Who teamed up on which room, and what just happened in each house (a review, a crash, a deploy, a team).
    const team = await this.teams(all.map((h) => h.id));
    const teamLogins = (houseId: string, room: string) => {
      const occupant = housesById.get(houseId)?.rooms.find((r) => r.name === room)?.occupant;
      return occupant ? [occupant.login, ...(team.get(`${houseId}/${room}`) ?? []).map((u) => u.login)] : [];
    };
    const recent = await happenings(this.db, all.map((h) => h.id), teamLogins, now);

    return {
      houses: all.map((h) => ({
        id: h.id,
        name: h.name,
        city: h.city,
        country: h.country,
        tagline: h.tagline,
        status: h.status,
        demo: h.demo,
        agentOnline: this.online.has(h.id),
        monthlyCostFcfa: h.monthlyCostFcfa,
        plot: h.plot,
        rooms: h.rooms.map((r) => ({
          name: r.name,
          // A free room is always empty (see view()).
          status: r.occupantId ? r.status : "empty",
          url: r.occupantId ? r.url : null,
          project: r.project,
          projectDescription: r.projectDescription,
          ad: r.occupantId ? null : r.ad,
          occupant: person(r.occupant),
          team: r.occupantId ? (team.get(`${h.id}/${r.name}`) ?? []).map((u) => person(u)!) : [],
          building: !!r.occupantId && building.has(`${h.id}/${r.name}`),
        })),
        openChores: (choresOf.get(h.id) ?? []).filter((c) => c.status === "open").length,
        lateChores: (choresOf.get(h.id) ?? []).filter((c) => c.status === "open" && c.dueAt < now).length,
        knocking: knocksOf.get(h.id)?.length ?? 0,
        reviewsThisMonth: (choresOf.get(h.id) ?? []).filter((c) => c.status === "done").length,
        tontine: cityTontine(h.memberships, h.rooms, now),
        cpu: this.cpuOf(h.id, h.rooms),
        recent: recent.get(h.id) ?? [],
      })),
    };
  }

  /**
   * The city as a stream opens with it, and from then on only what changed. One question to the database per change
   * (at most once a second, and not at all while nobody listens), whatever the number of pages. The questions go one
   * at a time, so an old answer can't undo a newer one. Pages opening together share an answer a few seconds old.
   */
  async citySnapshot(): Promise<CityView> {
    if (this.cityKnown && this.cityAsked === this.cityTold && Date.now() - this.cityAt < SNAPSHOT_FRESH_MS) return this.cityKnown;
    await this.refreshCity();
    return this.cityKnown!;
  }

  private refreshCity(): Promise<void> {
    const run = async () => {
      const asked = this.cityAsked;
      const view = await this.city();
      const before = this.cityJson;
      const after = new Map(view.houses.map((h) => [h.id, JSON.stringify(h)]));
      const changed = view.houses.filter((h) => before.get(h.id) !== after.get(h.id));
      const gone = [...before.keys()].filter((id) => !after.has(id));
      const first = !this.cityKnown;
      this.cityKnown = view;
      this.cityJson = after;
      this.cityTold = asked;
      this.cityAt = Date.now();
      if (!first && (changed.length || gone.length)) this.cityChanges.next({ changed, gone });
    };
    const next = this.cityQueue.then(run, run);
    this.cityQueue = next.catch(() => undefined);
    return next;
  }

  // The house's rooms' latest CPU readings added up, in percent of one core: 0 when its caretaker is offline or
  // hasn't measured yet. Only rooms someone lives in (a free room serves nothing, whatever a leftover container says).
  private cpuOf(houseId: string, rs: RoomRow[]): number {
    const live = this.usage.get(houseId);
    if (!live) return 0;
    const total = rs.filter((r) => r.occupantId).reduce((sum, r) => sum + (live.get(r.name)?.cpuPercent ?? 0), 0);
    return Math.round(total * 10) / 10;
  }

  /**
   * Everyone on a room's project: its occupant, then its teammates (user ids). Empty for a free or missing room.
   * They never review that project's pull requests, and a review among them earns no credit on the bill.
   */
  async projectPeople(houseId: string, roomName: string): Promise<string[]> {
    const r = await this.room(houseId, roomName);
    if (!r?.occupantId) return [];
    return [r.occupantId, ...((await this.teams([houseId])).get(`${houseId}/${roomName}`) ?? []).map((u) => u.id)];
  }

  /**
   * Who teamed up on which room of `houseIds`, as "<house>/<room>" → people, first to join first. Only people who
   * still live in that house: a row left behind by someone who moved out doesn't count.
   */
  async teams(houseIds: string[]): Promise<Map<string, UserRow[]>> {
    const out = new Map<string, UserRow[]>();
    if (!houseIds.length) return out;
    const rows = await this.db
      .select({ houseId: rooms.houseId, room: rooms.name, user: users })
      .from(roomTeammates)
      .innerJoin(rooms, eq(rooms.id, roomTeammates.roomId))
      .innerJoin(users, eq(users.id, roomTeammates.userId))
      .innerJoin(memberships, and(eq(memberships.houseId, rooms.houseId), eq(memberships.userId, roomTeammates.userId)))
      .where(inArray(rooms.houseId, houseIds))
      .orderBy(asc(roomTeammates.addedAt));
    for (const r of rows) {
      const key = `${r.houseId}/${r.room}`;
      out.set(key, [...(out.get(key) ?? []), r.user]);
    }
    return out;
  }

  // Reviews done inside the house since the start of this calendar month.
  private async reviewsThisMonth(houseId: string, now: Date): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(chores)
      .where(and(eq(chores.houseId, houseId), eq(chores.status, "done"), gte(chores.doneAt, monthStart(monthOf(now)))));
    return row?.n ?? 0;
  }

  /**
   * This month's bill, as the flatmates see it. The house's monthly cost is split by room size and CPU used
   * (domain splitBill), then reviews are paid as rent (domain creditReviews): each review done this month knocks
   * REVIEW_CREDIT_FCFA off its reviewer's line, paid for by whoever let reviews go late, and by the house pool for
   * the rest. Null when the house pays nothing (the workshop) or has nobody in it.
   */
  private async bill(h: BillHouse, now: Date): Promise<BillView | null> {
    if (h.monthlyCostFcfa == null || h.memberships.length === 0) return null;
    const month = monthOf(now);
    const since = monthStart(month);

    // CPU this month per room. Samples come at a steady interval, so the sum of their percentages is proportional
    // to CPU-seconds, which is all splitBill needs (it only compares rooms with each other).
    const cpu = await this.db
      .select({ room: usageSamples.room, total: sql<number>`coalesce(sum(${usageSamples.cpuPercent}), 0)::float` })
      .from(usageSamples)
      // In a room whose lease ended this month, only what ran before that counts: the next person's CPU is on nobody's line.
      .leftJoin(leaseEnds, and(eq(leaseEnds.houseId, usageSamples.houseId), eq(leaseEnds.room, usageSamples.room), eq(leaseEnds.month, month)))
      .where(and(eq(usageSamples.houseId, h.id), gte(usageSamples.at, since), or(isNull(leaseEnds.endedAt), lt(usageSamples.at, leaseEnds.endedAt))))
      .groupBy(usageSamples.room);
    // Who pays for which room this month, added up per person: someone may rent several (leases.ts).
    const ended = await this.db.select().from(leaseEnds).where(and(eq(leaseEnds.houseId, h.id), eq(leaseEnds.month, month)));
    const billed = billedRooms(h.rooms, ended);
    let usage = h.memberships.map((m) => {
      const theirs = billed.filter((r) => r.payer === m.userId);
      return {
        memberId: m.userId,
        reservedMemoryMb: theirs.reduce((sum, r) => sum + r.memoryMb, 0),
        cpuSeconds: theirs.reduce((sum, r) => sum + (cpu.find((c) => c.room === r.name)?.total ?? 0), 0),
      };
    });
    // Nobody has a room yet (a house in the making): split evenly.
    if (usage.every((u) => u.reservedMemoryMb === 0)) usage = usage.map((u) => ({ ...u, reservedMemoryMb: 1 }));
    const shares = splitBill(h.monthlyCostFcfa, usage);

    // Reviews done this month, and reviews that went late this month (still open past due, or flagged late).
    const allChores = await this.db
      .select({ assigneeId: chores.assigneeId, repoId: chores.repoId, status: chores.status, dueAt: chores.dueAt, doneAt: chores.doneAt, lateNotedAt: chores.lateNotedAt })
      .from(chores)
      .where(and(eq(chores.houseId, h.id), or(gte(chores.doneAt, since), gte(chores.createdAt, since), and(eq(chores.status, "open"), isNotNull(chores.lateNotedAt)))));
    // A review of your own project (the room its repo is in: you live there, or teamed up on it) is no chore for the
    // house: it neither earns a credit nor counts as skipped. The rotation never asks for one; this catches a review
    // assigned before a team formed.
    const team = await this.teams([h.id]);
    const repoRooms = await this.db.select({ githubId: repos.githubId, room: repos.room }).from(repos).where(eq(repos.houseId, h.id));
    const ownProject = (c: { assigneeId: string; repoId: number }) => {
      const roomName = repoRooms.find((r) => r.githubId === c.repoId)?.room;
      const room = h.rooms.find((r) => r.name === roomName);
      if (!room?.occupantId) return false;
      return room.occupantId === c.assigneeId || (team.get(`${h.id}/${room.name}`) ?? []).some((u) => u.id === c.assigneeId);
    };
    const monthChores = allChores.filter((c) => !ownProject(c));
    const reviews = (id: string) => monthChores.filter((c) => c.assigneeId === id && c.status === "done" && c.doneAt && c.doneAt >= since).length;
    const skipped = (id: string) =>
      monthChores.filter((c) => c.assigneeId === id && ((c.lateNotedAt !== null && c.lateNotedAt >= since) || (c.status === "open" && c.dueAt < now))).length;

    const { lines, pool } = creditReviews(
      shares.map((s) => ({ memberId: s.memberId, share: s.amount, reviews: reviews(s.memberId), skipped: skipped(s.memberId) })),
      REVIEW_CREDIT_FCFA,
    );
    const paid = await this.db
      .select({ userId: billPayments.userId })
      .from(billPayments)
      .where(and(eq(billPayments.houseId, h.id), eq(billPayments.month, month)));
    // Arena prizes won this month (first places), by winner: La Coloc pays them, so they come off the winner's own
    // line without touching anyone else's or the pool.
    const ids = h.memberships.map((m) => m.userId);
    const prizes = ids.length
      ? await this.db
          .select({ userId: arenaAwards.userId, prize: arenaChallenges.prizeFcfa })
          .from(arenaAwards)
          .innerJoin(arenaChallenges, eq(arenaChallenges.id, arenaAwards.challengeId))
          .where(and(inArray(arenaAwards.userId, ids), eq(arenaAwards.place, 1), gte(arenaAwards.createdAt, since)))
      : [];
    const prizeOf = (id: string) => prizes.filter((p) => p.userId === id).reduce((sum, p) => sum + p.prize, 0);

    return {
      month,
      total: h.monthlyCostFcfa,
      reviewCredit: REVIEW_CREDIT_FCFA,
      lines: lines.map((l) => {
        const m = h.memberships.find((x) => x.userId === l.memberId)!;
        return {
          login: m.user.login,
          name: m.user.name,
          share: l.share,
          reviews: reviews(l.memberId),
          credit: l.credit,
          skipped: skipped(l.memberId),
          surcharge: l.surcharge,
          prize: Math.min(prizeOf(l.memberId), Math.max(0, l.due)),
          due: Math.max(0, l.due - prizeOf(l.memberId)),
          paid: paid.some((p) => p.userId === l.memberId),
        };
      }),
      pool,
      operators: operatorsFor(h.country),
      reference: billReference(h.id, month),
    };
  }

  /**
   * A flatmate's line of this month's bill is paid. `charge`: out of their credit (the server's first month is already
   * paid for when it comes here). Paying twice changes nothing. Returns the month and what was due.
   */
  async markBillPaid(houseId: string, userId: string, charge = false): Promise<{ month: string; amount: number }> {
    const h = await this.db.query.houses.findFirst({
      where: eq(houses.id, houseId),
      with: { rooms: true, memberships: { with: { user: true }, orderBy: [asc(memberships.tontinePosition), asc(memberships.joinedAt)] } },
    });
    if (!h) throw new NotFoundException();
    const me = h.memberships.find((m) => m.userId === userId);
    if (!me) throw new ConflictException("Only flatmates pay this house's bill.");
    const bill = await this.bill(h, new Date());
    if (!bill) throw new ConflictException("This house has no bill to pay.");
    const line = bill.lines.find((l) => l.login === me.user.login)!;
    if (charge && !line.paid && line.due > 0) await this.credit.spend(userId, line.due, "rent", `bill:${houseId}:${bill.month}:${userId}`);
    await this.db.insert(billPayments).values({ houseId, userId, month: bill.month, amount: line.due }).onConflictDoNothing();
    this.changes.next(houseId);
    return { month: bill.month, amount: line.due };
  }

  private async openChores(houseId: string): Promise<ChoreView[]> {
    const author = alias(users, "author");
    const rows = await this.db
      .select({ c: chores, assignee: users, author })
      .from(chores)
      .innerJoin(users, eq(users.id, chores.assigneeId))
      .leftJoin(author, eq(author.id, chores.authorId))
      .where(and(eq(chores.houseId, houseId), eq(chores.status, "open")))
      .orderBy(asc(chores.dueAt));
    const now = Date.now();
    return rows.map(({ c, assignee, author: a }) => ({
      id: c.id,
      repo: c.repoFullName,
      prNumber: c.prNumber,
      prTitle: c.prTitle,
      prUrl: c.prUrl,
      assignee: person(assignee)!,
      author: person(a),
      dueAt: c.dueAt.toISOString(),
      late: c.dueAt.getTime() < now,
    }));
  }

  // Reviews given and received, per flatmate: what the exchange looks like from outside.
  private async ledger(houseId: string, members: { id: string; login: string }[]): Promise<LedgerLine[]> {
    const done = await this.db
      .select({ assigneeId: chores.assigneeId, authorId: chores.authorId })
      .from(chores)
      .where(and(eq(chores.houseId, houseId), eq(chores.status, "done")));
    return members.map((m) => ({
      login: m.login,
      given: done.filter((d) => d.assigneeId === m.id).length,
      received: done.filter((d) => d.authorId === m.id).length,
    }));
  }

  /** A room's occupant as notes name them (people read names, never room slugs): their name, else their login, else "A free room" (nobody lives there). */
  async occupantName(userId: string | null): Promise<string> {
    if (!userId) return "A free room";
    const [u] = await this.db.select({ name: users.name, login: users.login }).from(users).where(eq(users.id, userId));
    return u?.name ?? u?.login ?? "A free room";
  }

  // Pins a note on a house's fridge door (collapsing repeats) and tells live pages.
  async note(houseId: string, draft: Draft) {
    await this.addNote(houseId, draft);
    this.changes.next(houseId);
  }

  private async addNote(houseId: string, draft: Draft) {
    const since = new Date(Date.now() - NOTE_COLLAPSE_MS);
    const [same] = await this.db
      .select()
      .from(fridgeNotes)
      .where(and(eq(fridgeNotes.houseId, houseId), eq(fridgeNotes.text, draft.text), gt(fridgeNotes.at, since)))
      .orderBy(desc(fridgeNotes.at))
      .limit(1);
    if (same) {
      // A room crash-looping shouldn't paper the whole fridge: bump the existing note instead.
      await this.db.update(fridgeNotes).set({ count: same.count + 1, at: new Date() }).where(eq(fridgeNotes.id, same.id));
      return;
    }
    await this.db.insert(fridgeNotes).values({ id: randomUUID().slice(0, 8), houseId, room: draft.room ?? null, tone: draft.tone, text: draft.text });
  }
}

type MemberRow = typeof memberships.$inferSelect & { user: UserRow };
type RoomRow = typeof rooms.$inferSelect;
// What the bill needs of a house: its cost, country, rooms and flatmates (in tontine order).
type BillHouse = typeof houses.$inferSelect & { rooms: RoomRow[]; memberships: MemberRow[] };

// The tontine at `now`: members come in tontine order, and the turn passes every fortnight (see money.ts).
function tontineTurnOf(members: MemberRow[], now: Date) {
  const turn = tontineTurn(members.map((m) => m.userId), TONTINE_ANCHOR, now.getTime());
  if (!turn) return null;
  const byId = (id: string) => members.find((m) => m.userId === id)!;
  return { current: byId(turn.current), line: turn.line.map(byId), until: new Date(turn.until) };
}

// What someone builds, for the tontine's line: the first of their rooms that has a project in it.
function projectOf(rs: RoomRow[], userId: string): string | null {
  return rs.find((r) => r.occupantId === userId && r.project)?.project ?? null;
}

function tontineView(members: MemberRow[], rs: RoomRow[], now: Date): TontineView | null {
  const turn = tontineTurnOf(members, now);
  if (!turn) return null;
  return {
    current: { ...person(turn.current.user)!, project: projectOf(rs, turn.current.userId) },
    line: turn.line.map((m) => person(m.user)!),
    until: turn.until.toISOString(),
  };
}

function cityTontine(members: MemberRow[], rs: RoomRow[], now: Date) {
  const turn = tontineTurnOf(members, now);
  if (!turn) return null;
  return { login: turn.current.user.login, name: turn.current.user.name, project: projectOf(rs, turn.current.userId) };
}

function deploymentView(d: typeof deployments.$inferSelect): DeploymentView {
  return { id: d.id, room: d.room, kind: d.kind, ref: d.ref, status: d.status, detail: d.detail, updatedAt: d.updatedAt.toISOString() };
}

// Repo URLs may carry a GitHub token; never store or show it.
export function redactToken(url: string): string {
  return url.replace(/(https:\/\/)[^@\/\s]+@/, "$1***@");
}
