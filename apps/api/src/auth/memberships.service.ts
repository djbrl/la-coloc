import { Inject, Injectable } from "@nestjs/common";
import { applications, type Db, houses, type MemberRole, memberships, rooms } from "@coloc/db";
import { and, asc, eq } from "drizzle-orm";
import { badgesOf } from "../arena/badges";
import { DB } from "../db/db.module";

// Which houses someone belongs to, and in which rooms (the tutorial's workshop doesn't count: it's practice),
// and where they're knocking, and the Arena titles they've won.
@Injectable()
export class MembershipsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async housesOf(userId: string) {
    const rows = await this.db
      .select({ id: houses.id, name: houses.name, role: memberships.role, room: rooms.name })
      .from(memberships)
      .innerJoin(houses, eq(houses.id, memberships.houseId))
      .leftJoin(rooms, and(eq(rooms.houseId, memberships.houseId), eq(rooms.occupantId, userId)))
      .where(and(eq(memberships.userId, userId), eq(houses.tutorial, false)))
      .orderBy(asc(rooms.name));
    // One row per room: put together per house. `room` is their first, `rooms` all of them.
    const byHouse = new Map<string, { id: string; name: string; role: MemberRole; room: string | null; rooms: string[] }>();
    for (const { room, ...house } of rows) {
      const entry = byHouse.get(house.id) ?? { ...house, room: null, rooms: [] };
      byHouse.set(house.id, entry);
      if (room) {
        entry.room ??= room;
        entry.rooms.push(room);
      }
    }
    // A house they're on their way out of (no room left) comes after one they live in.
    return [...byHouse.values()].sort((a, b) => Number(!a.room) - Number(!b.room));
  }

  /** Someone's knocks still waiting for a vote: which house, which room. */
  async openKnocks(userId: string) {
    return this.db
      .select({ id: applications.id, houseId: applications.houseId, room: applications.room })
      .from(applications)
      .where(and(eq(applications.applicantId, userId), eq(applications.status, "open")))
      .orderBy(asc(applications.createdAt));
  }

  /** Every Arena title someone has won, newest first, each with the id that wears it (PUT /api/me/badge). */
  async badges(userId: string) {
    return badgesOf(this.db, userId);
  }
}
