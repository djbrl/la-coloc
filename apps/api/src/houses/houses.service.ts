import { Inject, Injectable } from "@nestjs/common";
import {
  applications,
  chores,
  type Db,
  deployments,
  fridgeNotes,
  houses,
  memberships,
  rooms,
  type RoomStatus,
  usageSamples,
  users,
} from "@coloc/db";
import type { DeployKind, DeployStatus, RoomEvent, RoomsSnapshot, Usage } from "@coloc/protocol";
import { and, asc, desc, eq, gt } from "drizzle-orm";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { Subject } from "rxjs";
import { DB } from "../db/db.module";
import { channelMessages, houseChannel, openDoorbell } from "../doorbell/queries";
import { type Draft, noteForDeploy, noteForRoomEvent } from "./fridge";
import { alias } from "drizzle-orm/pg-core";
import type { ChoreView, CityView, DeploymentView, DoorbellItem, FridgeNoteView, HouseView, LedgerLine, MessageView, PersonView, RoomUsage } from "./house.types";

const NOTE_COLLAPSE_MS = 10 * 60 * 1000;
const RECENT = 20;

type UserRow = typeof users.$inferSelect;

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function person(u: Pick<UserRow, "login" | "name" | "avatarUrl"> | null | undefined): PersonView | null {
  return u ? { login: u.login, name: u.name, avatarUrl: u.avatarUrl } : null;
}

@Injectable()
export class HousesService {
  // Pings live pages (house page, city) with the id of the house that changed.
  readonly changes = new Subject<string>();
  // Live-only state: rebuilt when agents reconnect, so it isn't worth a database write.
  private online = new Set<string>();
  private usage = new Map<string, Map<string, RoomUsage>>();

  constructor(@Inject(DB) private readonly db: Db) {}

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

