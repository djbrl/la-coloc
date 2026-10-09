import { Inject, Injectable } from "@nestjs/common";
import { type Db, houses, memberships, rooms } from "@coloc/db";
import { and, eq } from "drizzle-orm";
import { DB } from "../db/db.module";

// Which houses someone belongs to, and in which room. The tutorial's workshop doesn't count: it's practice.
@Injectable()
export class MembershipsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async housesOf(userId: string) {
    const rows = await this.db
      .select({ id: houses.id, name: houses.name, role: memberships.role, room: rooms.name })
      .from(memberships)
      .innerJoin(houses, eq(houses.id, memberships.houseId))
      .leftJoin(rooms, and(eq(rooms.houseId, memberships.houseId), eq(rooms.occupantId, userId)))
      .where(and(eq(memberships.userId, userId), eq(houses.tutorial, false)));
    return rows;
  }
}