  async createDeployment(houseId: string, room: string, kind: DeployKind, repo: string, ref: string, requestedBy?: string): Promise<DeploymentView> {
    const id = randomUUID().slice(0, 8);
    const [d] = await this.db
      .insert(deployments)
      .values({ id, houseId, room, kind, repo: redactToken(repo), ref, status: "queued", requestedBy })
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

  async recordDeployStatus(houseId: string, s: DeployStatus) {
    const [d] = await this.db
      .update(deployments)
      .set({ status: s.status, detail: s.detail ?? null, updatedAt: new Date() })
      .where(and(eq(deployments.id, s.deployId), eq(deployments.houseId, houseId)))
      .returning();
    const room = await this.room(houseId, s.room);
    if (room && d?.kind === "prod") {
      if (s.status === "live") {
        await this.db.update(rooms).set({ status: "live", url: s.url ?? null }).where(eq(rooms.id, room.id));
      } else if (s.status === "failed" && room.status !== "live") {
        await this.db.update(rooms).set({ status: "failed" }).where(eq(rooms.id, room.id));
      }
    }
    const note = room ? noteForDeploy(s, await this.flatmateName(room.occupantId, room.name)) : null;
    if (note) await this.addNote(houseId, note);
    this.changes.next(houseId);
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
    await this.addNote(houseId, noteForRoomEvent(e, await this.flatmateName(room.occupantId, room.name)));
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

  // The agent's word is the truth about what's running: rebuild room status from it.
  async applySnapshot(houseId: string, snap: RoomsSnapshot) {
    const all = await this.db.select().from(rooms).where(eq(rooms.houseId, houseId));
    for (const room of all) {
      const prod = snap.rooms.find((r) => r.room === room.name && r.kind === "prod");
      const next = prod
        ? { status: (prod.state === "running" ? "live" : "down") as RoomStatus, url: prod.url }
        : { status: (room.status === "deploying" ? "deploying" : "empty") as RoomStatus, url: null };
      if (next.status !== room.status || next.url !== room.url) await this.db.update(rooms).set(next).where(eq(rooms.id, room.id));
    }
    this.changes.next(houseId);
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

    const mine = viewerId ? h.memberships.find((m) => m.userId === viewerId) : undefined;
    const viewerRow = viewerId ? (mine?.user ?? (await this.db.query.users.findFirst({ where: eq(users.id, viewerId) }))) : undefined;
    const live = this.usage.get(houseId);

    let recentDeployments: DeploymentView[] | null = null;
    let notes: FridgeNoteView[] | null = null;
    let doorbell: DoorbellItem[] | null = null;
    let channel: MessageView[] | null = null;
    let openChores: ChoreView[] | null = null;
    let myApplication: string | null = null;
    if (mine) {
      const ds = await this.db.select().from(deployments).where(eq(deployments.houseId, houseId)).orderBy(desc(deployments.createdAt)).limit(RECENT);
      const ns = await this.db.select().from(fridgeNotes).where(eq(fridgeNotes.houseId, houseId)).orderBy(desc(fridgeNotes.at)).limit(RECENT);
      recentDeployments = ds.map(deploymentView);
      notes = ns.map((n) => ({ id: n.id, tone: n.tone, text: n.text, room: n.room, at: n.at.toISOString(), count: n.count }));
      doorbell = await openDoorbell(this.db, houseId, h.memberships.length);
      channel = await channelMessages(this.db, houseChannel(houseId));
      openChores = await this.openChores(houseId);
    } else if (viewerId) {
      const [app] = await this.db
        .select({ id: applications.id })
        .from(applications)
        .where(and(eq(applications.houseId, houseId), eq(applications.applicantId, viewerId), eq(applications.status, "open")));
      myApplication = app?.id ?? null;
    }

    return {
      id: h.id,
      name: h.name,
      city: h.city,
      country: h.country,
      tagline: h.tagline,
      status: h.status,
      demo: h.demo,
      domain: h.domain,
      agentOnline: this.online.has(h.id),
      monthlyCostFcfa: h.monthlyCostFcfa,
      rules: h.rules,
      chef: person(h.chef),
      members: h.memberships.map((m) => ({ ...person(m.user)!, role: m.role })),
      rooms: h.rooms.map((r) => ({
        name: r.name,
        limits: { memoryMb: r.memoryMb, cpus: r.cpus },
        status: r.status,
        url: r.url,
        project: r.project,
        projectDescription: r.projectDescription,
        ad: r.occupantId ? null : r.ad,
        occupant: person(r.occupant),
        usage: live?.get(r.name) ?? null,
      })),
      viewer: viewerRow
        ? {
            login: viewerRow.login,
            member: !!mine,
            role: mine?.role ?? null,
            room: h.rooms.find((r) => r.occupantId === viewerId)?.name ?? null,
            application: myApplication,
          }
        : null,
      deployments: recentDeployments,
      notes,
      doorbell,
      channel,
      chores: openChores,
      ledger: await this.ledger(houseId, h.memberships.map((m) => ({ id: m.userId, login: m.user.login }))),
    };
  }

  // Every house, as the city draws it. Real houses first, then the busiest.
  async city(): Promise<CityView> {
    const all = await this.db.query.houses.findMany({
      with: { rooms: { with: { occupant: true }, orderBy: asc(rooms.name) } },
      orderBy: [asc(houses.demo), asc(houses.createdAt)],
    });
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
        rooms: h.rooms.map((r) => ({ name: r.name, status: r.status, project: r.project, ad: r.occupantId ? null : r.ad, occupant: person(r.occupant) })),
      })),
    };
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

  private async flatmateName(userId: string | null, roomName: string): Promise<string> {
    if (!userId) return roomName;
    const [u] = await this.db.select({ name: users.name, login: users.login }).from(users).where(eq(users.id, userId));
    return u?.name ?? u?.login ?? roomName;
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

function deploymentView(d: typeof deployments.$inferSelect): DeploymentView {
  return { id: d.id, room: d.room, kind: d.kind, ref: d.ref, status: d.status, detail: d.detail, updatedAt: d.updatedAt.toISOString() };
}

// Repo URLs may carry a GitHub token; never store or show it.
export function redactToken(url: string): string {
  return url.replace(/(https:\/\/)[^@\/\s]+@/, "$1***@");
}
